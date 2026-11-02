import type { ModelPrice } from "./types";

/**
 * List prices, USD per 1M tokens. Kept as a local, editable table on purpose:
 * pricing is the most fragile layer of any cost dashboard, so it should be
 * reviewable in one place rather than hidden inside a provider SDK.
 *
 * Sources: Anthropic, OpenAI, Google, DeepSeek, xAI and OpenRouter model pages
 * (retrieved Nov 2026). Override entries here when a vendor changes rates.
 */
export const PRICING: Record<string, ModelPrice> = {
  // Anthropic
  "claude-opus-4-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, label: "Claude Opus 4.5", vendor: "Anthropic" },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, label: "Claude Sonnet 4.5", vendor: "Anthropic" },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25, label: "Claude Haiku 4.5", vendor: "Anthropic" },
  "claude-opus-4-1": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75, label: "Claude Opus 4.1", vendor: "Anthropic" },

  // OpenAI
  "gpt-5.1": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25, label: "GPT-5.1", vendor: "OpenAI" },
  "gpt-5.1-codex": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.25, label: "GPT-5.1 Codex", vendor: "OpenAI" },
  "gpt-5-mini": { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0.25, label: "GPT-5 mini", vendor: "OpenAI" },
  "gpt-4.1": { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2, label: "GPT-4.1", vendor: "OpenAI" },
  "gpt-4o": { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 2.5, label: "GPT-4o", vendor: "OpenAI" },

  // Google
  "gemini-2.5-pro": { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: 1.25, label: "Gemini 2.5 Pro", vendor: "Google" },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cacheRead: 0.075, cacheWrite: 0.3, label: "Gemini 2.5 Flash", vendor: "Google" },

  // DeepSeek
  "deepseek-v3.2": { input: 0.28, output: 0.42, cacheRead: 0.028, cacheWrite: 0.28, label: "DeepSeek V3.2", vendor: "DeepSeek" },
  "deepseek-reasoner": { input: 0.28, output: 0.42, cacheRead: 0.028, cacheWrite: 0.28, label: "DeepSeek Reasoner", vendor: "DeepSeek" },

  // xAI
  "grok-4": { input: 3, output: 15, cacheRead: 0.75, cacheWrite: 3, label: "Grok 4", vendor: "xAI" },

  // Open weights / gateways
  "qwen3-coder": { input: 0.4, output: 1.6, cacheRead: 0.04, cacheWrite: 0.4, label: "Qwen3 Coder", vendor: "Alibaba" },
  "llama-4-scout": { input: 0.18, output: 0.59, cacheRead: 0.018, cacheWrite: 0.18, label: "Llama 4 Scout", vendor: "Meta" },
  "llama-4-maverick": { input: 0.27, output: 0.85, cacheRead: 0.027, cacheWrite: 0.27, label: "Llama 4 Maverick", vendor: "Meta" },
  "gpt-oss-120b": { input: 0.15, output: 0.6, cacheRead: 0.015, cacheWrite: 0.15, label: "GPT-OSS 120B", vendor: "OpenAI" },
  "kimi-k2": { input: 0.6, output: 2.5, cacheRead: 0.06, cacheWrite: 0.6, label: "Kimi K2", vendor: "Moonshot" },
  "mistral-large": { input: 2, output: 6, cacheRead: 0.2, cacheWrite: 2, label: "Mistral Large", vendor: "Mistral" },

  // Custom / unknown fallback (deliberately visible, not silently zero)
  "custom-model": { input: 1, output: 3, cacheRead: 0.1, cacheWrite: 1, label: "Custom model", vendor: "Custom" },
};

export const UNKNOWN_MODEL_KEY = "custom-model";

export function normalizeModelId(model: string): string {
  return model.trim().toLowerCase().replace(/\s+/g, "-");
}

export function priceFor(model: string): ModelPrice {
  const id = normalizeModelId(model);
  if (PRICING[id]) return PRICING[id];
  // tolerate dated snapshots such as gpt-5.1-2026-01-15 / claude-sonnet-4-5@20260101
  const base = Object.keys(PRICING)
    .filter((key) => id.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return base ? PRICING[base] : PRICING[UNKNOWN_MODEL_KEY];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Cost in USD for a normalized usage record. */
export function estimateCost(model: string, usage: TokenUsage): number {
  const p = priceFor(model);
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const uncached = Math.max(0, usage.inputTokens - cacheRead - cacheWrite);
  return (
    (uncached * p.input +
      cacheRead * p.cacheRead +
      cacheWrite * p.cacheWrite +
      usage.outputTokens * p.output) /
    1_000_000
  );
}

/** API-equivalent value, used for subscription sources where marginal cost is zero. */
export function apiEquivalentCost(model: string, usage: TokenUsage): number {
  return estimateCost(model, usage);
}
