---
baseline_commit: 339a4d6c6a1cace2553f75466893f6f452c5dc84
---

# Story 2.2: Payment Status Polling Endpoint

Status: done

## Story

As a buyer,
I want the Order Status page to know my payment has been confirmed without me refreshing,
So that I get instant feedback when my transaction goes through.

## Acceptance Criteria

1. **Given** `GET /api/orders/:orderId/payment-status` is called (authenticated via `authenticate.public.checkout()`), **When** the order exists and belongs to the correct merchant, **Then** the endpoint returns `{ status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED', paidAt?: string }` — `paidAt` is ISO 8601 UTC, present only when `COMPLETED`
2. **Given** the order's `Payment.expiresAt` has passed and status is still `PENDING`, **When** the endpoint is called, **Then** status is updated to `EXPIRED` in DB and returned as `{ status: 'EXPIRED' }` — no `paidAt`
3. **Given** the order is marked `SUCCESS` in DB (set by Epic 3 webhook handler), **When** the Extension polls, **Then** `{ status: 'COMPLETED', paidAt: '<ISO timestamp>' }` is returned — `paidAt` derived from `Payment.updatedAt` (time the status last changed), Extension stops polling on receipt
4. **Given** the polling endpoint is called at high frequency, **When** rate limit is exceeded, **Then** HTTP 429 is returned — Extension treats this as a failure and applies backoff (does not crash)
5. **Given** Pact consumer test for `GET /api/orders/:orderId/payment-status`, **When** the test runs, **Then** response schema `{ status: PaymentStatus, paidAt?: string }` is pinned and committed to `test/contracts/` — Epic 3 MUST run Pact provider verification before merging any change to this endpoint's response shape

## Tasks / Subtasks

- [x] Task 1: Create `app/lib/rateLimit.server.ts` — in-memory sliding window rate limiter (AC: #4)

  - [x] Export `createRateLimiter({ windowMs, max })` factory returning `checkRateLimit(key: string): boolean`
  - [x] Implementation: `Map<string, number[]>` tracking timestamps per key, evict entries older than `windowMs`
  - [x] Single-instance scope (no Redis) — sufficient for 100-merchant pilot
  - [x] Export a preconfigured `pollingRateLimiter` instance: `{ windowMs: 10_000, max: 10 }` (10 req/10s per orderId+shop)

- [x] Task 2: Create route `app/routes/api.orders.$orderId.payment-status.tsx` (AC: #1, #2, #3, #4)

  - [x] Only export `loader` — GET endpoint
  - [x] Auth: `authenticate.public.checkout(request)` — NOT `authenticate.admin()`
  - [x] Guard `sessionToken.dest` for null/undefined (return 401 if missing — same pattern as story 2.1)
  - [x] Shop from `sessionToken.dest.replace("https://", "")` — never from URL params (IDOR prevention)
  - [x] Rate limit check: `pollingRateLimiter.check(\`${shop}:${orderId}\`)` → 429 if exceeded
  - [x] DB query: `db.payment.findFirst({ where: { orderId, shopDomain: shop } })`
  - [x] If no record → return 404 `{ error: "Payment not found", code: "NOT_FOUND" }`
  - [x] DB status mapping (DB enum → response):
    - `PENDING` → `{ status: 'PENDING' }` (also check expiry first — see AC#2)
    - `PROCESSING` → `{ status: 'PENDING' }` (still in-flight, treat as pending for buyer UI)
    - `SUCCESS` → `{ status: 'COMPLETED', paidAt: payment.updatedAt.toISOString() }`
    - `FAILED` → `{ status: 'FAILED' }`
    - `EXPIRED` → `{ status: 'EXPIRED' }`
  - [x] Expiry check (only when DB status is `PENDING` or `PROCESSING`):
    ```typescript
    if (
      (payment.status === "PENDING" || payment.status === "PROCESSING") &&
      payment.expiresAt < new Date()
    ) {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: "EXPIRED" },
      });
      return Response.json({ status: "EXPIRED" });
    }
    ```
  - [x] Use `Response.json()` (Node 22 native) — NOT `json()` from react-router (see story 2.1 Debug Log)

- [x] Task 3: Create unit tests `app/routes/api.orders.$orderId.payment-status.test.ts` (AC: #1, #2, #3, #4)

  - [x] Mock pattern (reuse from story 2.1):
    ```typescript
    vi.mock("../shopify.server", () => ({
      authenticate: { public: { checkout: vi.fn() } },
    }));
    vi.mock("../db.server", () => ({
      default: { payment: { findFirst: vi.fn(), update: vi.fn() } },
    }));
    vi.mock("../lib/rateLimit.server", () => ({
      pollingRateLimiter: { check: vi.fn().mockReturnValue(false) },
    }));
    vi.mocked(authenticate.public.checkout).mockResolvedValue({
      sessionToken: { dest: "https://test.myshopify.com" },
    } as any);
    ```
  - [x] Test: PENDING status (not expired) → 200 `{ status: 'PENDING' }`
  - [x] Test: PROCESSING status → 200 `{ status: 'PENDING' }` (mapped)
  - [x] Test: SUCCESS status → 200 `{ status: 'COMPLETED', paidAt: '<iso string>' }`
  - [x] Test: FAILED status → 200 `{ status: 'FAILED' }`
  - [x] Test: EXPIRED status (already in DB) → 200 `{ status: 'EXPIRED' }`
  - [x] Test: PENDING + `expiresAt` in past → DB update called, returns `{ status: 'EXPIRED' }`
  - [x] Test: payment not found → 404
  - [x] Test: rate limit exceeded (pollingRateLimiter.check returns true) → 429
  - [x] Test (IDOR): shop derived from sessionToken.dest, not query params
  - [x] Test: missing sessionToken.dest → 401

- [x] Task 4: Create Pact consumer test `test/contracts/tingee-payment-status.pact.test.ts` (AC: #5)

  - [x] Consumer: `order-status-extension`, Provider: `tingee-shopify-app`
  - [x] Interaction 1: PENDING state
    ```typescript
    {
      state: "order 123 payment is PENDING and not expired",
      uponReceiving: "a polling request for payment status",
      withRequest: { method: "GET", path: "/api/orders/gid://shopify/Order/123/payment-status" },
      willRespondWith: { status: 200, body: { status: "PENDING" } }
    }
    ```
  - [x] Interaction 2: COMPLETED state
    ```typescript
    {
      state: "order 123 payment is COMPLETED",
      uponReceiving: "a polling request for completed payment status",
      willRespondWith: {
        status: 200,
        body: {
          status: "COMPLETED",
          paidAt: like("2026-06-24T10:00:00.000Z"),
        }
      }
    }
    ```
  - [x] Interaction 3: EXPIRED state → `{ status: "EXPIRED" }`, no `paidAt`
  - [x] Commit pact file to `test/contracts/pacts/`
  - [x] Note in file: "Epic 3 MUST run pact verify against this contract before merging"

## Dev Notes

### Auth Boundary — CRITICAL (same as story 2.1)

```
Admin routes (app/routes/app.*)       → authenticate.admin(request)
Extension API routes (api/orders/*)   → authenticate.public.checkout(request)  ← THIS ROUTE
Webhook routes (webhooks.*)           → authenticate.webhook(request)
```

**Never use `authenticate.admin()` here** — Extension doesn't have admin session.

### DB Status vs Response Status Mapping

The Payment model uses `PaymentStatus` enum: `PENDING | PROCESSING | SUCCESS | FAILED | EXPIRED`

The polling response uses: `PENDING | COMPLETED | FAILED | EXPIRED`

**Critical mapping:**

- DB `PROCESSING` → response `PENDING` — buyer UI has no "processing" state, keep showing pending
- DB `SUCCESS` → response `COMPLETED` — "success" is internal; "completed" is buyer-facing
- DB `SUCCESS` → include `paidAt: payment.updatedAt.toISOString()` — `updatedAt` is auto-set by Prisma when status changed to SUCCESS

There is **no `paidAt` column** on the Payment model (schema is frozen from Story 1.1). Use `payment.updatedAt`.

### Expiry Check Logic

Only auto-expire when status is mutable (PENDING or PROCESSING). Terminal states (SUCCESS, FAILED, EXPIRED) skip expiry check:

```typescript
const isExpired = payment.expiresAt < new Date();
const isMutableState =
  payment.status === "PENDING" || payment.status === "PROCESSING";

if (isMutableState && isExpired) {
  await db.payment.update({
    where: { id: payment.id },
    data: { status: "EXPIRED" },
  });
  return Response.json({ status: "EXPIRED" });
}
```

### Rate Limiter Design

Simple in-memory implementation (not Redis) — single-instance scope, fits 100-merchant pilot:

```typescript
// app/lib/rateLimit.server.ts
interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

export function createRateLimiter(opts: RateLimiterOptions) {
  const windows = new Map<string, number[]>();
  return {
    check(key: string): boolean {
      // returns true if rate limited
      const now = Date.now();
      const hits = (windows.get(key) ?? []).filter(
        (t) => now - t < opts.windowMs,
      );
      if (hits.length >= opts.max) return true;
      windows.set(key, [...hits, now]);
      return false;
    },
  };
}

export const pollingRateLimiter = createRateLimiter({
  windowMs: 10_000,
  max: 10,
});
```

Key: `${shop}:${orderId}` — per-buyer per-order limit. 10 requests/10s ≫ normal 5s polling. Triggers only on abuse.

### Route File Naming (React Router 7 flatRoutes)

File: `app/routes/api.orders.$orderId.payment-status.tsx`
URL: `/api/orders/:orderId/payment-status`

Same convention as story 2.1's `api.orders.$orderId.tingee-data.tsx`.

### IDOR Prevention (same as story 2.1)

```typescript
const { sessionToken } = await authenticate.public.checkout(request);
const dest = (sessionToken as any)?.dest;
if (!dest || typeof dest !== "string") {
  return Response.json(
    { error: "Invalid session", code: "UNAUTHORIZED" },
    { status: 401 },
  );
}
const shop = dest.replace("https://", "");
```

`shop` is NEVER taken from URL params or query string. Every DB query filters by `shopDomain: shop`.

### Response.json() vs json() from react-router

**Use `Response.json()` (Node 22 native), NOT `json()` from react-router.**

From story 2.1 Debug Log: `data()` from react-router v7 returns `DataWithResponseInit`, not standard `Response`. Tests need to call `.json()` directly. Use `Response.json()` as done in the tingee-data route.

### Pact Test Pattern (reuse from story 2.1)

From `test/contracts/tingee-payment-data.pact.test.ts`:

```typescript
// Use executeTest(async (mockServer) => { ... }) to make real HTTP call
// Consumer: "order-status-extension", Provider: "tingee-shopify-app"
// Pact file generated to: test/contracts/pacts/
// Import { like, regex } from "@pact-foundation/pact/src/dsl/matchers"
```

The PaymentStatus enum matcher for Pact:

```typescript
regex(/(PENDING|COMPLETED|FAILED|EXPIRED)/, "PENDING"); // not like("PENDING")
```

### Files Summary

**CREATE:**

| File                                                    | Purpose                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `app/lib/rateLimit.server.ts`                           | In-memory sliding window rate limiter; export `pollingRateLimiter` instance                    |
| `app/routes/api.orders.$orderId.payment-status.tsx`     | GET polling endpoint; auth, expiry check, status mapping                                       |
| `app/routes/api.orders.$orderId.payment-status.test.ts` | Unit tests (PENDING, PROCESSING, SUCCESS, FAILED, EXPIRED, expiry auto-update, 429, 404, IDOR) |
| `test/contracts/tingee-payment-status.pact.test.ts`     | Pact consumer: pin response schema for PENDING/COMPLETED/EXPIRED                               |

**DO NOT TOUCH:**

| File                                             | Reason                                                       |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `prisma/schema.prisma`                           | Schema frozen — no new columns; use `updatedAt` for `paidAt` |
| `app/shopify.server.ts`                          | Shopify template file — never modify                         |
| `app/services/payment.server.ts`                 | No changes needed for this story                             |
| `app/services/tingee.server.ts`                  | `verifyWebhookHMAC` stub remains for Story 3.1               |
| `app/routes/api.orders.$orderId.tingee-data.tsx` | Already done in story 2.1 — do not modify                    |

**DO NOT CREATE:**

- No new Prisma models or migrations — `Payment` schema is frozen
- No `paidAt` column migration — use `updatedAt` instead

### Previous Story Context (from story 2.1 Dev Notes & Review)

**Patterns already established — follow exactly:**

- `authenticate.public.checkout()` → `sessionToken.dest` for shop
- `Response.json()` not `json()` from react-router
- Vitest mock: `vi.mock("../db.server", () => ({ default: { payment: { ... } } }))`
- Tests: use `vi.fn()` (not arrow functions) for class mocks to avoid Vitest v4 ESM issue

**Review findings from story 2.1 to NOT repeat:**

- `sessionToken.dest` without null guard → added guard for 401 (already fixed in this story's tasks)
- `parseInt` + `Number.isInteger` no-op → this story only uses status from DB, no user-provided integers to parse
- `bankBin` empty string silently ignored → not relevant here (no Tingee API calls)

### References

- [Source: epics.md#Story 2.2] — Full acceptance criteria
- [Source: epics.md#Epic 2 Overview] — Two-endpoint API pattern requirement
- [Source: architecture.md#API & Communication Patterns] — Polling contract, stop conditions
- [Source: architecture.md#API & Communication Patterns] — Rate limit "chống self-DoS từ 100 merchants × 5s"
- [Source: architecture.md#Project Structure] — `app/routes/api.orders.$orderId.*.tsx` naming
- [Source: architecture.md#Frontend Architecture] — `COMPLETED` is terminal, polling stops
- [Source: architecture.md#Implementation Readiness Validation #5] — Full polling contract spec
- [Source: story 2.1 Dev Notes#Route File Naming] — flatRoutes convention
- [Source: story 2.1 Dev Notes#Auth Boundary] — `authenticate.public.checkout()` rule
- [Source: story 2.1 Debug Log] — `Response.json()` vs `json()`, Vitest arrow function limitation
- [Source: story 2.1 Review Findings] — `sessionToken.dest` null guard pattern

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Pre-existing failures in `app/routes/app.settings.test.ts` (4 tests) confirmed pre-date this story — verified via git stash before/after comparison. No regressions introduced.

### Completion Notes List

- Implemented `app/lib/rateLimit.server.ts`: sliding window rate limiter using `Map<string, number[]>`. `createRateLimiter` factory + preconfigured `pollingRateLimiter` (10 req/10s). Returns `true` if rate limited.
- Implemented `app/routes/api.orders.$orderId.payment-status.tsx`: GET-only loader, `authenticate.public.checkout()` auth, IDOR protection via `sessionToken.dest`, expiry auto-update for PENDING/PROCESSING states, full DB enum → response status mapping, `Response.json()` (Node 22 native).
- 11 unit tests covering all ACs: PENDING, PROCESSING→PENDING, SUCCESS→COMPLETED+paidAt, FAILED, EXPIRED (DB), auto-expire PENDING & PROCESSING, 404, 429, IDOR, 401.
- 3 Pact consumer tests pinning schema for PENDING, COMPLETED+paidAt, EXPIRED states. Pact file generated to `test/contracts/pacts/`.

### File List

- `app/lib/rateLimit.server.ts` (created)
- `app/routes/api.orders.$orderId.payment-status.tsx` (created)
- `app/routes/api.orders.$orderId.payment-status.test.ts` (created)
- `test/contracts/tingee-payment-status.pact.test.ts` (created)
- `test/contracts/pacts/order-status-extension-tingee-shopify-app.json` (updated by Pact runner)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (updated)
- `_bmad-output/implementation-artifacts/2-2-payment-status-polling-endpoint.md` (updated)

### Review Findings

- [x] [Review][Patch] Rate limiter Map keys never evicted — unbounded memory growth under sustained load [app/lib/rateLimit.server.ts]
- [x] [Review][Patch] Expiry update TOCTOU race — concurrent pollers both pass `isMutableState && isExpired` before either write completes; use status precondition in `updateMany` [app/routes/api.orders.$orderId.payment-status.tsx]
- [x] [Review][Patch] `check()` returns `true` to mean "blocked" — inverted boolean convention confuses future callers; rename to `isRateLimited()` or invert return [app/lib/rateLimit.server.ts]
- [x] [Review][Patch] No try/catch around DB calls — `findFirst` and `update` throw unhandled on transient DB error [app/routes/api.orders.$orderId.payment-status.tsx]
- [x] [Review][Patch] No `Retry-After` header on 429 response — client has no signal for when to safely retry [app/routes/api.orders.$orderId.payment-status.tsx]
- [x] [Review][Patch] `PROCESSING` → `PENDING` mapping is implicit `default` — future statuses silently return PENDING; add explicit `case "PROCESSING":` arm and let `default` throw [app/routes/api.orders.$orderId.payment-status.tsx]
- [x] [Review][Patch] `findFirst` without `orderBy` on non-unique `(orderId, shopDomain)` pair — picks arbitrary row if duplicates exist; add `orderBy: { createdAt: "desc" }` [app/routes/api.orders.$orderId.payment-status.tsx]
- [x] [Review][Patch] Rate limit check occurs before ownership verification — timing allows probing orderId existence via 429 vs 404; move rate limit check after `db.payment.findFirst` [app/routes/api.orders.$orderId.payment-status.tsx]
- [x] [Review][Patch] `FAILED` status not pinned in Pact consumer contract — AC5 requires full `PaymentStatus` schema to be pinned; add FAILED interaction [test/contracts/tingee-payment-status.pact.test.ts]
- [x] [Review][Patch] Missing test for `orderId` absent from `params` — 400 path is untested [app/routes/api.orders.$orderId.payment-status.test.ts]
- [x] [Review][Defer] In-memory rate limiter resets on server restart — by design (single-instance, 100-merchant pilot); revisit when scaling beyond single instance
- [x] [Review][Defer] `dest.replace("https://", "")` fragile — inherited pattern from Story 2.1, not introduced here; tracked in deferred-work.md
- [x] [Review][Defer] `paidAt` uses `updatedAt` which can be overwritten — schema frozen (Story 1.1); acceptable for pilot, revisit with schema migration
- [x] [Review][Defer] No `Cache-Control`/polling hints on 200 responses — out of Story 2.2 scope; belongs to Story 2.5 (polling behavior)
- [x] [Review][Defer] `expiresAt` wall clock `new Date()` not injectable — minor test robustness concern; not a production bug
- [x] [Review][Defer] `authenticate.public.checkout` throws uncaught — Shopify SDK owns auth error handling; consistent with established pattern

## Change Log

- 2026-06-24: Implemented Story 2.2 — payment status polling endpoint with rate limiting, expiry auto-update, and Pact consumer contract
- 2026-06-25: Code review complete — 10 patch findings, 6 deferred, 7 dismissed
