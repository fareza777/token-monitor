# Research dossier — multi-provider LLM usage telemetry

This is the working knowledge behind Token Monitor: official API contracts, local
log formats, the projects that solved each problem before us, and the decisions
that shaped this implementation.

Retrieved November 2026. Provider APIs change; treat every schema here as
"verified at build time", and prefer the linked documentation when something
drifts.

---

## 1. The two planes (the most important decision)

A token dashboard can fail in two opposite ways:

1. **It treats subscription usage as free.** A Claude Max user sees `$0.00` spend
   while burning through their weekly window.
2. **It treats subscription usage as API spend.** The same user sees `$480` of
   "cost" that will never appear on a card statement.

Both are misleading. Token Monitor keeps two planes separate and labels them:

| Plane | Authoritative for | Source |
| --- | --- | --- |
| **Billing** | dollars, invoices, credits | Anthropic/OpenAI Admin cost reports, OpenRouter credits, DeepSeek balance |
| **Quota** | headroom, reset times, utilization % | Claude Code statusline / OAuth usage, Codex rate-limit snapshots |
| **Analytics** | tokens, models, requests, burn rate, projections | usage reports, local transcripts, gateway ingest |

Subscription "cost" is rendered as **API-equivalent value**, never as billable
spend. The KPI strip separates *API spend today* from *on subscriptions*.

This hybrid model is documented in
[Claude-Code-Usage-Monitor issue #202](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor/issues/202):
use the server for authoritative window state, local logs for granular
analytics, and show both with provenance.

### Provenance states

`official` → `local` → `experimental` → `demo` → `unknown`.

Every provider row carries a badge, the Limits panel carries a source badge, and
the demo banner states how many sources are simulated. A number without a source
is a liability.

---

## 2. Reference projects and what each one teaches

| Project | Data source | Live transport | Lesson taken |
| --- | --- | --- | --- |
| [ccusage](https://github.com/ccusage/ccusage) | local JSONL from ~18 agent CLIs | TUI, statusline | Local parsing, LiteLLM pricing map, 5-hour blocks, dedupe by message id |
| [Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) | JSONL + statusline + OAuth usage | TUI, state JSON | **Provenance labels**, dual cadence, official quota vs local estimate |
| [LiteLLM](https://github.com/BerriAI/litellm) | proxy interception | REST / UI | Spend attribution by credential, zero-cost anomaly counters |
| [Helicone](https://github.com/Helicone/helicone) | proxy or async logging | service split | Hot DB + columnar analytics + object storage; 300+ model cost registry |
| [Langfuse](https://github.com/langfuse/langfuse) | SDK/integrations | async ingestion | `usage_details`/`cost_details` by usage type, pricing tiers, ingested > inferred |
| [OpenLLMetry](https://github.com/traceloop/openllmetry) | OTel instrumentation | OTel pipeline | GenAI semantic conventions as the ingestion schema |
| [AgentOps](https://github.com/AgentOps-AI/agentops) | SDK decorators | SaaS | The agent run, not the request, is the primary unit |
| [OpenMeter](https://github.com/openmeterio/openmeter) | CloudEvents → Kafka → ClickHouse | async query | Meter → entitlement vocabulary; eventual consistency needs an "awaiting" state |
| [ccboard](https://github.com/FlorianBruniaux/ccboard) | Rust local scanner | **SSE, 500 ms file watch** | File watch → SSE is the simplest correct live pipeline |
| [token-dashboard](https://github.com/john-b-rush/token-dashboard) | Rust TUI, local logs | 10 s poll | Honest README: "Should I use this? No." — trust beats more charts |

Consensus architecture:

- **SSE, not WebSocket** for one-way telemetry. Reconnect is built into
  `EventSource`; no handshake or heartbeat protocol needed.
- **Decouple cadences**: ingest 0.5–60 s depending on source, render 1–2 s.
  Polling a rate-limited OAuth endpoint at render speed is how you get 429s.
- **Idempotent event ingestion** is mandatory because every poll re-reads a
  rolling window.
- **Pricing must be versioned and auditable**, and unpriced traffic must be
  visible, not silently `$0`.

---

## 3. Anthropic Admin API

Docs: <https://platform.claude.com/docs/en/manage-claude/usage-cost-api>

### Authentication

- Admin API key, prefix `sk-ant-admin01-…`, header `x-api-key`.
- Also accepts an OAuth bearer with `org:admin`, or a personal/service-account
  key not scoped to a workspace.
- A normal workspace key (`sk-ant-api...`) **does not work**.
- Required header: `anthropic-version: 2023-06-01`.
- Key management: <https://platform.claude.com/settings/admin-keys>

### Usage report

```
GET https://api.anthropic.com/v1/organizations/usage_report/messages
  ?starting_at=2026-11-02T00:00:00Z
  &ending_at=2026-11-02T12:00:00Z
  &bucket_width=1m
  &limit=180
  &group_by[]=model
```

Query parameters:

- `starting_at` required (RFC 3339)
- `ending_at` optional
- `bucket_width`: `1m` | `1h` | `1d`
- `group_by[]`: `account_id`, `api_key_id`, `context_window`, `inference_geo`,
  `model`, `service_account_id`, `service_tier`, `speed`, `workspace_id`
- filters: `api_key_ids[]`, `workspace_ids[]`, `models[]`, `account_ids[]`,
  `service_account_ids[]`, `context_window[]`, `service_tiers[]`,
  `inference_geos[]`, `speeds[]`
- `limit`, `page`

Bucket maxima: `1m` → 1,440; `1h` → 168; `1d` → 31.

Response:

```json
{
  "data": [{
    "starting_at": "2026-11-02T00:00:00Z",
    "ending_at": "2026-11-02T00:01:00Z",
    "results": [{
      "model": "claude-sonnet-4-5",
      "uncached_input_tokens": 1500,
      "cache_read_input_tokens": 200,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 100,
        "ephemeral_1h_input_tokens": 0
      },
      "output_tokens": 500,
      "service_tier": "standard",
      "workspace_id": "wrkspc_...",
      "api_key_id": "apikey_...",
      "context_window": "0-200k",
      "server_tool_use": { "web_search_requests": 10 }
    }]
  }],
  "has_more": true,
  "next_page": "page_..."
}
```

Critical field names:

- `uncached_input_tokens` — not `input_tokens`.
- `cache_read_input_tokens`.
- Cache creation is **nested**: `cache_creation.ephemeral_5m_input_tokens` +
  `ephemeral_1h_input_tokens`.
- `server_tool_use.web_search_requests` is separate from token counts.

Pagination: when `has_more` is true, resend `next_page` as `page`. Silent
truncation when `limit` is not raised is the most common reporting bug.

### Cost report

```
GET /v1/organizations/cost_report
  ?starting_at=2026-11-02T00:00:00Z
  &bucket_width=1d
  &limit=1
```

- `bucket_width` is **daily only**.
- `group_by[]` supports only `description` and `workspace_id`.
- The amount field is **`amount`, a decimal string in cents** — not
  `cost_amount`, not dollars. Divide by 100.
- `currency` is `USD`.
- Cost results can include `model`, `token_type`, `cost_type`, `service_tier`,
  `inference_geo`.

Our adapter sums `amount / 100` for today and keeps per-minute token buckets from
the usage report.

### Freshness and limits

- Usage and cost data typically appear within ~5 minutes.
- The docs recommend polling no more than ~once per minute for sustained use.
- We poll every 60 seconds and cache the result.
- The endpoints are now documented as **legacy but supported**; a newer
  Usage & Cost Analytics API exists under a beta header. Our adapter targets the
  stable legacy paths.

### Claude Pro/Max subscription usage

There is **no official API** for individual consumer plan consumption. The Admin
API is organization-scoped; Pro/Max are consumer plans. Feature requests are
closed as duplicates. Workarounds are all local or undocumented:

- Parse `~/.claude/projects/**/*.jsonl` for tokens.
- Read the Claude Code statusline `rate_limits` block (authoritative window %).
- Call `GET https://api.anthropic.com/api/oauth/usage` with the local OAuth token
  (undocumented, `anthropic-beta: oauth-2025-04-20`, requires a
  `User-Agent: claude-code/<version>` header to avoid aggressive 429s).

The OAuth response shape:

```json
{
  "five_hour": { "utilization": 33.0, "resets_at": "2026-11-02T07:00:00Z" },
  "seven_day": { "utilization": 13.0, "resets_at": "2026-11-09T00:59:59Z" },
  "seven_day_opus": null,
  "seven_day_sonnet": { "utilization": 1.0, "resets_at": "..." },
  "extra_usage": { "is_enabled": false, "monthly_limit": null, "used_credits": null, "utilization": null }
}
```

`utilization` has appeared as both 0–1 and 0–100. Normalize defensively: multiply
by 100 only when the value is ≤ 1, then clamp.

---

## 4. Claude Code local transcripts

Path: `~/.claude/projects/<munged-cwd>/<session-uuid>.jsonl`, append-only.
`CLAUDE_CONFIG_DIR` overrides the base; ccusage also checks
`~/.config/claude/projects`.

Only `assistant` lines carry usage:

```json
{
  "type": "assistant",
  "timestamp": "2026-11-02T02:40:22.650Z",
  "requestId": "req_x",
  "message": {
    "id": "msg_x",
    "model": "claude-sonnet-4-5",
    "usage": {
      "input_tokens": 3,
      "cache_creation_input_tokens": 2285,
      "cache_read_input_tokens": 22137,
      "output_tokens": 1093
    }
  }
}
```

### The dedupe trap

A streamed turn is written as several assistant lines, one per content block,
and **each repeats the same usage object**. Summing lines multiplies usage by the
number of blocks. Key on `message.id` + `requestId`.

Earlier ccusage versions kept the first occurrence; issue
[#888](https://github.com/ccusage/ccusage/issues/888) showed the first line is
often an intermediate snapshot (`output_tokens: 2`) while the last is final
(`output_tokens: 1093`). Our parser keeps the record with the largest total
per key, which is robust for both old and new transcript versions.

### 5-hour billing blocks

ccusage and Claude-Code-Usage-Monitor both model a rolling 5-hour window:

- A block starts at the first message and lasts 5 hours.
- A gap ≥ 5 hours starts a new block.
- Boundaries are computed in UTC for consistency across time zones.

But local blocks are **not** the server window: the server meters all devices and
claude.ai chat, while JSONL only sees this machine. Show `resets_at` from official
data when available; use local blocks for burn rate and analytics. Do not pretend
they are the same number.

### Statusline contract

Claude Code ≥ 2.1.80 pipes session JSON to the statusline command. The payload
includes `rate_limits.five_hour` and `rate_limits.seven_day` with
`used_percentage` and `resets_at` (epoch seconds). Tools such as
`claude-monitor --statusline` persist the latest capture; we read
`~/.claude-monitor/statusline/latest.json` when present and treat it as
`official`.

A real captured example (from the Claude-Code-Usage-Monitor research) shows
`rate_limits` windows are the closest thing to a supported quota API.

### Retention

Claude Code cleans transcripts after ~30 days (`cleanupPeriodDays`). Anything
older needs a warehouse. Our `.data/` intentionally does not yet warehouse raw
events; that is the next persistence step.

---

## 5. OpenAI organization APIs

Docs:
<https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/completions/>
<https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs/>

### Authentication

- Admin key `sk-admin-…`, `Authorization: Bearer …`.
- Normal project keys cannot read organization usage.
- Keys: <https://platform.openai.com/settings/organization/admin-keys>

### Usage

```
GET https://api.openai.com/v1/organization/usage/completions
  ?start_time=1762041600
  &end_time=1762128000
  &bucket_width=1m
  &limit=180
  &group_by=model
```

- `start_time` required, Unix seconds, inclusive.
- `end_time` exclusive.
- `bucket_width`: `1m` | `1h` | `1d`; `limit` counts **buckets**, not rows.
- `group_by`: `project_id`, `user_id`, `api_key_id`, `model`, `batch`,
  `service_tier`, `api_source`.
- Dimensions are `null` unless explicitly grouped.
- Pagination: `has_more` + opaque `next_page` → `page`.

Response row fields that matter:

```json
{
  "input_tokens": 1000,
  "input_cached_tokens": 400,
  "input_cache_write_tokens": 100,
  "input_uncached_tokens": 500,
  "output_tokens": 500,
  "input_text_tokens": 400,
  "output_text_tokens": 400,
  "num_model_requests": 5,
  "model": "gpt-5.1",
  "batch": false,
  "service_tier": "default",
  "project_id": null,
  "user_id": null,
  "api_key_id": null
}
```

**`input_tokens` already includes cached and cache-write tokens.** Do not add
`input_cached_tokens` on top. `input_tokens + output_tokens` is the total.
`num_model_requests` is the request count. Minute buckets typically arrive 2–3
minutes late, so the current minute should render as pending, not zero.

Other usage endpoints (`embeddings`, `moderations`, `images`, `audio_speeches`,
`audio_transcriptions`, `code_interpreter_sessions`, `vector_stores`,
`file_search_calls`, `web_search_calls`, `decisions`) return different metrics.
This dashboard currently reads completions only; adding the others is a separate
adapter each.

### Costs

```
GET https://api.openai.com/v1/organization/costs
  ?start_time=1762041600
  &bucket_width=1d
  &limit=1
  &group_by=line_item
```

- Only daily buckets are supported.
- `amount.value` is dollars; `amount.currency` is lowercase ISO (`usd`).
- `group_by` supports `project_id`, `user_id`, `line_item`, `api_key_id`,
  `api_source`; combining certain dimensions can return 400 on some orgs.
- There is no model field on cost results. Join via line item strings or compute
  from usage × pricing.

This is why the dashboard displays official cost for the **day** while using
locally priced tokens for the intraday spend chart — and labels it as such.

### ChatGPT / Codex subscription

No documented API. The community endpoint
`GET https://chatgpt.com/backend-api/wham/usage` (and `/backend-api/codex/usage`)
returns plan and rate windows using the local ChatGPT OAuth token plus
`ChatGPT-Account-Id`. It is unstable and refresh tokens are single-use; Token
Monitor deliberately does **not** call it. Codex CLI writes the same rate-limit
snapshot into each rollout, which is stable, local and already available.

---

## 6. Codex CLI rollouts

Path: `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl`
(default `~/.codex`). Archived sessions live in `archived_sessions/`. Codex
compresses old rollouts to `.jsonl.zst`; this implementation reads plain files
only.

Line shape: `{ "timestamp", "type", "payload": { ... } }`.

- `session_meta` — once, session id, cwd, model_provider.
- `turn_context` — per turn: model, approval/sandbox policy.
- `response_item` — conversation items.
- `event_msg` — `task_started`, `task_complete`, `token_count`.
- `token_usage_record` — compaction accounting.

`token_count`:

```json
{
  "type": "event_msg",
  "timestamp": "2026-11-02T02:40:22Z",
  "payload": {
    "type": "token_count",
    "info": {
      "total_token_usage": {
        "input_tokens": 12000,
        "cached_input_tokens": 6000,
        "output_tokens": 900,
        "reasoning_output_tokens": 120,
        "total_tokens": 12900
      },
      "last_token_usage": { "...": "per-request delta" },
      "model_context_window": 272000
    },
    "rate_limits": {
      "primary": { "used_percent": 47, "window_minutes": 300, "resets_at": 1762050000 },
      "secondary": { "used_percent": 71, "window_minutes": 10080, "resets_at": 1762600000 },
      "credits": { "has_credits": false, "unlimited": false, "balance": "0" }
    }
  }
}
```

Rules:

- Use `last_token_usage` for the delta, and diff `total_token_usage` to avoid
  double counting replayed/subagent prefixes. This parser diffs totals.
- `cached_input_tokens` is included in `input_tokens`.
- Reasoning tokens are part of output, not extra.
- **Never assume `primary` is the 5-hour window.** Derive the label from
  `window_minutes` (300 = 5 h, 10080 = 7 d, 43200 = 30 d).
- Quota snapshots are from the last request and go stale while idle; label them
  `local` and show the source.
- `resets_at` is Unix seconds; the HTTP usage endpoint uses
  `reset_after_seconds` / `limit_window_seconds` instead.

---

## 7. Other providers — capability matrix

| Provider | Programmatic usage | Cost / balance | Endpoint |
| --- | --- | --- | --- |
| Anthropic | yes (Admin) | yes (Admin) | `/v1/organizations/usage_report/messages`, `/cost_report` |
| OpenAI | yes (Admin) | yes (Admin, daily) | `/v1/organization/usage/completions`, `/costs` |
| OpenRouter | key usage; not tokens | yes | `/api/v1/key`, `/api/v1/credits`, `/api/v1/generation?id=` |
| DeepSeek | no | balance only | `/user/balance` |
| Together AI | beta billing line items | yes | `/v1/billing/usage` (opt-in, org-scoped) |
| Fireworks | usage quantities + rated cost | yes | `/v1/accounts/{id}/billingUsage`, `/billing/summary` |
| Mistral | Enterprise Admin API only | partial | Beta admin billing |
| Gemini | no per-key usage; Cloud Billing export | project-level | Cloud Billing / Monitoring |
| xAI | management API for keys/models, no spend | no | console only |
| Groq | no account usage endpoint | console only | — |
| Cerebras | Prometheus metrics for dedicated endpoints | no dollars | `/api/v1/metrics/organizations/{id}` |
| Cohere | no account usage endpoint | console only | — |
| Perplexity | no balance/spend endpoint | tier in console | — |

All of these accept provider-reported `usage` in each inference response. For
providers without an account endpoint, the honest path is local metering or
gateway ingest, not fabricated data.

---

## 8. Decisions implemented here

### Ingestion

- One normalized `UsageEvent` shape:
  `{ id?, at, providerId, model, inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens?, costUsd?, requests?, source? }`.
- Idempotent dedupe: event `id` (local transcript key, remote bucket key, or
  random ingest id) held in a 6-hour seen map.
- Remote collectors re-read a 3-hour rolling window every 60 s. Bucket keys make
  that safe.
- Local collectors rescan changed files every 8 s and dedupe by message id /
  cumulative token count.
- Ingest API accepts single events or arrays, with an optional bearer token.

### Aggregation

- Minute buckets for 27 hours, hour buckets for 10 days, day buckets for 60 days.
- Each bucket keeps `providers`, per-provider `models`, tokens, cost, requests.
- This makes 1 h / 24 h / 7 d / 30 d charts a simple bucketed sum without a
  database.
- On restart, sources are re-read and history is reconstructed. `.data/` only
  holds settings and provider registration.

### Costing

- Editable USD/1M token table in `lib/pricing.ts`.
- Cache read/write rates modeled separately.
- Subscription costs are API-equivalent values, excluded from billable totals.
- Unknown models fall back to `custom-model` with a visible vendor label
  `Custom` — never silently zero.
- Official provider cost overrides the local estimate for today's KPI.

### Live transport

- `GET /api/stream` sends a complete `StatePayload` every 1.5 s.
- Snapshot sizes stay small enough for localhost: 60 series points, 12 model
  rows, 22 feed events.
- The client count-up easing runs between frames so the deck feels continuous
  without inventing traffic.
- Range changes reset the `EventSource` with `?range=` and dim the deck while
  the new window loads.

### Privacy

- Local transcript parsing reads `message.usage`, `message.model`, timestamps and
  IDs only. Prompt text, tool output, file contents and thinking blocks are never
  extracted.
- No secrets in `.data/`, no keys sent to the browser, no telemetry leaving the
  machine except the provider API calls you configure.
- Parsed usage metadata never leaves the collector; only aggregate snapshots are
  served to the dashboard.

---

## 9. Known limitations

1. **OpenAI intraday spend is an estimate.** Costs only have daily buckets.
2. **Anthropic cost grouping is limited** to description/workspace.
3. **Claude OAuth usage is undocumented** and may rate-limit or change without
   notice. It is cached 180 s and degrades silently.
4. **Codex quota snapshots go stale** while the CLI is idle.
5. **OpenRouter exposes spend, not tokens.** Token volume for OpenRouter remains
   zero unless you ingest per-request usage.
6. **Gemini, Groq, xAI, Cohere and Perplexity have no account-level usage API**
   for this use case; they run on simulation or ingest.
7. **No authentication.** Local-first by design; do not expose publicly as-is.
8. **Demo history is deterministic per provider per day**, not persisted across
   restarts. Real sources are reconstructed from their APIs/logs.

---

## 10. Primary sources

### Provider APIs

- Anthropic Usage & Cost API: <https://platform.claude.com/docs/en/manage-claude/usage-cost-api>
- Anthropic usage report reference: <https://platform.claude.com/docs/en/api/beta/organization/usage_report/retrieve_messages>
- Anthropic cost report reference: <https://platform.claude.com/docs/en/api/beta/organization/cost_report/retrieve>
- Anthropic admin keys: <https://platform.claude.com/docs/en/manage-claude/admin-api-keys>
- OpenAI completions usage: <https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/completions/>
- OpenAI costs: <https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs/>
- OpenAI Admin APIs guide: <https://developers.openai.com/api/docs/guides/admin-apis>
- OpenAI usage cookbook: <https://developers.openai.com/cookbook/examples/completions_usage_api>
- OpenRouter limits: <https://openrouter.ai/docs/api_reference/limits>
- OpenRouter credits: <https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits>
- DeepSeek balance: <https://api-docs.deepseek.com/api/get-user-balance/>
- Together billing usage: <https://docs.together.ai/reference/billing-usage>
- Fireworks usage export: <https://docs.fireworks.ai/accounts/exporting-usage-and-costs>
- Gemini OpenAI compatibility: <https://ai.google.dev/gemini-api/docs/openai>
- Claude Code monitoring/OTel: <https://code.claude.com/docs/en/monitoring-usage>

### Community references

- ccusage: <https://github.com/ccusage/ccusage> · docs <https://ccusage.com>
- ccusage dedupe issue: <https://github.com/ccusage/ccusage/issues/888>
- Claude-Code-Usage-Monitor: <https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor>
- Hybrid quota model: <https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor/issues/202>
- Claude Code JSONL format write-up: <https://www.adityabawankule.io/blog/claude-code-session-jsonl-format>
- Codex rollout format: <https://dev.to/bargan/what-codex-cli-writes-to-disk-for-every-session-and-how-to-follow-it-live-1i04>
- Codex rate-limit source: <https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/rate_limits.rs>
- ccusage Codex guide: <https://ccusage.com/guide/codex/>
- LiteLLM spend tracking: <https://docs.litellm.ai/docs/proxy/cost_tracking>
- Helicone cost registry: <https://github.com/Helicone/helicone/blob/main/packages/cost/README.md>
- Langfuse token/cost tracking: <https://langfuse.com/docs/observability/features/token-and-cost-tracking>
- OpenLLMetry: <https://github.com/traceloop/openllmetry>
- OpenMeter: <https://openmeter.io/docs/get-started/overview>
- ccboard: <https://github.com/FlorianBruniaux/ccboard>
