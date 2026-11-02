"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { Icon } from "./ui/Icon";
import { Monogram, StatusChip } from "./ui/Panel";

interface CatalogEntry {
  id: string;
  name: string;
  short: string;
  vendor: string;
  color: string;
  description: string;
  kind: string;
  planLabel: string;
  authEnv: string[];
  docsUrl: string;
  enabled: boolean;
  simulated: boolean;
  custom: boolean;
}

interface Preset {
  id: string;
  name: string;
  short: string;
  vendor: string;
  color: string;
  authEnv: string;
  docsUrl: string;
}

interface CatalogResponse {
  providers: CatalogEntry[];
  presets: Preset[];
  ingestUrl: string;
  ingestTokenRequired: boolean;
}

const PALETTE = ["#d3fb52", "#f0abfc", "#7dd3fc", "#fbbf24", "#f87171", "#34d399", "#c4b5fd", "#fdba74"];

export function SourceDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [tab, setTab] = useState<"catalog" | "custom">("catalog");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: "", baseUrl: "", keyEnv: "", color: PALETTE[0] });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/providers", { cache: "no-store" });
      setCatalog((await response.json()) as CatalogResponse);
    } catch {
      setError("Could not load the provider catalog.");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTab("catalog");
    setCopied(false);
    void load();
  }, [open, load]);

  const run = async (key: string, body: Record<string, unknown>, method: "POST" | "PATCH") => {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch("/api/providers", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; state?: CatalogResponse };
      if (data.state) setCatalog(data.state);
      if (!response.ok || data.ok === false) setError(data.error ?? "The provider action failed.");
      onChanged();
    } catch {
      setError("The request failed. Check the dev server logs.");
    } finally {
      setBusy(null);
    }
  };

  const addCustom = async () => {
    if (!form.name.trim()) {
      setError("Give the custom source a name first.");
      return;
    }
    await run("custom", form, "POST");
    setForm({ name: "", baseUrl: "", keyEnv: "", color: PALETTE[(PALETTE.indexOf(form.color) + 1) % PALETTE.length] });
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:4310";
  const snippet = `curl -X POST ${origin}/api/ingest \\
  -H 'content-type: application/json' \\
  -d '{"providerId":"${catalog?.providers.find((provider) => provider.custom)?.id ?? "custom-source"}","model":"qwen3-coder","inputTokens":1200,"outputTokens":480}'`;

  const providers = catalog?.providers ?? [];
  const enabled = providers.filter((provider) => provider.enabled);
  const disabled = providers.filter((provider) => !provider.enabled);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect sources"
      subtitle="Unlimited providers, one contract. Official APIs, local subscription logs, or any gateway."
      width="max-w-[820px]"
      footer={
        <>
          <span className="flex items-center gap-1.5 text-[9.5px] text-faint">
            <Icon name="shield" size={11} />
            Keys live in .env.local — this dashboard never stores secrets.
          </span>
          <button type="button" className="btn btn-ghost !py-1.5 text-[10.5px]" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-black/25 p-0.5">
        <button type="button" className="range-tab !px-3" data-active={tab === "catalog"} onClick={() => setTab("catalog")}>
          Catalog
        </button>
        <button type="button" className="range-tab !px-3" data-active={tab === "custom"} onClick={() => setTab("custom")}>
          Custom gateway
        </button>
        <span className="ml-auto pr-2 font-mono text-[8.5px] text-faint">
          {enabled.length} enabled / {providers.length} known
        </span>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-ember/20 bg-ember/[0.06] px-3 py-2 text-[10.5px] text-ember/90">
          {error}
        </div>
      ) : null}

      {tab === "catalog" ? (
        <div className="mt-4">
          <div className="space-y-1.5">
            {enabled.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                busy={busy === provider.id}
                onToggle={() => run(provider.id, { id: provider.id, enabled: false }, "PATCH")}
              />
            ))}
          </div>

          {disabled.length ? (
            <>
              <div className="mt-5 flex items-center gap-2">
                <span className="label text-[8px]">Available</span>
                <span className="h-px flex-1 bg-white/[0.06]" />
              </div>
              <div className="mt-2 space-y-1.5">
                {disabled.map((provider) => (
                  <ProviderRow
                    key={provider.id}
                    provider={provider}
                    busy={busy === provider.id}
                    onToggle={() => run(provider.id, { id: provider.id }, "POST")}
                  />
                ))}
              </div>
            </>
          ) : null}

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.018] px-3.5 py-3">
            <Icon name="database" size={13} className="mt-0.5 shrink-0 text-faint" />
            <p className="text-[10px] leading-relaxed text-faint">
              Usage and cost endpoints need organization admin keys (Anthropic <span className="font-mono text-fog">sk-ant-admin01-…</span>,
              OpenAI <span className="font-mono text-fog">sk-admin-…</span>). Local subscription sources read token metadata from
              Claude Code and Codex transcripts — prompt content is never parsed.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="label text-[8px]">One-click providers</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {catalog?.presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => run(`preset-${preset.id}`, { presetId: preset.id }, "POST")}
                disabled={busy === `preset-${preset.id}`}
                className="group flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-white/[0.14] hover:bg-white/[0.04] disabled:opacity-50"
              >
                <Monogram short={preset.short} color={preset.color} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-ivory/85">{preset.name}</span>
                  <span className="mt-0.5 block truncate font-mono text-[8px] text-faint">{preset.authEnv}</span>
                </span>
                <Icon name="plus" size={13} className="text-faint transition group-hover:text-signal" />
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2">
            <span className="label text-[8px]">Define a custom source</span>
            <span className="h-px flex-1 bg-white/[0.06]" />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Display name">
              <input
                className="input"
                placeholder="e.g. Local vLLM"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="API env variable">
              <input
                className="input font-mono !text-[11px]"
                placeholder="e.g. VLLM_API_KEY"
                value={form.keyEnv}
                onChange={(event) => setForm((current) => ({ ...current, keyEnv: event.target.value }))}
              />
            </Field>
            <Field label="Base URL (optional)">
              <input
                className="input font-mono !text-[11px]"
                placeholder="https://gateway.example.com/v1"
                value={form.baseUrl}
                onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
              />
            </Field>
            <Field label="Accent">
              <div className="flex h-[38px] flex-wrap items-center gap-1.5">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, color }))}
                    className="h-5 w-5 rounded-md border transition"
                    style={{
                      background: `${color}22`,
                      borderColor: form.color === color ? color : "rgba(255,255,255,.1)",
                      boxShadow: form.color === color ? `0 0 10px ${color}55` : undefined,
                    }}
                    aria-label={`Use ${color} as accent`}
                  >
                    <span className="mx-auto block h-2 w-2 rounded-full" style={{ background: color }} />
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <button
            type="button"
            className="btn btn-primary mt-4"
            onClick={addCustom}
            disabled={busy === "custom"}
          >
            <Icon name="plus" size={13} />
            {busy === "custom" ? "Adding…" : "Add custom source"}
          </button>

          <div className="mt-5 rounded-xl border border-white/[0.07] bg-black/25 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Icon name="terminal" size={12} className="text-faint" />
                <span className="label text-[8px]">Gateway ingest</span>
              </div>
              <button
                type="button"
                className="btn btn-quiet !p-1.5"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(snippet);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1800);
                  } catch {
                    setError("Clipboard access was blocked by the browser.");
                  }
                }}
              >
                <Icon name={copied ? "check" : "copy"} size={12} />
              </button>
            </div>
            <pre className="scroll-thin mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[9.5px] leading-relaxed text-fog/75">
              {snippet}
            </pre>
            <p className="mt-2 text-[9px] text-faint">
              Send one event or an array to <span className="font-mono text-fog/80">{origin}/api/ingest</span>. Add{" "}
              <span className="font-mono text-fog/80">GATEWAY_INGEST_TOKEN</span> in .env.local to require a bearer token.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ProviderRow({
  provider,
  busy,
  onToggle,
}: {
  provider: CatalogEntry;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.018] px-3 py-2.5 transition hover:border-white/[0.11] hover:bg-white/[0.032]">
      <Monogram short={provider.short} color={provider.color} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] text-ivory/90">{provider.name}</span>
          {provider.enabled ? <StatusChip status={provider.simulated ? "demo" : "live"} /> : null}
          {provider.custom ? <span className="chip text-[7.5px]">CUSTOM</span> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] text-faint">
          <span className="truncate">{provider.description}</span>
          {provider.authEnv.length ? (
            <>
              <span className="text-white/15">·</span>
              <span className="font-mono">{provider.authEnv.join(" / ")}</span>
            </>
          ) : null}
        </div>
      </div>
      {provider.docsUrl ? (
        <a
          href={provider.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="hidden text-faint transition hover:text-ivory sm:block"
          title="Open provider docs"
        >
          <Icon name="external" size={12} />
        </a>
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        className={`btn !px-2.5 !py-1.5 text-[10px] ${provider.enabled ? "btn-ghost" : "btn-primary"}`}
      >
        {busy ? "…" : provider.enabled ? "Disable" : "Enable"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label text-[8px]">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
