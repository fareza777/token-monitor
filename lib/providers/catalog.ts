import type { CatalogProvider } from "../types";

/**
 * Every source the collector knows how to talk to.
 *
 * The dashboard is intentionally unlimited: catalog providers can be enabled
 * or disabled, and arbitrary providers can be registered at runtime through
 * /api/providers (see lib/collectors/custom.ts). Adapters only read usage
 * metadata — never prompt content.
 */
export const CATALOG: CatalogProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic API",
    short: "AN",
    vendor: "Anthropic",
    kind: "api",
    color: "#d97757",
    planLabel: "Pay as you go",
    description: "Organization usage + cost reports through the Admin API.",
    capabilities: ["usage_api", "cost_api"],
    authEnv: ["ANTHROPIC_ADMIN_KEY"],
    docsUrl: "https://platform.claude.com/docs/en/manage-claude/usage-cost-api",
    simulation: {
      tokensPerDay: 12_500_000,
      peakiness: 0.55,
      burstiness: 0.35,
      models: [
        { id: "claude-sonnet-4-5", weight: 0.55, cacheShare: 0.38 },
        { id: "claude-opus-4-5", weight: 0.3, cacheShare: 0.32 },
        { id: "claude-haiku-4-5", weight: 0.15, cacheShare: 0.2 },
      ],
    },
  },
  {
    id: "openai",
    name: "OpenAI API",
    short: "OA",
    vendor: "OpenAI",
    kind: "api",
    color: "#19c39c",
    planLabel: "Pay as you go",
    description: "Organization completions usage and daily cost buckets.",
    capabilities: ["usage_api", "cost_api"],
    authEnv: ["OPENAI_ADMIN_KEY"],
    docsUrl: "https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/completions/",
    simulation: {
      tokensPerDay: 16_000_000,
      peakiness: 0.5,
      burstiness: 0.4,
      models: [
        { id: "gpt-5.1", weight: 0.6, cacheShare: 0.34 },
        { id: "gpt-5-mini", weight: 0.25, cacheShare: 0.22 },
        { id: "gpt-4.1", weight: 0.15, cacheShare: 0.28 },
      ],
    },
  },
  {
    id: "claude-max",
    name: "Claude Max",
    short: "CM",
    vendor: "Anthropic",
    kind: "subscription",
    color: "#e8956f",
    planLabel: "Max 20×",
    description: "Claude Code subscription windows, read from local session logs.",
    capabilities: ["local_logs", "quota_api"],
    authEnv: ["CLAUDE_CODE_OAUTH_TOKEN"],
    docsUrl: "https://code.claude.com/docs/en/monitoring-usage",
    subscription: true,
    simulation: {
      tokensPerDay: 11_000_000,
      peakiness: 0.72,
      burstiness: 0.5,
      models: [
        { id: "claude-sonnet-4-5", weight: 0.58, cacheShare: 0.46 },
        { id: "claude-opus-4-5", weight: 0.32, cacheShare: 0.42 },
        { id: "claude-haiku-4-5", weight: 0.1, cacheShare: 0.24 },
      ],
    },
  },
  {
    id: "codex",
    name: "ChatGPT / Codex",
    short: "CX",
    vendor: "OpenAI",
    kind: "subscription",
    color: "#4ade80",
    planLabel: "Plus",
    description: "Codex CLI rollout logs plus the 5-hour and weekly limits.",
    capabilities: ["local_logs", "quota_api"],
    authEnv: ["CODEX_HOME"],
    docsUrl: "https://learn.chatgpt.com/docs/developer-commands",
    subscription: true,
    simulation: {
      tokensPerDay: 8_000_000,
      peakiness: 0.68,
      burstiness: 0.55,
      models: [
        { id: "gpt-5.1-codex", weight: 0.78, cacheShare: 0.4 },
        { id: "gpt-5-mini", weight: 0.22, cacheShare: 0.26 },
      ],
    },
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    short: "OR",
    vendor: "OpenRouter",
    kind: "api",
    color: "#a78bfa",
    planLabel: "Credits",
    description: "Key-level spend, credit balance and per-model routing.",
    capabilities: ["usage_api", "balance_api"],
    authEnv: ["OPENROUTER_API_KEY", "OPENROUTER_MANAGEMENT_KEY"],
    docsUrl: "https://openrouter.ai/docs/api_reference/limits",
    simulation: {
      tokensPerDay: 6_000_000,
      peakiness: 0.4,
      burstiness: 0.3,
      models: [
        { id: "deepseek-v3.2", weight: 0.34, cacheShare: 0.3 },
        { id: "grok-4", weight: 0.16, cacheShare: 0.2 },
        { id: "qwen3-coder", weight: 0.3, cacheShare: 0.25 },
        { id: "llama-4-maverick", weight: 0.2, cacheShare: 0.2 },
      ],
    },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    short: "DS",
    vendor: "DeepSeek",
    kind: "api",
    color: "#5b8cff",
    planLabel: "Prepaid",
    description: "Balance endpoint plus locally metered token flow.",
    capabilities: ["balance_api"],
    authEnv: ["DEEPSEEK_API_KEY"],
    docsUrl: "https://api-docs.deepseek.com/api/get-user-balance/",
    simulation: {
      tokensPerDay: 4_500_000,
      peakiness: 0.38,
      burstiness: 0.25,
      models: [
        { id: "deepseek-v3.2", weight: 0.8, cacheShare: 0.5 },
        { id: "deepseek-reasoner", weight: 0.2, cacheShare: 0.4 },
      ],
    },
  },
  {
    id: "gemini",
    name: "Google Gemini",
    short: "GM",
    vendor: "Google",
    kind: "api",
    color: "#5e9bff",
    planLabel: "Pay as you go",
    description: "Gemini API usage metered locally; quota via Cloud Billing.",
    capabilities: ["usage_api"],
    authEnv: ["GEMINI_API_KEY"],
    docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
    simulation: {
      tokensPerDay: 5_000_000,
      peakiness: 0.42,
      burstiness: 0.3,
      models: [
        { id: "gemini-2.5-pro", weight: 0.42, cacheShare: 0.3 },
        { id: "gemini-2.5-flash", weight: 0.58, cacheShare: 0.26 },
      ],
    },
  },
  {
    id: "groq",
    name: "Groq",
    short: "GQ",
    vendor: "Groq",
    kind: "api",
    color: "#ff6b4a",
    planLabel: "Pay as you go",
    description: "Fast open-model inference, metered through the gateway.",
    capabilities: ["usage_api"],
    authEnv: ["GROQ_API_KEY"],
    docsUrl: "https://console.groq.com/docs/api-reference",
    simulation: {
      tokensPerDay: 3_500_000,
      peakiness: 0.35,
      burstiness: 0.2,
      models: [
        { id: "llama-4-scout", weight: 0.55, cacheShare: 0.18 },
        { id: "gpt-oss-120b", weight: 0.45, cacheShare: 0.2 },
      ],
    },
  },
];

export const CATALOG_BY_ID = new Map(CATALOG.map((p) => [p.id, p]));

export const CUSTOM_COLORS = [
  "#d3fb52",
  "#f0abfc",
  "#7dd3fc",
  "#fbbf24",
  "#f87171",
  "#34d399",
  "#c4b5fd",
  "#fdba74",
];

/** Add-provider tiles shown in the UI beyond the built-in catalog. */
export const EXTRA_OPTIONS = [
  { id: "xai", name: "xAI Grok", short: "XA", vendor: "xAI", color: "#e8e8e8", authEnv: "XAI_API_KEY", docsUrl: "https://docs.x.ai/developers/models" },
  { id: "mistral", name: "Mistral", short: "MI", vendor: "Mistral", color: "#ffb020", authEnv: "MISTRAL_API_KEY", docsUrl: "https://docs.mistral.ai" },
  { id: "together", name: "Together AI", short: "TG", vendor: "Together", color: "#8b9dff", authEnv: "TOGETHER_API_KEY", docsUrl: "https://docs.together.ai/reference/billing-usage" },
  { id: "fireworks", name: "Fireworks", short: "FW", vendor: "Fireworks", color: "#ff7a59", authEnv: "FIREWORKS_API_KEY", docsUrl: "https://docs.fireworks.ai/accounts/exporting-usage-and-costs" },
] as const;
