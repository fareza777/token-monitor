# Token Monitor

A live, local-first command deck for LLM token usage, spend and subscription limits.

One screen for **every provider**: Anthropic and OpenAI organization APIs, Claude Code and Codex subscription windows, OpenRouter credits, DeepSeek balances, and any number of custom gateways. Numbers stream over Server-Sent Events every 1.5 seconds.

```
npm install
cp .env.example .env.local   # optional: add the keys you actually use
npm run dev                  # http://localhost:4310
```

The dev and production servers bind to `127.0.0.1` only. When you deliberately want to test the
responsive layout from a phone on your LAN, override the bind address:

```bash
npx next dev -H 0.0.0.0 -p 4310
```

With no credentials the dashboard runs on deterministic **simulation** and labels every demo number. Add a source and the same UI switches to real telemetry — no restart of the frontend, no second mode to learn.

---

## What is on the deck

| Area | What it answers |
| --- | --- |
| **KPI strip** | Tokens today, billable API spend, subscription-covered volume, month-to-budget pace |
| **Token throughput** | Stacked live chart by provider, toggle tokens ↔ spend, hover breakdown, click legend to isolate |
| **Limits & windows** | Claude 5-hour/weekly windows, Codex windows, OpenRouter credit and the monthly budget, with reset countdowns |
| **Provider fleet** | Per-source tokens, cost, 40-minute sparkline, share, status and provenance |
| **Live stream** | Requests, collector syncs and alerts as they land |
| **Model leaderboard** | Today by model, cost, request volume and a 7-day trend |
| **Pulse & health** | Day-end projection, subscription leverage, concentration and per-collector state |

The UI is a single deliberate theme: ink surfaces, ivory type, one lime signal color, monospaced numerals, no decorative noise.

---

## Data plane

### Provenance is a first-class concept

Every source is tagged with where its numbers came from:

- `official` — provider usage/cost/balance endpoint
- `local` — parsed from local CLI transcripts or ingest
- `experimental` — undocumented endpoint (Claude OAuth usage)
- `demo` — simulator, visibly labeled on every card and in the banner

This matters: a cost dashboard loses trust the first time a number is wrong without an explanation. Subscription quotas and API spend are separate planes and are never blended into one fake total.

### Provider support

| Provider | Signal | How |
| --- | --- | --- |
| **Anthropic API** | tokens, models, official cost | `GET /v1/organizations/usage_report/messages` + `/cost_report` (Admin key) |
| **OpenAI API** | tokens, models, requests, official cost | `GET /v1/organization/usage/completions` + `/organization/costs` (Admin key) |
| **Claude Max / Pro** | token/cost equivalents, 5-hour & weekly quota | local `~/.claude/projects/**/*.jsonl`, Claude Code statusline, optional OAuth usage endpoint |
| **ChatGPT / Codex** | token equivalents, session & weekly quota | local `~/.codex/sessions/**/rollout-*.jsonl` rate-limit snapshots |
| **OpenRouter** | spend, credit/key limits | `GET /api/v1/key`, `GET /api/v1/credits` |
| **DeepSeek** | balance | `GET /user/balance` |
| **Gemini, Groq** | ingest or simulation | these providers publish no account-level usage API |
| **xAI, Mistral, Together, Fireworks** | catalog presets + ingest | no documented per-account usage endpoint for all tiers |
| **Any gateway / vLLM / LiteLLM / custom** | unlimited events | `POST /api/ingest` |

Only usage **metadata** is read from local transcripts: token counts, model, timestamp, usage window. Prompt and completion content is never parsed, stored or transmitted.

### Local subscription tracking

Claude Code writes one append-only JSONL per session under `~/.claude/projects`. A single streamed assistant turn can appear as several lines carrying the same `message.usage`, so the parser deduplicates on `message.id` + `requestId` and keeps the most complete usage record. This is the same failure mode `ccusage` issue #888 documents — naive summing multiplies output tokens by the number of content blocks.

Codex writes rollouts under `~/.codex/sessions/YYYY/MM/DD/`. The parser reads `event_msg` → `token_count`, uses cumulative totals as a dedupe key, and extracts `rate_limits.primary/secondary` (window labels are derived from `window_minutes`, never assumed to be 5-hour).

Quota sources, in priority order:

1. Claude Code statusline capture (`~/.claude-monitor/statusline/latest.json`)
2. Anthropic OAuth usage (`/api/oauth/usage`, cached 180 s, `experimental`)
3. Codex rate-limit snapshot from the newest rollout

The Claude OAuth endpoint is undocumented and can rate-limit; failures are silent and never block the dashboard. Remove `CLAUDE_CODE_OAUTH_TOKEN` (or avoid logging in) if you do not want it called.

### Connect an official API

```bash
# .env.local
ANTHROPIC_ADMIN_KEY=sk-ant-admin01-...   # organization admin key, not a normal API key
OPENAI_ADMIN_KEY=sk-admin-...            # organization admin key
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MANAGEMENT_KEY=...            # optional, unlocks credit balance
DEEPSEEK_API_KEY=...
```

Restart the dev server after editing `.env.local`. Secrets never enter the browser, `.data/`, or git.

### Unlimited custom sources

Register a source in **Add source → Custom gateway**, then post normalized events:

```bash
curl -X POST http://localhost:4310/api/ingest \
  -H 'content-type: application/json' \
  -d '{
    "providerId": "custom-local-vllm",
    "model": "qwen3-coder",
    "inputTokens": 1200,
    "outputTokens": 480,
    "cacheReadTokens": 300,
    "requests": 1
  }'
```

Multiple events can be sent as `{ "events": [...] }`. Set `GATEWAY_INGEST_TOKEN` to require `Authorization: Bearer <token>`; without it the endpoint trusts local callers.

Pricing for unknown models falls back to a visible `custom-model` rate. Add the real rate to `lib/pricing.ts` to keep cost estimates honest.

---

## Architecture

```
app/
  page.tsx                 server snapshot → client deck
  api/stream               SSE, 1.5 s snapshots
  api/state                initial/range fetch
  api/providers            catalog + enable/disable + custom sources
  api/settings             budget and plan labels
  api/ingest               normalized usage events
components/                design system + dashboard sections
lib/
  engine.ts                singleton orchestrator + snapshot builder
  history.ts               minute/hour/day rings, per-provider model attribution
  simulator.ts             deterministic demo seeding and live ticks
  providers/catalog.ts     provider registry (unlimited custom entries)
  collectors/remote.ts     Anthropic, OpenAI, OpenRouter, DeepSeek
  collectors/local.ts      Claude Code + Codex transcript parsers
  pricing.ts               editable USD/1M token table
  store.ts                 JSON settings/provider persistence in .data/
```

Three independent cadences, deliberately decoupled:

- **Ingest** — simulator 1.5 s; local log scan 8 s; Admin APIs 60 s (their data is ~2–3 minutes delayed anyway)
- **Aggregation** — in-memory minute/hour/day buckets, rebuilt from every poll with idempotent dedupe
- **Render** — SSE 1.5 s; count-up animation and quota meters transition independently

The engine is a Node singleton stored on `globalThis`, so HMR and concurrent route handlers share one stream. `.data/` holds only settings and provider registration; usage history is reconstructed from sources at startup.

### Production notes

This build is local-first and has **no authentication**. Do not expose port 4310 to the public internet as-is. Before hosting:

1. Put it behind an authenticated reverse proxy (or add SSO).
2. Set `GATEWAY_INGEST_TOKEN`.
3. Run `npm run build && npm start`.
4. Keep admin keys in the host's secret store, never in the image.

`GET /api/stream` and `/api/state` return aggregate telemetry only — no prompts, keys or raw transcripts.

---

## Roadmap: desktop, then Android

The dashboard is intentionally the first of three surfaces:

1. **Now — web dashboard.** Next.js, local Node, SSE.
2. **Next — desktop.** Package the same app with Tauri (or Electron) and a local sidecar. The Node collector already reads local transcripts and writes `.data/`; a tray app can keep it running in the background and open the deck on demand.
3. **Then — Play Store.** Wrap the responsive deck with Capacitor, pair it to a hosted collector over an authenticated API, and keep the mobile surface read-only (alerts, quota, spend). Write path stays on desktop.

The snapshot schema (`StatePayload`) is the contract every surface consumes; keep it stable when adding clients.

---

## Reference research

The provider schemas, log formats and parsing pitfalls are documented in [`docs/RESEARCH.md`](docs/RESEARCH.md), with links to the primary sources and the open-source projects this design learned from:

- [ccusage](https://github.com/ccusage/ccusage) — local log parsing, pricing discipline, billing blocks
- [Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) — provenance labels, hybrid quota plane
- [LiteLLM](https://github.com/BerriAI/litellm), [Helicone](https://github.com/Helicone/helicone), [Langfuse](https://github.com/langfuse/langfuse) — cost registries and gateway accounting
- [OpenLLMetry](https://github.com/traceloop/openllmetry) — OTel GenAI schema
- [ccboard](https://github.com/FlorianBruniaux/ccboard) — file-watch → SSE live updates

## Scripts

```bash
npm run dev        # dev server on :4310
npm run build      # production build
npm start          # production server on :4310
npm run typecheck  # tsc --noEmit
```

## License

MIT.
