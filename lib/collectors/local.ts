import { createReadStream, promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { clamp } from "../format";
import { estimateCost } from "../pricing";
import type { QuotaWindow, UsageEvent } from "../types";
import type { LocalScanResult } from "./types";

/**
 * Local subscription usage.
 *
 * Claude Code and Codex write append-only JSONL transcripts. We read only the
 * usage metadata (token counts, model, timestamps) — never prompt content —
 * and dedupe by message id because a streamed assistant turn can be written
 * as several lines that repeat the same usage object.
 */

const MAX_FILES = 1200;
const MAX_FILE_BYTES = 24 * 1024 * 1024;

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listJsonl(root: string, sinceMs: number, depth = 0): Promise<string[]> {
  if (depth > 9) return [];
  const found: { file: string; mtime: number }[] = [];
  let entries: Dirent[];
  try {
    entries = (await fs.readdir(root, { withFileTypes: true })) as Dirent[];
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (found.length >= MAX_FILES) break;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await listJsonl(target, sinceMs, depth + 1)).map((file) => ({ file, mtime: 0 })));
      continue;
    }
    if (!entry.name.endsWith(".jsonl")) continue;
    try {
      const stat = await fs.stat(target);
      if (stat.mtimeMs < sinceMs || stat.size > MAX_FILE_BYTES) continue;
      found.push({ file: target, mtime: stat.mtimeMs });
    } catch {
      // unreadable file, skip
    }
  }
  found.sort((a, b) => b.mtime - a.mtime);
  return found.slice(0, MAX_FILES).map((row) => row.file);
}

function parseTimestamp(value: unknown): number {
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeUtilization(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const pct = value <= 1 ? value * 100 : value;
  if (pct > 101) return null;
  return clamp(pct, 0, 100);
}

function quotaFromWindow(
  id: string,
  label: string,
  raw: unknown,
  windowSeconds: number,
  provenance: QuotaWindow["provenance"],
  note: string,
): QuotaWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const used = normalizeUtilization(
    record.used_percentage ?? record.used_percent ?? record.utilization ?? record.usedPct,
  );
  if (used === null) return null;
  const resetRaw = record.resets_at ?? record.reset_at ?? record.resetAt;
  const resetsAt = parseTimestamp(resetRaw) || null;
  return { id, label, usedPct: used, windowSeconds, resetsAt, provenance, note };
}

/* ------------------------------------------------------------------ */
/* Claude Code                                                         */
/* ------------------------------------------------------------------ */

export function claudeBaseDirs(): string[] {
  const configured = process.env.CLAUDE_CONFIG_DIR;
  if (configured) {
    return configured
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [path.join(os.homedir(), ".claude"), path.join(os.homedir(), ".config", "claude")];
}

async function readClaudeQuota(): Promise<QuotaWindow[] | undefined> {
  const paths = [
    path.join(os.homedir(), ".claude-monitor", "statusline", "latest.json"),
    ...claudeBaseDirs().map((dir) => path.join(dir, "monitor", "statusline", "latest.json")),
  ];
  for (const file of paths) {
    try {
      const raw = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
      const windows = [
        quotaFromWindow("five_hour", "Session", raw.five_hour, 5 * 3600, "official", "Claude Code statusline"),
        quotaFromWindow("seven_day", "Weekly", raw.seven_day, 7 * 24 * 3600, "official", "Claude Code statusline"),
      ].filter((window): window is QuotaWindow => Boolean(window));
      if (windows.length) return windows;
    } catch {
      // try next path
    }
  }
  return undefined;
}

let oauthCache: { at: number; quota: QuotaWindow[] } | null = null;

async function readClaudeOAuthQuota(): Promise<QuotaWindow[] | undefined> {
  if (oauthCache && Date.now() - oauthCache.at < 180_000) return oauthCache.quota;
  let token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) {
    for (const dir of claudeBaseDirs()) {
      try {
        const credentials = JSON.parse(await fs.readFile(path.join(dir, ".credentials.json"), "utf8")) as {
          claudeAiOauth?: { accessToken?: string };
          accessToken?: string;
        };
        token = credentials.claudeAiOauth?.accessToken ?? credentials.accessToken;
        if (token) break;
      } catch {
        // no credentials here
      }
    }
  }
  if (!token) return undefined;

  try {
    const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "claude-code/2.1.0",
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) return undefined;
    const data = (await response.json()) as Record<string, unknown>;
    const windows = [
      quotaFromWindow("five_hour", "Session", data.five_hour, 5 * 3600, "experimental", "Anthropic OAuth usage"),
      quotaFromWindow("seven_day", "Weekly", data.seven_day, 7 * 24 * 3600, "experimental", "Anthropic OAuth usage"),
      quotaFromWindow("seven_day_opus", "Opus weekly", data.seven_day_opus, 7 * 24 * 3600, "experimental", "Anthropic OAuth usage"),
    ].filter((window): window is QuotaWindow => Boolean(window));
    if (windows.length) {
      oauthCache = { at: Date.now(), quota: windows };
      return windows;
    }
  } catch {
    // The endpoint is undocumented; silent fallback to local estimates.
  }
  return undefined;
}

export async function scanClaudeLogs(now = Date.now()): Promise<LocalScanResult> {
  const since = now - 48 * 3_600_000;
  const files: string[] = [];
  for (const dir of claudeBaseDirs()) {
    const projects = path.join(dir, "projects");
    const target = (await exists(projects)) ? projects : dir;
    files.push(...(await listJsonl(target, since)));
    if (files.length >= MAX_FILES) break;
  }

  const entries = new Map<string, { event: UsageEvent; tokens: number }>();

  for (const file of files) {
    try {
      const rl = readline.createInterface({
        input: createReadStream(file, { encoding: "utf8" }),
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (!line.includes('"usage"')) continue;
        let obj: Record<string, any>;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        const message = obj.message;
        const usage = message?.usage ?? obj.usage;
        if (!usage) continue;
        const at = parseTimestamp(obj.timestamp ?? message?.timestamp);
        if (!at || at < since) continue;
        const model = message?.model ?? obj.model;
        if (typeof model !== "string" || !model || model.startsWith("<")) continue;

        const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
        const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
        const cacheRead = Number(
          usage.cache_read_input_tokens ?? usage.cacheReadInputTokens ?? usage.cache_read_tokens ?? 0,
        );
        const cacheWrite = Number(
          usage.cache_creation_input_tokens ??
            usage.cacheCreationInputTokens ??
            usage.cache_creation_tokens ??
            (usage.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
              (usage.cache_creation?.ephemeral_1h_input_tokens ?? 0),
        );
        const total = inputTokens + outputTokens;
        if (total <= 0) continue;

        const messageId = message?.id ?? obj.messageId ?? obj.uuid;
        const requestId = obj.requestId ?? obj.request_id ?? "";
        const key = `${messageId ?? path.basename(file)}:${requestId}`;
        const previous = entries.get(key);
        if (previous && previous.tokens >= total) continue;

        const event: UsageEvent = {
          id: `claude:${key}`,
          at,
          providerId: "claude-max",
          model,
          inputTokens,
          outputTokens,
          cacheReadTokens: cacheRead,
          cacheWriteTokens: cacheWrite,
          requests: 1,
          source: "local",
        };
        event.costUsd = estimateCost(model, event);
        entries.set(key, { event, tokens: total });
      }
    } catch {
      // Unreadable or truncated transcript: skip the file.
    }
  }

  const quota = (await readClaudeQuota()) ?? (await readClaudeOAuthQuota());
  return {
    providerId: "claude-max",
    files: files.length,
    events: [...entries.values()].map((row) => row.event).sort((a, b) => a.at - b.at),
    quota,
    note: files.length ? `${files.length} Claude Code transcripts` : "No Claude Code transcripts found",
    scannedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* Codex CLI                                                           */
/* ------------------------------------------------------------------ */

export function codexBaseDirs(): string[] {
  const configured = process.env.CODEX_HOME;
  const base = configured ? configured.split(",").map((part) => part.trim()).filter(Boolean) : [path.join(os.homedir(), ".codex")];
  return base;
}

function codexQuota(rateLimits: any): QuotaWindow[] {
  if (!rateLimits || typeof rateLimits !== "object") return [];
  const windows: QuotaWindow[] = [];
  for (const key of ["primary", "secondary"] as const) {
    const raw = rateLimits[key];
    if (!raw || typeof raw !== "object") continue;
    const used = normalizeUtilization(raw.used_percent ?? raw.usedPct);
    if (used === null) continue;
    const windowSeconds = Number(raw.window_minutes ?? 0) * 60 || Number(raw.limit_window_seconds ?? 0) || 0;
    const resetsAt = parseTimestamp(raw.resets_at ?? raw.reset_at ?? raw.resetAt) || null;
    windows.push({
      id: key,
      label: windowSeconds >= 28 * 86_400 ? "Monthly" : windowSeconds >= 6 * 86_400 ? "Weekly" : "Session",
      usedPct: used,
      windowSeconds: windowSeconds || (key === "primary" ? 5 * 3600 : 7 * 24 * 3600),
      resetsAt,
      provenance: "local",
      note: "From last Codex turn",
    });
  }
  return windows;
}

export async function scanCodexLogs(now = Date.now()): Promise<LocalScanResult> {
  const since = now - 48 * 3_600_000;
  const files: string[] = [];
  for (const base of codexBaseDirs()) {
    for (const folder of ["sessions", "archived_sessions"]) {
      const target = path.join(base, folder);
      if (await exists(target)) files.push(...(await listJsonl(target, since)));
    }
  }

  const entries = new Map<string, UsageEvent>();
  let latestQuota: QuotaWindow[] | undefined;
  let latestQuotaAt = 0;

  for (const file of files) {
    let model = "gpt-5.1-codex";
    let previousTotal = 0;
    try {
      const rl = readline.createInterface({
        input: createReadStream(file, { encoding: "utf8" }),
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (!line.includes("token_count") && !line.includes("turn_context")) continue;
        let obj: Record<string, any>;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        const payload = obj.payload;
        if (obj.type === "turn_context" && typeof payload?.model === "string") {
          model = payload.model;
          continue;
        }
        if (obj.type !== "event_msg" || payload?.type !== "token_count") continue;
        const at = parseTimestamp(obj.timestamp);
        if (!at || at < since) continue;
        const info = payload.info;
        if (!info) continue;
        const total = Number(info.total_token_usage?.total_tokens ?? 0);
        const usage = info.last_token_usage ?? info.total_token_usage;
        if (!usage) continue;
        if (total > 0 && total <= previousTotal) {
          previousTotal = total;
          continue;
        }
        previousTotal = total;
        const inputTokens = Number(usage.input_tokens ?? 0);
        const outputTokens = Number(usage.output_tokens ?? 0);
        if (inputTokens + outputTokens <= 0) continue;
        const event: UsageEvent = {
          id: `codex:${path.basename(file)}:${total || `${at}`}`,
          at,
          providerId: "codex",
          model,
          inputTokens,
          outputTokens,
          cacheReadTokens: Number(usage.cached_input_tokens ?? 0),
          requests: 1,
          source: "local",
        };
        event.costUsd = estimateCost(model, event);
        entries.set(event.id!, event);

        if (payload.rate_limits && at >= latestQuotaAt) {
          const quota = codexQuota(payload.rate_limits);
          if (quota.length) {
            latestQuota = quota;
            latestQuotaAt = at;
          }
        }
      }
    } catch {
      // Skip unreadable rollout.
    }
  }

  return {
    providerId: "codex",
    files: files.length,
    events: [...entries.values()].sort((a, b) => a.at - b.at),
    quota: latestQuota,
    note: files.length ? `${files.length} Codex rollouts` : "No Codex rollouts found",
    scannedAt: now,
  };
}
