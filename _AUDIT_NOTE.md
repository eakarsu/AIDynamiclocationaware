# Audit Notes — AIDynamiclocationaware

Audit source: `_AUDIT/reports/batch_03.md` § 5 (partial-build).

## Original audit recommendations

### Missing AI counterparts
- `/optimize-geofence` — optimal geofence boundary.
- `/demand-forecast` — foot-traffic prediction.
- `/performance-predict` — CTR/conversion estimate.
- `/budget-allocate` — spend distribution across trucks/neighborhoods.

### Missing non-AI features
- Campaign scheduling (start/end, time-of-day targeting).
- QR/SMS capture flow.
- Driver mobile app.
- Customer dashboard with ROI.
- Invoicing.

### Custom feature suggestions
- Dynamic pricing.
- Agentic campaign planner.
- Vision model competitor analysis.
- Audio campaigns (radio voice-over).
- Weather-triggered campaigns.
- Real-time map dashboard.
- Programmatic OOH inventory marketplace.

## Current state observed

Existing AI surface already includes `seasonal-headlines`, `sentiment-tone`,
`multilingual`, `route-performance-predictor` (covers `/performance-predict`),
`brand-safety`, `weather-aware` (covers part of "weather-triggered"),
`geofence-generate` (covers `/optimize-geofence`), `live-dispatch`, plus
`/heatmap`, `/brand-safety/scores`, `/ws-stats`. Core CRUD covered.

## Implementations applied this pass

None — three of the four "missing" AI endpoints already have analogues in
`aiNew.js` / `aiExtra.js`. Remaining gaps need data we do not have.

## Prioritized backlog

1. **MECHANICAL** — Add `/api/ai/budget-allocate` endpoint that reads
   `campaigns`, `trucks`, `neighborhoods`, and asks the model to propose a
   spend split with reasoning.
2. **MECHANICAL** — Add `/api/ai/demand-forecast` reading historical GPS
   density (`gps.js` table) per neighborhood and asking the model for a
   short-horizon projection.
3. **NEEDS-PRODUCT-DECISION** — Dynamic pricing requires pricing model design
   (cost basis, advertiser rate cards).
4. **NEEDS-CREDS** — Real foot-traffic data (SafeGraph, Placer) is paid.
5. **NEEDS-CREDS** — Audio (TTS) generation needs a TTS provider account.
6. **TOO-RISKY** — Programmatic OOH inventory marketplace is a separate
   product entirely; out of scope for mechanical addition.

## Apply pass 3 (frontend)

**Action:** LEFT-AS-IS — FE already wired.

Verified `public/app.js` (static SPA) calls `/api/ai/generate`, `/api/ai/route-performance-predictor`, `/api/ai/logs`, plus `/api/ai-extra/brand-safety`, `/api/ai-extra/brand-safety/scores`, `/api/ai-extra/weather-aware`, `/api/ai-extra/heatmap`, `/api/ai-extra/live-dispatch`. Dedicated sidebar tabs render dashboards for AI Generator, AI Logs, Brand Safety, Weather Headlines, Heatmap, and Live Billboard. Auth header sourced from `localStorage.getItem('token')`. The remaining sub-endpoints in `aiNew.js` (`seasonal-headlines`, `sentiment-tone`, `multilingual`, `geofence-generate`) are reachable through the existing `/ai/generate` mode flag in the AI Generator UI; no separate tab required for parity.

No FE files modified.

## Apply pass 4 (mechanical backlog)

Implemented the two MECHANICAL backlog items.

**Backend** (`server/routes/aiNew.js`, reuses existing `callAI` helper, `aiRateLimiter`, `authMiddleware`; 503 when `OPENROUTER_API_KEY` missing):
- `POST /api/ai/budget-allocate` — AI proposes spend split across trucks/neighborhoods given a campaign + total budget.
- `POST /api/ai/demand-forecast` — short-horizon foot-traffic / impression projection per neighborhood.

**Frontend** (`public/app.js`, `public/index.html`):
- Added sidebar entries "Budget Allocator" and "Demand Forecast".
- Added renderer functions `renderBudgetAllocate` / `renderDemandForecast` and matching nav titles + render dispatch entries.
- Updated `api()` helper to attach the HTTP status code to thrown errors so 503 paths surface a clear "AI service is unavailable" message.

**Smoke test:** Started `node server/index.js`; logged in as admin@dynamicads.com; both endpoints returned HTTP 200 with structured allocation/forecast data. Server cleaned up.

## Apply pass 5 (all backlog)

Promoted Dynamic Pricing (PRODUCT-DECISION) to advisory implementation.

**Backend** (`server/routes/aiNew.js`, reuses `callAI` + `aiRateLimiter` + `authMiddleware`; 503 when `OPENROUTER_API_KEY` missing):
- `POST /api/ai/dynamic-pricing` — PRODUCT-DECISION: base CPM defaults to $5 (typical OOH lower bound) when not supplied; multiplier clamped to [0.5x, 3x]; advisory only (NOT wired to invoicing).

**Frontend** (`public/app.js`, `public/index.html`):
- Added "Dynamic Pricing" sidebar entry.
- Added `renderDynamicPricing` / `runDynamicPricing` functions; nav title + render dispatch entries.

**Smoke test:** Started backend on port 4112 with `OPENROUTER_API_KEY=""`; login admin@dynamicads.com/password123 → 200; `/api/ai/dynamic-pricing` → 503 with `missing: OPENROUTER_API_KEY`. Server cleaned up.

Backlog updated:
- Dynamic pricing → done (advisory). Remaining: SafeGraph/Placer foot-traffic feed (NEEDS-CREDS); TTS audio (NEEDS-CREDS); OOH inventory marketplace (TOO-RISKY).
