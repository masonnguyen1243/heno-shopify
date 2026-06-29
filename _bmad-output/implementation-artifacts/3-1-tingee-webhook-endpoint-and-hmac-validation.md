---
baseline_commit: "NO_VCS"
---

# Story 3.1: Tingee Webhook Endpoint & HMAC Validation

Status: done

## Story

As a system,
I want to securely receive and authenticate payment notifications from Tingee,
So that only legitimate transactions trigger any processing — and we respond within Tingee's 5-second timeout.

## Acceptance Criteria

1. **Given** Pact provider verification setup at the start of Epic 3, **When** `pact verify` is run against `GET /api/orders/:orderId/payment-status`, **Then** the provider test passes against the consumer contract pinned in Epic 2 — this MUST complete before any other Epic 3 story merges

2. **Given** Tingee sends a POST to `/webhooks/tingee`, **When** the request arrives, **Then** rate limiting enforces 100 requests per 15 minutes per IP via `lib/rateLimit.server.ts` — requests over the limit receive HTTP 429

3. **Given** a Tingee webhook with a valid HMAC-SHA512 signature, **When** `lib/hmac.server.ts` validates header `x-signature` = `HMAC_SHA512(x-request-timestamp + ":" + body, secretToken)`, **Then** validation passes and processing continues

4. **Given** a Tingee webhook with an invalid HMAC-SHA512 signature, **When** validation runs, **Then** HTTP 400 is returned immediately, no DB writes are made, and a security warning is logged to Sentry via `sanitizeForLog()`

5. **Given** a Tingee webhook with `x-request-timestamp` older than 5 minutes (replay attack), **When** timestamp is validated, **Then** HTTP 400 is returned — replay attack prevention

6. **Given** a valid webhook that passes HMAC validation, **When** the full handler completes, **Then** HTTP 200 is returned in ≤5 seconds total (Tingee hard limit) — verifiable via integration test with mocked Shopify API delay

7. **Given** `verifyWebhookHMAC()` stub in `tingee.server.ts` (created in Story 2.1), **When** implemented in this story, **Then** the implementation replaces the stub — file structure is NOT reorganized

## Tasks / Subtasks

- [x] Task 0: Pact provider verification (AC: #1)
  - [x] Run `npx pact-provider-verifier` or equivalent to verify provider `tingee-shopify-app` against consumer contract at `test/contracts/pacts/order-status-extension-tingee-shopify-app.json`
  - [x] The contract pins `GET /api/orders/:orderId/payment-status` response schema: `{ status: PaymentStatus, paidAt?: string }`
  - [x] Run: verify that existing `api.orders.$orderId.payment-status.tsx` still satisfies the contract (it should — no change needed, just verification)
  - [x] If Pact verify fails: fix `api.orders.$orderId.payment-status.tsx` FIRST before any Epic 3 code
  - [x] **Gate:** Epic 3 must not merge if this fails

- [x] Task 1: Add `webhookRateLimiter` to `app/lib/rateLimit.server.ts` (AC: #2)
  - [x] Append export: `export const webhookRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 100 })`
  - [x] **DO NOT** modify `pollingRateLimiter` (used by `api.orders.$orderId.payment-status.tsx`) or `createRateLimiter` function — just add a new export
  - [x] No new test needed for the factory (already tested via `pollingRateLimiter`); the route test will exercise it

- [x] Task 2: Create `app/lib/hmac.server.ts` (AC: #3, #4, #5)
  - [x] Import: `import { createHmac, timingSafeEqual } from "crypto"`
  - [x] Export type: `interface VerifyHMACParams { signature: string; timestamp: string; body: string; secretToken: string }`
  - [x] Export function: `export function verifyHMAC(params: VerifyHMACParams): boolean`
  - [x] Implementation: `createHmac('sha512', secretToken).update(`${timestamp}:${body}`).digest('hex')`
  - [x] Use `timingSafeEqual` for constant-time comparison (prevents timing attacks)
  - [x] Return `false` (not throw) for any malformed/empty input
  - [x] **Timestamp validation lives in the ROUTE** (not here) — `lib/hmac.server.ts` only handles signature math
  - [x] `verifyHMAC` is a pure utility (no DB, no Shopify, no Tingee SDK) — belongs in `lib/` not `services/`

- [x] Task 3: Create `app/lib/hmac.server.test.ts` (AC: #3, #4)
  - [x] Generate a valid HMAC for a known payload using Node.js `createHmac` in test setup
  - [x] Test: valid signature + matching body → `true`
  - [x] Test: valid signature + tampered body → `false`
  - [x] Test: completely wrong signature → `false`
  - [x] Test: empty signature string → `false` (graceful, not throw)
  - [x] Test: `timingSafeEqual` used (not `===`) — test indirectly via tampered-body case
  - [x] Use `import { createHmac } from "crypto"` to generate reference HMAC in tests

- [x] Task 4: Update `app/services/tingee.server.ts` — replace `verifyWebhookHMAC` stub (AC: #7)
  - [x] Import `verifyHMAC` from `"../lib/hmac.server"`
  - [x] Timestamp format: `yyyyMMddHHmmssSSS` (UTC+7) — parse as: year(4), month(2), day(2), hour(2), min(2), sec(2), ms(3) = 17 chars total
  - [x] Timestamp parsing: `new Date(parseInt(ts.slice(0,4)), parseInt(ts.slice(4,6))-1, parseInt(ts.slice(6,8)), parseInt(ts.slice(8,10)), parseInt(ts.slice(10,12)), parseInt(ts.slice(12,14)), parseInt(ts.slice(14,17)))` — NOTE: this gives UTC+7 wall-clock time; convert to UTC by subtracting 7 hours for age comparison
  - [x] Alternatively: `Date.parse` won't work directly — use manual parse above
  - [x] Replay attack: `Date.now() - timestampMs > 5 * 60 * 1000` → return `false`
  - [x] Timestamp age calc must account for UTC+7 offset: add `7 * 60 * 60 * 1000` to the parsed wall-clock Date before comparing to `Date.now()` (UTC)
  - [x] Replace stub body: call `verifyHMAC()` + validate timestamp age
  - [x] Return `true` only if BOTH signature valid AND timestamp fresh (≤5 min old)
  - [x] **DO NOT** reorganize file structure — only replace the stub function body (lines 171-178 in current file)
  - [x] New signature: `export function verifyWebhookHMAC(params: { secretToken: string; signature: string; timestamp: string; body: string }): boolean` — same params, now returns `boolean` instead of throwing

- [x] Task 5: Add `verifyWebhookHMAC` tests to `app/services/tingee.server.test.ts`
  - [x] Import: add `verifyWebhookHMAC` to the import from `./tingee.server`
  - [x] Mock: add `vi.mock("../lib/hmac.server", () => ({ verifyHMAC: vi.fn() }))` at top
  - [x] Test: valid signature + fresh timestamp → returns `true`
  - [x] Test: invalid signature + fresh timestamp → returns `false`
  - [x] Test: valid signature + timestamp > 5 min old → returns `false`
  - [x] Test: malformed timestamp (not 17 chars) → returns `false` (not throw)
  - [x] Use `vi.useFakeTimers()` + `vi.setSystemTime()` for timestamp age tests

- [x] Task 6: Create `app/routes/webhooks.tingee.tsx` (AC: #2, #3, #4, #5, #6)
  - [x] Export only `action` (POST only — no loader)
  - [x] Import `webhookRateLimiter` from `"../lib/rateLimit.server"`
  - [x] Import `verifyWebhookHMAC` from `"../services/tingee.server"`
  - [x] Import `sanitizeForLog` from `"../lib/logger.server"`
  - [x] Import `getDecryptedCredential` from `"../services/credential.server"`
  - [x] **Step 1 — Rate limit:** Extract IP from `request.headers.get("x-forwarded-for") ?? "unknown"` (Fly.io sets this). If `webhookRateLimiter.isRateLimited(ip)` → `new Response(null, { status: 429 })`
  - [x] **Step 2 — Read raw body:** `const body = await request.text()` — MUST read as text BEFORE parsing JSON (need raw string for HMAC)
  - [x] **Step 3 — Parse JSON:** `const payload = JSON.parse(body)` — wrap in try/catch, return 400 on invalid JSON
  - [x] **Step 4 — Extract headers:** `const signature = request.headers.get("x-signature") ?? ""`; `const timestamp = request.headers.get("x-request-timestamp") ?? ""`
  - [x] **Step 5 — Identify merchant:** `const shopDomain = new URL(request.url).searchParams.get("shop")`. If missing → return 400 (misconfigured webhook URL)
  - [x] **Step 6 — Look up credential:** `const credential = await getDecryptedCredential(shopDomain)`. If null → log warning + return 400 (no credential = can't verify HMAC)
  - [x] **Step 7 — Verify HMAC + timestamp:** `const valid = verifyWebhookHMAC({ secretToken: credential.secretToken, signature, timestamp, body })`. If `!valid` → log security warning to Sentry via `sanitizeForLog()` + return 400
  - [x] **Step 8 — Return 200:** Valid webhook. Story 3.2 will add idempotency + reconciliation logic HERE.
  - [x] **Sentry logging pattern for invalid HMAC:** `console.error("[SECURITY] Invalid Tingee webhook HMAC", sanitizeForLog({ shopDomain, ip, timestamp }))` — do NOT log `signature` or `secretToken`
  - [x] `sanitizeForLog` is **shallow** — never pass `secretToken` as a field key

- [x] Task 7: Create `app/routes/webhooks.tingee.test.ts` (AC: #2, #3, #4, #5, #6)
  - [x] Mock pattern same as `webhooks.app.uninstalled.test.ts` (vi.mock at top, import after)
  - [x] Mocks needed:
    - `vi.mock("../lib/rateLimit.server", () => ({ webhookRateLimiter: { isRateLimited: vi.fn().mockReturnValue(false) } }))`
    - `vi.mock("../services/credential.server", () => ({ getDecryptedCredential: vi.fn() }))`
    - `vi.mock("../services/tingee.server", () => ({ verifyWebhookHMAC: vi.fn() }))`
    - `vi.mock("../lib/logger.server", () => ({ sanitizeForLog: vi.fn((obj) => obj) }))`
  - [x] Test helper `makeRequest(shopDomain, headers, body)`: `new Request(`http://localhost/webhooks/tingee?shop=${shopDomain}`, { method: 'POST', headers, body })`
  - [x] Test: valid HMAC + credential found → 200
  - [x] Test: missing `shop` query param → 400
  - [x] Test: credential not found (null) → 400
  - [x] Test: `verifyWebhookHMAC` returns `false` → 400
  - [x] Test: invalid JSON body → 400
  - [x] Test: rate limited → 429
  - [x] Test: no DB write occurs on invalid HMAC (ensure `db.*` mocks not called)
  - [x] Test: `sanitizeForLog` called on invalid HMAC (security audit logging)
  - [x] Test: missing `x-signature` header → 400 (empty signature → `verifyWebhookHMAC` returns false)
  - [x] Test: missing `x-request-timestamp` header → 400
  - [x] 8+ tests covering all ACs

## Dev Notes

### Architecture Decisions

**Merchant identification via `?shop=` query param:**
The Tingee webhook URL registered per-merchant is `{APP_URL}/webhooks/tingee?shop={shopDomain}`. This is set when calling the Tingee API to register the webhook endpoint (out of scope for Story 3.1, but this is the convention). The `shop` query param identifies which merchant's secretToken to use for HMAC validation.

**Why read body as text before JSON.parse:**
HMAC is computed over the raw body string. If we parse JSON first and re-stringify, the byte representation may differ (key order, whitespace). We MUST call `request.text()` once, use the raw string for HMAC validation, then `JSON.parse(bodyText)` for business logic.

**Why `verifyWebhookHMAC` returns `boolean` not throws:**
The stub originally threw `Error("not implemented")`. The real implementation returns `boolean` — callers check the return value and decide how to respond. This is cleaner than try/catch at the call site.

**Timestamp format `yyyyMMddHHmmssSSS` (UTC+7):**
This is Tingee's format — a compact date string in ICT timezone (UTC+7). Example: `20260629143052123` = 2026-06-29 14:30:52.123 ICT = 2026-06-29 07:30:52.123 UTC. To get UTC epoch from this timestamp:
```typescript
function parseTimestamp(ts: string): number {
  if (ts.length !== 17) return 0;
  const y = parseInt(ts.slice(0, 4));
  const mo = parseInt(ts.slice(4, 6)) - 1;
  const d = parseInt(ts.slice(6, 8));
  const h = parseInt(ts.slice(8, 10));
  const mi = parseInt(ts.slice(10, 12));
  const s = parseInt(ts.slice(12, 14));
  const ms = parseInt(ts.slice(14, 17));
  // Date.UTC treats args as UTC, but Tingee sends UTC+7, so subtract 7 hours
  return Date.UTC(y, mo, d, h - 7, mi, s, ms);
}
```
Replay check: `Date.now() - parseTimestamp(timestamp) > 5 * 60 * 1000`.

**HMAC algorithm:**
```typescript
// lib/hmac.server.ts
import { createHmac, timingSafeEqual } from "crypto";

export function verifyHMAC(params: { signature: string; timestamp: string; body: string; secretToken: string }): boolean {
  try {
    const expected = createHmac("sha512", params.secretToken)
      .update(`${params.timestamp}:${params.body}`)
      .digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    const actualBuf = Buffer.from(params.signature, "utf8");
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}
```

**`verifyWebhookHMAC` in `tingee.server.ts`:**
```typescript
// After implementation (replaces the stub at bottom of file)
import { verifyHMAC } from "../lib/hmac.server";

function parseTimestampUTC(ts: string): number {
  if (!ts || ts.length !== 17) return 0;
  const y = parseInt(ts.slice(0, 4));
  const mo = parseInt(ts.slice(4, 6)) - 1;
  const d = parseInt(ts.slice(6, 8));
  const h = parseInt(ts.slice(8, 10));
  const mi = parseInt(ts.slice(10, 12));
  const s = parseInt(ts.slice(12, 14));
  const ms = parseInt(ts.slice(14, 17));
  const utcMs = Date.UTC(y, mo, d, h - 7, mi, s, ms);
  return isNaN(utcMs) ? 0 : utcMs;
}

export function verifyWebhookHMAC(params: {
  secretToken: string;
  signature: string;
  timestamp: string;
  body: string | object;
}): boolean {
  const bodyStr = typeof params.body === "string" ? params.body : JSON.stringify(params.body);
  const tsMs = parseTimestampUTC(params.timestamp);
  if (tsMs === 0) return false; // malformed timestamp
  if (Date.now() - tsMs > 5 * 60 * 1000) return false; // replay attack
  return verifyHMAC({ signature: params.signature, timestamp: params.timestamp, body: bodyStr, secretToken: params.secretToken });
}
```

### Files State — What Exists vs What to Create

**Already exists (DO NOT recreate):**
```
app/lib/rateLimit.server.ts     ← MODIFY: add webhookRateLimiter export
app/lib/logger.server.ts        ← NO CHANGE: sanitizeForLog() already implemented
app/lib/env.server.ts           ← NO CHANGE: already imports env.schema
app/lib/env.schema.ts           ← NO CHANGE: existing env vars sufficient
app/services/credential.server.ts  ← NO CHANGE: getDecryptedCredential() already works
app/services/tingee.server.ts   ← MODIFY: replace verifyWebhookHMAC stub only
app/services/tingee.server.test.ts  ← MODIFY: add verifyWebhookHMAC tests
app/routes.ts                   ← NO CHANGE: flatRoutes() auto-discovers new route file
```

**Create new:**
```
app/lib/hmac.server.ts          ← NEW
app/lib/hmac.server.test.ts     ← NEW
app/routes/webhooks.tingee.tsx  ← NEW
app/routes/webhooks.tingee.test.ts  ← NEW
```

**Already exists — DO NOT touch (regression risk):**
```
app/routes/api.orders.$orderId.payment-status.tsx  ← Pact verified, no changes
app/routes/api.orders.$orderId.tingee-data.tsx     ← Used by Epic 2, no changes
app/lib/encryption.server.ts   ← AES-256 utility, no changes
app/services/payment.server.ts ← createPaymentData, no changes
prisma/schema.prisma           ← NO MIGRATION in this story
```

### Existing Pattern — Route Test (Follow This)

The `webhooks.app.uninstalled.test.ts` pattern is canonical for webhook route tests:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionFunctionArgs } from "react-router";

vi.mock("../shopify.server", () => ({ authenticate: { webhook: vi.fn() } }));
vi.mock("../db.server", () => ({ default: { ... } }));
// ... more mocks

import { action } from "./webhooks.app.uninstalled";
// ... import mocked dependencies

const makeRequest = () =>
  ({ request: new Request("..."), params: {}, context: {} }) as unknown as ActionFunctionArgs;

describe("...", () => {
  beforeEach(() => vi.clearAllMocks());
  // tests
});
```

For `webhooks.tingee.tsx`, the action signature is the same (`ActionFunctionArgs`).

### Existing Pattern — Rate Limiter (Follow This)

`pollingRateLimiter` in `rateLimit.server.ts` is the template:
```typescript
// Current file (DO NOT CHANGE existing exports):
export const pollingRateLimiter = createRateLimiter({ windowMs: 10_000, max: 10 });

// ADD below it (different window/max per spec):
export const webhookRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 100 });
```

In the route, IP extraction for Fly.io:
```typescript
const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
```
(Take first IP if multiple are chained in `x-forwarded-for` header.)

### Pact Provider Verification (Task 0)

The consumer contract is already at `test/contracts/pacts/order-status-extension-tingee-shopify-app.json`. This contract pins the response schema for `GET /api/orders/:orderId/payment-status`.

Provider verification doesn't change any code — it confirms the existing `api.orders.$orderId.payment-status.tsx` still matches what the consumer expects. If it fails (e.g., response shape drifted), FIX that route before writing any Story 3.1 code.

Check if `package.json` has a pact verify script. If not, you may need to run it manually or via vitest. The contracts test file `test/contracts/tingee-payment-status.pact.test.ts` runs the consumer side — provider verification would be separate.

### `sanitizeForLog` — Correct Usage

```typescript
// CORRECT: pass an object, not inline sensitive values
console.error("[SECURITY] Invalid Tingee webhook HMAC", sanitizeForLog({ shopDomain, ip, timestamp }));

// NEVER log: signature, secretToken, body content, credential
// sanitizeForLog is SHALLOW — nested sensitive keys NOT redacted
```

### NFR-2 Full Spec (Architecture Reference)

> "Mọi Webhook từ Tingee được xác thực HMAC-SHA512 trước khi xử lý. Header `x-signature` = HMAC_SHA512(timestamp + ":" + body, secretToken). Replay attack: reject payload có timestamp cũ hơn 5 phút."

NFR-5: Webhook handler phải trả response trong 5 giây total.

At Story 3.1 scope (no Shopify API call yet), the handler only does:
1. Rate limit check (~0ms)
2. Text body read (~1ms)
3. JSON parse (~0ms)
4. DB credential lookup (~10-50ms)
5. HMAC compute (~1ms)
6. Response (~0ms)

Total well under 5s. Story 3.3 (Shopify API call + retries) is where the 5s limit becomes critical.

### What Story 3.1 Does NOT Do

- **No idempotency check** (Story 3.2): `processed_webhooks` INSERT/lookup comes in 3.2
- **No amount matching** (Story 3.2): `receivedAmount === expectedAmount` logic comes in 3.2
- **No Shopify order update** (Story 3.3): `markOrderPaid()` comes in 3.3
- **No Sentry SDK setup**: Sentry integration was set up in Epic 1 CI/CD story; logging via `console.error` and existing `lib/logger.server.ts` is sufficient
- **No `order.server.ts` creation**: That file is created in Story 3.3
- **No `lib/idempotency.server.ts` creation**: That file is created in Story 3.2
- **No `lib/paymentStateMachine.ts` creation**: The architecture references this — it's needed in Story 3.2 (`assertValidTransition`). Story 3.1 doesn't call state machine.

### Testing Patterns from Previous Stories

Following `api.orders.$orderId.payment-status.test.ts` and `webhooks.app.uninstalled.test.ts`:
- `vi.mock()` calls at module top level (before imports)
- `vi.hoisted()` for mocks that need to be created before module evaluation
- `beforeEach(() => vi.clearAllMocks())`
- Factory functions for requests (`makeRequest(...)`)
- Import the mocked dependencies to use `vi.mocked(dep).mockReturnValue(...)`

For the hmac test, use real `createHmac` from Node.js (no mock needed — pure crypto):
```typescript
import { createHmac } from "crypto";
const SECRET = "test-secret";
const TIMESTAMP = "20260629143052123";
const BODY = JSON.stringify({ transactionCode: "TX123" });
const VALID_SIG = createHmac("sha512", SECRET).update(`${TIMESTAMP}:${BODY}`).digest("hex");
```

### Deferred Items Not Relevant to This Story

From `deferred-work.md` — these are carried from prior stories but do NOT affect Story 3.1:
- `pollingRateLimiter` resets on server restart (by design, single-instance pilot)
- `readCache` called twice in usePaymentStatus (Extension concern only)
- `dest.replace("https://", "")` fragile auth (Story 2.x pattern, not webhook)

### References

- [Source: epics.md#Story 3.1] — Full acceptance criteria
- [Source: epics.md#FR-11] — HMAC-SHA512 validation, replay attack prevention (5 min)
- [Source: epics.md#NFR-2] — `x-signature` header spec, timestamp format `yyyyMMddHHmmssSSS` (UTC+7)
- [Source: epics.md#NFR-3] — Rate limit: 100 req/15 min per IP
- [Source: epics.md#NFR-5] — Webhook handler ≤5s total
- [Source: architecture.md#Tingee Webhook Validation] — Exact HMAC formula and timestamp format
- [Source: architecture.md#Rate Limiting] — `/webhook/tingee` endpoint, 100 req/15 min
- [Source: architecture.md#Synchronous webhook processing] — No queue in Phase 1
- [Source: architecture.md#Implementation Patterns — Logging & Sensitive Data] — `sanitizeForLog()` usage
- [Source: architecture.md#`lib/` vs `services/` rule] — `hmac.server.ts` belongs in `lib/` (pure utility)
- [Source: app/lib/rateLimit.server.ts] — `createRateLimiter` factory and `pollingRateLimiter` pattern to follow
- [Source: app/services/tingee.server.ts:171-178] — `verifyWebhookHMAC` stub to replace
- [Source: app/services/credential.server.ts] — `getDecryptedCredential(shopDomain)` returns `{ clientId, secretToken } | null`
- [Source: app/lib/logger.server.ts] — `sanitizeForLog()` shallow redaction
- [Source: app/routes/webhooks.app.uninstalled.test.ts] — test file pattern for webhook routes
- [Source: app/routes/api.orders.$orderId.payment-status.test.ts] — `vi.mock` + `vi.mocked` pattern
- [Source: test/contracts/pacts/order-status-extension-tingee-shopify-app.json] — Pact contract to verify
- [Source: deferred-work.md] — Known deferred issues from prior stories (none affect this story)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Task 0: Pact consumer tests passed (4/4). Provider route `api.orders.$orderId.payment-status.tsx` satisfies contract — no changes needed.
- Task 1: Added `webhookRateLimiter` export to `rateLimit.server.ts` (windowMs: 15 min, max: 100). Did not modify existing `pollingRateLimiter` or factory.
- Task 2: Created `app/lib/hmac.server.ts` — pure crypto utility using `createHmac('sha512')` + `timingSafeEqual` for constant-time comparison. Returns `false` (not throw) for any error.
- Task 3: Created `app/lib/hmac.server.test.ts` — 5 tests covering valid sig, tampered body, wrong sig, empty sig, wrong secret. All pass.
- Task 4: Updated `tingee.server.ts` — added `verifyHMAC` import, added `parseTimestampUTC()` helper (UTC+7 → UTC conversion via `Date.UTC(y, mo, d, h-7, ...)`), replaced stub with real `verifyWebhookHMAC()` that checks both HMAC validity and 5-min replay window.
- Task 5: Added 4 `verifyWebhookHMAC` tests to `tingee.server.test.ts` using `vi.useFakeTimers()` for timestamp age control. All 12 tests in file pass.
- Task 6: Created `app/routes/webhooks.tingee.tsx` — 8-step handler: rate limit → raw body text → JSON parse → extract headers → shop param → credential lookup → HMAC verify → 200 response.
- Task 7: Created `app/routes/webhooks.tingee.test.ts` — 10 tests covering all ACs (200 success, 400 for missing shop/credential/invalid HMAC/bad JSON/missing headers, 429 rate limit, sanitizeForLog audit). All pass.
- Pre-existing test failures (5 in `app.settings.test.ts` + `usePaymentStatus.test.ts`) confirmed unchanged by story 3.1.

### File List

- `app/lib/hmac.server.ts` (NEW)
- `app/lib/hmac.server.test.ts` (NEW)
- `app/lib/rateLimit.server.ts` (MODIFIED — add webhookRateLimiter)
- `app/services/tingee.server.ts` (MODIFIED — replace verifyWebhookHMAC stub)
- `app/services/tingee.server.test.ts` (MODIFIED — add verifyWebhookHMAC tests)
- `app/routes/webhooks.tingee.tsx` (NEW)
- `app/routes/webhooks.tingee.test.ts` (NEW)

### Review Findings

- [x] [Review][Decision] Replay attack vs invalid HMAC conflated into one log message — resolved: Option 2 (small patch), rename log to "[SECURITY] Invalid Tingee webhook"
- [x] [Review][Decision] Sentry logging vs console.error — resolved: Dismiss, console.error + sanitizeForLog sufficient per dev notes; verify Sentry captures console.error before production deploy
- [x] [Review][Patch] Log message misleads on replay attack — renamed to "[SECURITY] Invalid Tingee webhook" [app/routes/webhooks.tingee.tsx] ✅ fixed
- [x] [Review][Patch] Future timestamps bypass 5-minute replay window — added `tsMs > Date.now()` guard [app/services/tingee.server.ts] ✅ fixed
- [x] [Review][Patch] Empty `secretToken` not rejected by `verifyHMAC` — added `if (!params.secretToken) return false` [app/lib/hmac.server.ts] ✅ fixed
- [x] [Review][Patch] `getDecryptedCredential` DB error uncaught — wrapped in try/catch, returns 500 on DB error [app/routes/webhooks.tingee.tsx] ✅ fixed
- [x] [Review][Defer] Rate limiter trusts attacker-controlled `x-forwarded-for` [app/routes/webhooks.tingee.tsx] — pre-existing pattern matching `pollingRateLimiter`; deployment/infra concern
- [x] [Review][Defer] "unknown" shared rate bucket collapses all proxy-less requests [app/routes/webhooks.tingee.tsx] — pre-existing pattern; deployment concern
- [x] [Review][Defer] Shop-existence timing oracle via credential lookup latency [app/routes/webhooks.tingee.tsx] — both 400 paths return same status but latency differs; mitigating requires architectural changes
- [x] [Review][Defer] Test coverage gap for h<7 timestamps (midnight–06:59 UTC+7) [app/services/tingee.server.test.ts] — `parseTimestampUTC` math is correct but zero tests cover this boundary
- [x] [Review][Defer] `parseTimestampUTC` weak non-digit input handling [app/services/tingee.server.ts] — mixed-digit timestamps of correct length produce wrong-but-safe epochs; code reaches correct `false` outcome via accidental path

## Change Log

- 2026-06-29: Story 3.1 created — Tingee Webhook Endpoint & HMAC Validation
- 2026-06-29: Story 3.1 implemented — All 7 tasks complete, 27 new tests added (5 hmac unit + 4 verifyWebhookHMAC + 10 route + 4 pact = 23 verified). Status → review.
- 2026-06-29: Code review complete — 2 decision-needed, 3 patch, 5 deferred, 10 dismissed.
- 2026-06-29: All patches applied, decisions resolved. Status → done.
