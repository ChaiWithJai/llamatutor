# ADR 0003: Qwen2.5-7B for text, configurable dedicated model for images

- Status: accepted
- Date: 2026-07-30
- Related: #11 (migration issue), #4 (design-to-life spec), #9 (ADR — Option B, Netlify Identity/Database)

## Context

`app/api/getChat/route.ts` has always called `Qwen/Qwen2.5-7B-Instruct-Turbo` on Together AI, despite the product being named "Llama Tutor" and the landing page claiming "Powered by Llama 3.1 and Together AI." No request in the codebase has ever actually called a Llama model. This was flagged in #11 as a branding/reality gap worth closing, especially with a LinkedIn webinar demo of "build your own coach with Together.ai" happening imminently.

The first instinct was a straight swap to `meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8` (Llama 4 Maverick — 17B active / ~400B total MoE, natively multimodal, 1M token context). On reflection, and per direction, a straight swap throws away a real cost/capability tradeoff instead of using it.

## Pricing and capability comparison (Together AI, checked 2026-07-30)

| | Qwen2.5-7B-Instruct-Turbo | Llama 4 Maverick |
|---|---|---|
| Input price | $0.30 / 1M tokens | $0.27 / 1M tokens |
| Output price | $0.30 / 1M tokens | $0.85 / 1M tokens |
| Multimodal (image input) | No — text-only | Yes — native, same endpoint, OpenAI-compatible `image_url` content blocks |
| Context window | Smaller | ~1M tokens |
| Relative benchmark strength | Comparable on general text tasks per public comparisons | Ahead on LiveCodeBench, MATH, MMLU, MMLU-Pro; ~2.3x higher throughput reported vs. a similarly-sized comparison model |

Sources: [Together AI — Llama 4 Maverick](https://www.together.ai/models/llama-4-maverick), [Together AI — Llama 4 partnership announcement](https://www.together.ai/blog/llama-4), [Together AI — Qwen2.5-7B-Instruct-Turbo](https://www.together.ai/models/qwen2-5-7b-instruct-turbo), [llm-stats.com comparison](https://llm-stats.com/models/compare/llama-4-maverick-vs-qwen-2.5-coder-7b-instruct)

**The decisive fact isn't the benchmark gap — it's the output price gap.** This app's `getChat` endpoint streams long educational explanations; output tokens dominate the bill. Maverick costs ~2.8x more per output token than Qwen. Routing every free, anonymous, unauthenticated explainer request through Maverick would multiply the largest line item in Together AI spend for a use case (short text Q&A) that Qwen already handles adequately. Qwen also cannot see images at all — it isn't a matter of preference, multimodal input to Qwen is silently ignored by the API.

## Decision

Route per request based on message content, not a single hardcoded model:

- **Text-only messages → `Qwen/Qwen2.5-7B-Instruct-Turbo`.** This is the default and covers the free explainer path (`app/api/getChat/route.ts`) for the overwhelming majority of anonymous traffic — cheapest output cost, adequate quality for topic explanations.
- **Any message containing an `image_url` content block → the model named by `TOGETHER_MULTIMODAL_MODEL`.** This is a capability requirement, not a cost optimization — Qwen cannot process images at all. Until a dedicated endpoint is provisioned and configured, the route returns a clear `503` instead of forwarding the request to a model known to be unavailable.

Implementation: `utils/TogetherAIStream.ts` exports `selectChatModel(messages, multimodalModel)`, which inspects the message array for any `image_url` block and returns the text model, the configured image model, or `null` when image capability is unavailable. `ChatGPTMessage.content` is widened from `string` to `string | ChatGPTContentBlock[]` to allow multimodal payloads without breaking any existing text-only call site.

## Critical constraint discovered during implementation (2026-07-30)

Verified directly against the Together AI API using this project's live `TOGETHER_API_KEY` (not documentation — actual `curl` calls): **`meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8` returns `400 model_not_available`** on this account:

> "Unable to access non-serverless model meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8. Please visit https://api.together.ai/models/... to create and start a new dedicated endpoint for the model."

This is not specific to Maverick. Every vision-capable model tested returned the same error — `Llama-4-Maverick-17B-128E-Instruct-FP4`, `Llama-4-Scout-17B-16E-Instruct`, `Qwen/Qwen3-VL-8B-Instruct`, `Qwen/Qwen2-VL-72B-Instruct`, `Qwen/Qwen2.5-VL-72B-Instruct`, `meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo`, `meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo`. The `GET /v1/models` listing shows pricing for several of these (including Maverick and Scout), which reads as if they're serverless-available — they are not, on this account. Listed pricing is not a reliable signal of serverless availability; only an actual chat-completion call proves it. `Qwen/Qwen2.5-7B-Instruct-Turbo` (the current production model) was re-verified working in the same test batch, confirming the test methodology itself is sound and the failures are real.

**Practical consequence: there is no serverless multimodal model available on this Together AI account today.** Getting real image input working requires provisioning a dedicated endpoint through the Together AI dashboard for a chosen vision model — which has an hourly cost and manual setup step, not a config change. That is a cost/ops decision for the team, not something to silently enable before tomorrow's webinar demo.

**What this ADR still delivers today, and what it doesn't:**
- `selectChatModel()` and the widened `ChatGPTMessage` content type ship as working, tested scaffolding. Direct API callers cannot accidentally trigger a known-broken model call: image input receives a truthful `503` while `TOGETHER_MULTIMODAL_MODEL` is unset.
- The multimodal branch is **not verified against a live model call**. It remains disabled until a dedicated endpoint is provisioned and its model identifier is set in `TOGETHER_MULTIMODAL_MODEL`.
- The free explainer path (`getChat`, text-only, the only path currently reachable) is unaffected — it still routes to `Qwen/Qwen2.5-7B-Instruct-Turbo`, verified working.

## Consequences

### Positive

- Free explainer traffic (the largest volume, least differentiated use case) keeps the cheaper per-output-token model — no cost regression on the path that matters most for aggregate spend.
- Multimodal routing is ready for an image-upload UI once a working dedicated endpoint is configured.
- Makes the branding/capability gap explicit: production remains Qwen-only until a working vision endpoint is configured, and image requests fail truthfully in the meantime.
- No new infrastructure, no new provider — same `TOGETHER_API_KEY`, same streaming pipeline.

### Negative

- Once vision is enabled, two models in production will mean two things to monitor for quality/latency/error-rate drift instead of one.
- The routing function only inspects message content shape today — it doesn't yet account for an authenticated-vs-anonymous distinction (e.g., a signed-in coaching user asking a text-only follow-up still gets Qwen). That's an intentional simplification for this first pass, not an oversight — routing on content type is the only distinction that's a hard capability requirement (Qwen literally cannot see images); routing on auth state is a policy choice that can be layered on later if the coaching path wants higher-quality text responses regardless of images.
- `selectChatModel` needs a corresponding unit test kept in sync if a third model is ever added to the routing table.

## Alternatives considered

### Straight swap to Maverick everywhere

Rejected. Ignores the ~2.8x output-price gap for a benefit (multimodal) that the free explainer path doesn't currently use at all.

### Keep Qwen everywhere, add Maverick only when the image-upload UI ships

Considered. Rejected for now because the routing function is nearly free to add today (a few lines, fully backward-compatible) and having it land ahead of the UI means the UI work only has to build the upload affordance, not also touch model selection.

### A third, mid-tier model for authenticated text-only coaching requests

Not evaluated in depth — flagged as a possible future refinement once real usage data exists on the coaching path's actual text-only volume and quality bar, rather than speculated on here.

## Review

Revisit after the image-upload UI ships (does real multimodal traffic match the cost model above?) and after the first month of production usage on the free explainer path (is Qwen's quality actually adequate, or does the webinar/early cohort feedback say otherwise?).

**Immediate next decision required, separate from this ADR's scope:** whether to provision a dedicated Together AI endpoint for a vision model before building the image-upload UI, which model to provision (this ADR's cost analysis assumed Maverick's serverless pricing, which doesn't apply to a dedicated endpoint — dedicated pricing is hourly GPU cost, a different comparison entirely), and whether that cost is justified before real usage data exists on how often learners would actually submit an image.
