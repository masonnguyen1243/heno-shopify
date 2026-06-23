---
baseline_commit: 0751dd989ade46e7e760e080651fe5a9b72f6c4d
---

# Story 1.6: App Uninstall & GDPR Compliance

Status: done

## Story

As a merchant,
I want my store's complete data to be removed automatically when I uninstall the app,
So that Tingee Payment App complies with Shopify's GDPR requirements and respects my data privacy.

## Acceptance Criteria

1. **Given** Shopify sends `APP_UNINSTALLED` webhook to `routes/webhooks.app.uninstalled.tsx`, **When** received and validated, **Then** `MerchantCredential` is deleted, "Thanh toán qua Tingee QR" payment method is unregistered, and `Merchant.uninstalledAt` is set — all initiated within the webhook handler (completion within 48h per Shopify GDPR policy)

2. **Given** Shopify sends `customers/data_request` webhook, **When** received, **Then** HTTP 200 is returned; response confirms no customer PII is stored by this app in Phase 1

3. **Given** Shopify sends `customers/redact` webhook, **When** received, **Then** any `Payment` records linked to that customer's orders are deleted, HTTP 200 returned

4. **Given** Shopify sends `shop/redact` webhook, **When** received, **Then** ALL records for that `shop_domain` are explicitly deleted in FK-safe order: `ProcessedWebhook`, `Payment`, `MerchantCredential`, `Merchant` — test asserts each table is queried explicitly (no wildcards)

5. **Given** any GDPR webhook handler, **When** an error occurs during processing, **Then** HTTP 200 is still returned (Shopify requirement) and the error is logged via `console.error` + `sanitizeForLog()` for manual follow-up

## Tasks / Subtasks

- [x] Task 1: Update `app/routes/webhooks.app.uninstalled.tsx` — full cleanup on APP_UNINSTALLED (AC: #1, #5)
  - [x] Add imports: `deleteCredential` from `../services/credential.server`, `unregisterPaymentMethod` from `../services/order.server`, `sanitizeForLog` from `../lib/logger.server`, `db` from `../db.server`
  - [x] `db.merchant.updateMany({ where: { shopDomain: shop }, data: { uninstalledAt: new Date() } })` — use `updateMany` (not `update`) to avoid throw if merchant already deleted
  - [x] If `session?.accessToken` exists: call `unregisterPaymentMethod(shop, session.accessToken)` wrapped in try/catch — Shopify may have already revoked the access token on uninstall; log error via `sanitizeForLog()` but continue
  - [x] Call `deleteCredential(shop)` — already idempotent via `deleteMany`, safe to call even if no credential
  - [x] Keep existing session deletion: `db.session.deleteMany({ where: { shop } })`
  - [x] Return `new Response()` (200 OK)
  - [x] No outer try/catch needed for APP_UNINSTALLED (partial cleanup is acceptable; Shopify does NOT retry this webhook; GDPR 48h window covers any failures)

- [x] Task 2: Update `shopify.app.toml` — fix webhook subscription URIs to match actual route files (AC: prerequisite for all GDPR handlers)
  - [x] Change `app/uninstalled` subscription to `uri = "/webhooks/app/uninstalled"` (matches existing file `webhooks.app.uninstalled.tsx`)
  - [x] Change `customers/data_request` subscription to `uri = "/webhooks/customers/data_request"`
  - [x] Change `customers/redact` subscription to `uri = "/webhooks/customers/redact"`
  - [x] Change `shop/redact` subscription to `uri = "/webhooks/shop/redact"`

- [x] Task 3: Create `app/routes/webhooks.customers.data_request.tsx` — GDPR data request handler (AC: #2, #5)
  - [x] `const { shop, topic } = await authenticate.webhook(request)`
  - [x] `console.log(\`Received ${topic} webhook for ${shop}\`)` (matches existing log pattern)
  - [x] Wrap in try/catch — return 200 even on error; log error via `sanitizeForLog()`
  - [x] Phase 1: No customer PII stored — return `new Response()` (200 OK)
  - [x] No DB operations needed (we store `orderId` + `shopDomain` only, not customer identifiers)

- [x] Task 4: Create `app/routes/webhooks.customers.redact.tsx` — GDPR customer redact handler (AC: #3, #5)
  - [x] `const { shop, topic, payload } = await authenticate.webhook(request)`
  - [x] Cast payload: `const { orders_to_redact } = payload as { orders_to_redact?: string[] }`
  - [x] Wrap entire body in try/catch — MUST return 200 even on error (AC #5); log via `sanitizeForLog()`
  - [x] If `orders_to_redact` exists and is non-empty: `await db.payment.deleteMany({ where: { shopDomain: shop, orderId: { in: orders_to_redact } } })`
  - [x] Return `new Response()` (200 OK) — always, including inside catch

- [x] Task 5: Create `app/routes/webhooks.shop.redact.tsx` — GDPR shop redact handler (AC: #4, #5)
  - [x] `const { shop, topic } = await authenticate.webhook(request)`
  - [x] Wrap entire body in try/catch — MUST return 200 even on error (AC #5); log via `sanitizeForLog()`
  - [x] Delete in explicit FK-safe order (each call explicit per AC #4 — no batching, no wildcards):
    1. `await db.processedWebhook.deleteMany({ where: { shopDomain: shop } })`
    2. `await db.payment.deleteMany({ where: { shopDomain: shop } })`
    3. `await db.merchantCredential.deleteMany({ where: { merchant: { shopDomain: shop } } })`
    4. `await db.merchant.deleteMany({ where: { shopDomain: shop } })`
    5. `await db.session.deleteMany({ where: { shop } })`
  - [x] Note: `MerchantCredential` has `onDelete: Cascade` on Merchant FK — calling `deleteMany` on it explicitly before deleting Merchant satisfies AC #4 test requirement
  - [x] Return `new Response()` (200 OK) — always, including inside catch

- [x] Task 6: Create `app/routes/webhooks.app.uninstalled.test.ts` (AC: #1)
  - [x] Mock `../shopify.server`, `../db.server`, `../services/credential.server`, `../services/order.server`, `../lib/logger.server`
  - [x] Test: session exists → `updateMany` called with `{ uninstalledAt: expect.any(Date) }`, `unregisterPaymentMethod` called, `deleteCredential` called, `session.deleteMany` called → returns 200
  - [x] Test: session is null → `unregisterPaymentMethod` NOT called; `updateMany`, `deleteCredential`, `session.deleteMany` still called → returns 200
  - [x] Test: `unregisterPaymentMethod` throws → error caught and logged; `deleteCredential` STILL called (unregister failure doesn't abort credential deletion) → returns 200

- [x] Task 7: Create `app/routes/webhooks.customers.data_request.test.ts` (AC: #2)
  - [x] Test: always returns 200 regardless of payload
  - [x] Test: no DB operations called

- [x] Task 8: Create `app/routes/webhooks.customers.redact.test.ts` (AC: #3, #5)
  - [x] Mock `db.payment.deleteMany`
  - [x] Test: `orders_to_redact` present → `payment.deleteMany` called with `{ shopDomain: shop, orderId: { in: orders } }` → returns 200
  - [x] Test: `orders_to_redact` is empty array → `payment.deleteMany` NOT called → returns 200
  - [x] Test: `db.payment.deleteMany` throws → still returns 200, error logged

- [x] Task 9: Create `app/routes/webhooks.shop.redact.test.ts` (AC: #4, #5)
  - [x] Mock all 5 db models: `db.processedWebhook`, `db.payment`, `db.merchantCredential`, `db.merchant`, `db.session`
  - [x] Test: all 5 `deleteMany` called in order → returns 200
  - [x] Test: assert `db.processedWebhook.deleteMany` called before `db.payment.deleteMany` (order matters)
  - [x] Test: `db.merchant.deleteMany` throws → still returns 200, error logged
  - [x] Test: each model's `deleteMany` called with explicit shop filter (no undefined/wildcards)

### Review Findings

- [x] [Review][Decision] D1: shop/redact — single try/catch aborts remaining GDPR deletions on early failure — FIXED: mỗi deleteMany giờ có try/catch riêng qua `redactStep` helper [webhooks.shop.redact.tsx]
- [x] [Review][Decision] D2: customers/redact — `orders_to_redact` không có `Array.isArray()` guard — FIXED: thay `orders_to_redact &&` bằng `Array.isArray(orders_to_redact)` [webhooks.customers.redact.tsx]
- [x] [Review][Decision] D3: app/uninstalled — `updateMany` không có guard `where: { uninstalledAt: null }` — FIXED: thêm guard vào where clause [webhooks.app.uninstalled.tsx]
- [x] [Review][Patch] P1: Typo domain trong test — false positive, file thực tế đã đúng [webhooks.app.uninstalled.test.ts]
- [x] [Review][Patch] P2: Empty try/catch trong customers/data_request — FIXED: xóa dead try/catch, giữ lại comment [webhooks.customers.data_request.tsx]
- [x] [Review][Patch] P3: shop/redact test "merchant throws" không mock session.deleteMany — FIXED: thêm mock + assert session.deleteMany vẫn được gọi [webhooks.shop.redact.test.ts]
- [x] [Review][Defer] D4: APP_UNINSTALLED partial failure — GDPR 48h window xử lý per dev notes; Shopify không retry webhook này [webhooks.app.uninstalled.tsx] — deferred, pre-existing design decision
- [x] [Review][Defer] D5: unregisterPaymentMethod failure logged and swallowed — token có thể đã bị Shopify revoke; design decision per dev notes [webhooks.app.uninstalled.tsx] — deferred, pre-existing design decision
- [x] [Review][Defer] D6: Race condition concurrent duplicate app/uninstalled deliveries — architectural concern, updateMany/deleteMany đã idempotent [webhooks.app.uninstalled.tsx] — deferred, out of scope
- [x] [Review][Defer] D7: unregisterPaymentMethod không treat 404 DELETE là "already gone" — existing service code trong order.server.ts [app/services/order.server.ts] — deferred, pre-existing
- [x] [Review][Defer] D8: unregisterPaymentMethod không handle non-JSON response từ Shopify list call — existing service code [app/services/order.server.ts] — deferred, pre-existing
- [x] [Review][Defer] D9: Merchant row không tồn tại khi uninstall (updateMany count:0) — idempotent by design [webhooks.app.uninstalled.tsx] — deferred, pre-existing
- [x] [Review][Defer] D10: AC2 empty response body — Shopify chỉ cần HTTP 200 để acknowledge data_request, không bắt buộc body [webhooks.customers.data_request.tsx] — deferred, acceptable

## Dev Notes

### Key Architecture Patterns

**Webhook authentication:** All handlers use `authenticate.webhook(request)` from `../shopify.server`. This validates Shopify HMAC signature. Never skip this call — returns `{ shop, session, topic, payload }`.

**`session` may be null** in `APP_UNINSTALLED` handlers. The Shopify session for the shop may already be deleted if the webhook fires on a re-uninstall or retry. Always use optional chaining: `session?.accessToken`.

**GDPR 200-always rule:** AC #5 is non-negotiable. All GDPR webhook handlers (`customers/data_request`, `customers/redact`, `shop/redact`) MUST return HTTP 200 even if processing fails. Shopify will stop retrying otherwise. Use `try/catch` wrapping the entire handler body.

**APP_UNINSTALLED exception:** No outer try/catch needed. Shopify does NOT retry `app/uninstalled`. Partial cleanup is acceptable — GDPR 48h window handles this. If `updateMany` fails, the 48h window allows manual recovery.

### Reusing Existing Services

**DO NOT rewrite** — use these functions from prior stories:

```typescript
// Already in app/services/credential.server.ts — idempotent via deleteMany
import { deleteCredential } from "../services/credential.server";

// Already in app/services/order.server.ts
import { unregisterPaymentMethod } from "../services/order.server";

// Already in app/lib/logger.server.ts
import { sanitizeForLog } from "../lib/logger.server";
```

### APP_UNINSTALLED Handler — Complete Implementation

```typescript
// app/routes/webhooks.app.uninstalled.tsx — replace file content
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteCredential } from "../services/credential.server";
import { unregisterPaymentMethod } from "../services/order.server";
import { sanitizeForLog } from "../lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // 1. Mark merchant as uninstalled
  await db.merchant.updateMany({
    where: { shopDomain: shop },
    data: { uninstalledAt: new Date() },
  });

  // 2. Unregister payment method — requires accessToken from live session
  // session may be null if already uninstalled; Shopify may have revoked token
  if (session?.accessToken) {
    try {
      await unregisterPaymentMethod(shop, session.accessToken);
    } catch (error) {
      console.error(
        "Failed to unregister payment method during uninstall",
        sanitizeForLog({
          shop,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  // 3. Delete credential (idempotent — deleteMany won't throw if not found)
  await deleteCredential(shop);

  // 4. Delete Shopify sessions (existing behavior)
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
```

### shopify.app.toml — Webhook URI Fix

Current `shopify.app.toml` has all 4 webhooks pointing to `uri = "/webhooks"` — **this is incorrect**. The actual React Router 7 routes (in dot-notation) map to specific paths. Replace the `[webhooks]` section:

```toml
[webhooks]
api_version = "2025-07"

  [[webhooks.subscriptions]]
  uri = "/webhooks/app/uninstalled"
  topics = [ "app/uninstalled" ]

  [[webhooks.subscriptions]]
  uri = "/webhooks/customers/data_request"
  topics = [ "customers/data_request" ]

  [[webhooks.subscriptions]]
  uri = "/webhooks/customers/redact"
  topics = [ "customers/redact" ]

  [[webhooks.subscriptions]]
  uri = "/webhooks/shop/redact"
  topics = [ "shop/redact" ]
```

### GDPR Handler — customers/data_request

```typescript
// app/routes/webhooks.customers.data_request.tsx
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { sanitizeForLog } from "../lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // Phase 1: No customer PII stored.
    // Payment records contain orderId (Shopify GID) and amount only — no name, email, or address.
  } catch (error) {
    console.error(
      "GDPR customers/data_request error",
      sanitizeForLog({ shop, errorMessage: error instanceof Error ? error.message : String(error) })
    );
  }

  return new Response();
};
```

### GDPR Handler — customers/redact

```typescript
// app/routes/webhooks.customers.redact.tsx
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sanitizeForLog } from "../lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    const { orders_to_redact } = payload as { orders_to_redact?: string[] };
    if (orders_to_redact && orders_to_redact.length > 0) {
      await db.payment.deleteMany({
        where: { shopDomain: shop, orderId: { in: orders_to_redact } },
      });
    }
  } catch (error) {
    console.error(
      "GDPR customers/redact error",
      sanitizeForLog({ shop, errorMessage: error instanceof Error ? error.message : String(error) })
    );
  }

  return new Response();
};
```

### GDPR Handler — shop/redact

```typescript
// app/routes/webhooks.shop.redact.tsx
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sanitizeForLog } from "../lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // FK-safe deletion order — explicit calls required by AC #4 test assertion
    await db.processedWebhook.deleteMany({ where: { shopDomain: shop } });
    await db.payment.deleteMany({ where: { shopDomain: shop } });
    // MerchantCredential has onDelete:Cascade on Merchant FK, but delete explicitly for test auditability
    await db.merchantCredential.deleteMany({ where: { merchant: { shopDomain: shop } } });
    await db.merchant.deleteMany({ where: { shopDomain: shop } });
    await db.session.deleteMany({ where: { shop } });
  } catch (error) {
    console.error(
      "GDPR shop/redact error",
      sanitizeForLog({ shop, errorMessage: error instanceof Error ? error.message : String(error) })
    );
  }

  return new Response();
};
```

### Test Pattern (follow app.settings.test.ts)

```typescript
// app/routes/webhooks.app.uninstalled.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionFunctionArgs } from "react-router";

vi.mock("../shopify.server", () => ({ authenticate: { webhook: vi.fn() } }));
vi.mock("../db.server", () => ({
  default: {
    merchant: { updateMany: vi.fn() },
    session: { deleteMany: vi.fn() },
  },
}));
vi.mock("../services/credential.server", () => ({ deleteCredential: vi.fn() }));
vi.mock("../services/order.server", () => ({ unregisterPaymentMethod: vi.fn() }));
vi.mock("../lib/logger.server", () => ({ sanitizeForLog: vi.fn((obj) => obj) }));

import { action } from "./webhooks.app.uninstalled";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteCredential } from "../services/credential.server";
import { unregisterPaymentMethod } from "../services/order.server";

const makeRequest = () =>
  ({ request: new Request("http://localhost/webhooks/app/uninstalled", { method: "POST" }), params: {}, context: {} }) as unknown as ActionFunctionArgs;

describe("APP_UNINSTALLED webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("full cleanup when session exists", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      session: { accessToken: "tok_123" } as any,
      topic: "APP_UNINSTALLED",
      payload: {},
    } as any);
    vi.mocked(db.merchant.updateMany).mockResolvedValueOnce({ count: 1 } as any);
    vi.mocked(db.session.deleteMany).mockResolvedValueOnce({ count: 1 } as any);

    const res = await action(makeRequest());
    expect(res.status).toBe(200);
    expect(db.merchant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ uninstalledAt: expect.any(Date) }) }));
    expect(unregisterPaymentMethod).toHaveBeenCalledWith("test.myshopify.com", "tok_123");
    expect(deleteCredential).toHaveBeenCalledWith("test.myshopify.com");
    expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { shop: "test.myshopify.com" } });
  });

  it("skips unregisterPaymentMethod when session is null", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com", session: null, topic: "APP_UNINSTALLED", payload: {},
    } as any);
    vi.mocked(db.merchant.updateMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.session.deleteMany).mockResolvedValueOnce({ count: 0 } as any);

    const res = await action(makeRequest());
    expect(res.status).toBe(200);
    expect(unregisterPaymentMethod).not.toHaveBeenCalled();
    expect(deleteCredential).toHaveBeenCalled();
  });

  it("continues to deleteCredential if unregisterPaymentMethod throws", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      session: { accessToken: "tok_123" } as any,
      topic: "APP_UNINSTALLED", payload: {},
    } as any);
    vi.mocked(db.merchant.updateMany).mockResolvedValueOnce({ count: 1 } as any);
    vi.mocked(unregisterPaymentMethod).mockRejectedValueOnce(new Error("Shopify 401"));
    vi.mocked(db.session.deleteMany).mockResolvedValueOnce({ count: 1 } as any);

    const res = await action(makeRequest());
    expect(res.status).toBe(200);
    expect(deleteCredential).toHaveBeenCalled(); // must still run
  });
});
```

### Prisma Model Accessor Names

Prisma client uses camelCase from model names:
- `Merchant` → `db.merchant`
- `MerchantCredential` → `db.merchantCredential`
- `Payment` → `db.payment`
- `ProcessedWebhook` → `db.processedWebhook`
- `Session` → `db.session`

### Multi-Tenancy & Security

All queries scoped to `shop` string returned from `authenticate.webhook(request)` — never from request body/payload. This satisfies multi-tenancy requirement from architecture.

No `requireShopSession()` call needed in webhook handlers — `authenticate.webhook(request)` is the correct auth for webhooks (not `authenticate.admin()`).

### Files Summary

**MODIFY:**
| File | Change |
|------|--------|
| `app/routes/webhooks.app.uninstalled.tsx` | Add full cleanup: updateMany(uninstalledAt), try-unregisterPaymentMethod, deleteCredential, keep session.deleteMany |
| `shopify.app.toml` | Fix webhook subscription URIs to match actual route file paths |

**CREATE:**
| File | Purpose |
|------|---------|
| `app/routes/webhooks.customers.data_request.tsx` | GDPR: return 200, no PII stored |
| `app/routes/webhooks.customers.redact.tsx` | GDPR: delete Payment records for customer's orders |
| `app/routes/webhooks.shop.redact.tsx` | GDPR: delete ALL shop data in FK-safe order |
| `app/routes/webhooks.app.uninstalled.test.ts` | Tests for APP_UNINSTALLED handler (3 tests) |
| `app/routes/webhooks.customers.data_request.test.ts` | Tests for data_request handler |
| `app/routes/webhooks.customers.redact.test.ts` | Tests for redact handler (3 tests) |
| `app/routes/webhooks.shop.redact.test.ts` | Tests for shop/redact handler (3 tests) |

**DO NOT TOUCH:**
| File | Reason |
|------|--------|
| `app/shopify.server.ts` | Shopify template file — never modify |
| `app/services/credential.server.ts` | No changes needed; `deleteCredential` reused as-is |
| `app/services/order.server.ts` | No changes needed; `unregisterPaymentMethod` reused as-is |
| `prisma/schema.prisma` | No schema changes needed for this story |
| `app/routes/webhooks.app.scopes_update.tsx` | Out of scope for this story |
| `app/lib/logger.server.ts` | No changes needed; `sanitizeForLog` reused as-is |

### References

- [Source: epics.md#Story 1.6] — All acceptance criteria verbatim
- [Source: architecture.md#Authentication & Security] — `authenticate.webhook()` for webhook handlers
- [Source: architecture.md#Project Structure] — `routes/webhooks.tsx` pattern, file naming conventions
- [Source: story 1.5 Dev Notes] — `unregisterPaymentMethod`, `deleteCredential` implementations and patterns
- [Source: story 1.5 Review Findings] — `deleteCredential` is now `deleteMany` (idempotent, no race condition)
- [Source: architecture.md#Naming Conventions] — co-located test files, `*.server.ts` suffix
- [Source: NFR-13] — GDPR webhooks: `customers/data_request`, `customers/redact`, `shop/redact`
- [Source: NFR-4] — HTTPS only, CSP headers (Shopify handles this)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Cập nhật `webhooks.app.uninstalled.tsx`: thêm full cleanup gồm `updateMany(uninstalledAt)`, try/catch cho `unregisterPaymentMethod`, `deleteCredential`, giữ `session.deleteMany`.
- Fix `shopify.app.toml`: 4 webhook subscription URIs từ `/webhooks` chung → paths cụ thể khớp với route files.
- Tạo 3 GDPR handler mới: `data_request` (no-op, 200 always), `customers/redact` (xóa Payment theo orders), `shop/redact` (xóa toàn bộ data theo FK-safe order).
- Tạo 4 test files với 12 tests — tất cả pass. Full suite: 52/52 pass, zero regression.
- AC #5 (200-always) được enforce bởi try/catch trong tất cả GDPR handlers.
- AC #4 (no wildcards, explicit order) được verify bởi tests kiểm tra từng model riêng lẻ và thứ tự gọi.

### File List

**MODIFIED:**
- `app/routes/webhooks.app.uninstalled.tsx`
- `shopify.app.toml`

**CREATED:**
- `app/routes/webhooks.customers.data_request.tsx`
- `app/routes/webhooks.customers.redact.tsx`
- `app/routes/webhooks.shop.redact.tsx`
- `app/routes/webhooks.app.uninstalled.test.ts`
- `app/routes/webhooks.customers.data_request.test.ts`
- `app/routes/webhooks.customers.redact.test.ts`
- `app/routes/webhooks.shop.redact.test.ts`

## Change Log

- 2026-06-23: Implement Story 1.6 — App Uninstall & GDPR Compliance. Full cleanup on APP_UNINSTALLED, fix webhook URIs in shopify.app.toml, tạo 3 GDPR handlers, tạo 4 test files (12 tests).
