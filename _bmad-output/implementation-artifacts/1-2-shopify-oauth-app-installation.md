---
baseline_commit: 952fc51185d021f826cf1cfa378983c8ebe8a4c9
---

# Story 1.2: Shopify OAuth App Installation

Status: done

## Story

As a merchant,
I want to install Tingee Payment App from Shopify App Store via OAuth,
so that the app gains secure access to my store and I am redirected to the admin settings.

## Acceptance Criteria

1. **Given** a merchant clicks "Install" on the Tingee app, **When** Shopify initiates OAuth, **Then** the app requests exactly these scopes: `write_orders`, `read_orders`, `write_payment_gateways`, `read_payment_gateways`

2. **Given** OAuth completes successfully, **When** the Shopify access token is received, **Then** it is stored securely server-side, never logged, never returned to client, and a `Merchant` record is upserted with `shopDomain` and `installedAt`

3. **Given** OAuth completes, **When** the merchant is redirected, **Then** they land at Admin Surface (`/app/settings`)

4. **Given** a merchant who previously installed re-installs, **When** OAuth completes again, **Then** the existing `Merchant` record is updated (not duplicated) and `uninstalledAt` is cleared

5. **Given** `requireShopSession()` is called in any admin loader or action, **When** the session is missing or invalid, **Then** the user is redirected to `/auth` — never a 500 error

## Tasks / Subtasks

- [x] Task 1: Create `requireShopSession()` auth guard (AC: #5)
  - [x] Create `app/lib/auth.server.ts` — see exact implementation in Dev Notes
  - [x] Create `app/lib/auth.server.test.ts` — 3 test cases: missing session → redirect, valid session → returns data, thrown redirect from library → re-thrown
  - [x] Mock `../shopify.server` in tests using `vi.mock`; import `createMockShopifySession` from `test/helpers/shopify-session.ts`

- [x] Task 2: Upsert Merchant record after OAuth (AC: #2, #4)
  - [x] Modify `app/routes/app.tsx` loader — add `db` import and upsert call AFTER `authenticate.admin(request)` returns
  - [x] Use `db.merchant.upsert` — `where: { shopDomain: session.shop }`, `update: { uninstalledAt: null }`, `create: { shopDomain: session.shop }` — see exact code in Dev Notes
  - [x] Write integration test: first install → creates Merchant row; re-install (with uninstalledAt set) → clears uninstalledAt, no duplicate row

- [x] Task 3: Redirect `/app` to `/app/settings` after OAuth (AC: #3)
  - [x] REPLACE all content of `app/routes/app._index.tsx` with redirect-only implementation — see exact code in Dev Notes
  - [x] Remove all boilerplate: product creation demo, metaobject mutation, fetcher, App Bridge toast, all `s-*` JSX — replace with single `redirect("/app/settings")` in loader

- [x] Task 4: Verify scopes and access token security (AC: #1, #2)
  - [x] Confirm `shopify.app.toml` still has exactly `read_orders,write_orders,read_payment_gateways,write_payment_gateways` (done in 1.1 — verify not regressed)
  - [x] Confirm `Session.accessToken` is stored in PostgreSQL via PrismaSessionStorage (done in 1.1) — add assertion in integration test that logs never contain raw token

## Dev Notes

### What Story 1.1 Already Completed — DO NOT REDO

| Item | Status | Location |
|------|--------|----------|
| Shopify OAuth routes (`auth.tsx`, `auth.$.tsx`) | ✅ Done | `app/routes/auth.$.tsx` — calls `authenticate.admin(request)`, library handles OAuth |
| Access token storage in `Session` model | ✅ Done | `app/shopify.server.ts` — `PrismaSessionStorage` stores token automatically |
| Correct OAuth scopes in `shopify.app.toml` | ✅ Done | `shopify.app.toml` has `read_orders,write_orders,read_payment_gateways,write_payment_gateways` |
| `Merchant` Prisma model | ✅ Done | `prisma/schema.prisma` — `Merchant { id, shopDomain, installedAt, uninstalledAt }` |
| Test helper `createMockShopifySession` | ✅ Done | `test/helpers/shopify-session.ts` |
| ApiVersion.October25 (= 2025-10, ≥ required 2025-07) | ✅ Done | `app/shopify.server.ts` — **DO NOT change** |

**This story's work is additive — the OAuth plumbing is done. We add business logic on top.**

### How the Shopify OAuth Flow Works in This Codebase

```
1. Merchant visits /auth?shop=DOMAIN
   → library initiates Shopify OAuth (throws redirect to Shopify)

2. Shopify redirects to /auth/* callback
   → auth.$.tsx loader calls authenticate.admin(request)
   → library validates HMAC, exchanges code for access token
   → stores token in Session model (PostgreSQL) via PrismaSessionStorage
   → library THROWS a redirect Response to /app — code AFTER this line never runs

3. Merchant lands at /app (embedded app root) → app.tsx loader runs
   → authenticate.admin(request) RETURNS { admin, session } (no throw here — OAuth is done)
   → THIS IS WHERE we upsert Merchant record

4. app._index.tsx loader runs (child of app.tsx)
   → redirects to /app/settings
```

**Key rule:** `authenticate.admin(request)` throws a `Response` in two cases:
1. When initiating OAuth redirect
2. When re-authentication is needed

Always re-throw caught `Response` objects — never swallow them silently.

### Task 1: `app/lib/auth.server.ts` — Exact Implementation

```typescript
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export async function requireShopSession(request: Request) {
  try {
    const { admin, session } = await authenticate.admin(request);
    if (!session?.shop) throw redirect("/auth");
    return { admin, session, shop: session.shop };
  } catch (error) {
    // Re-throw Responses (OAuth redirects, re-auth redirects)
    if (error instanceof Response) throw error;
    // Any other error → redirect to auth
    throw redirect("/auth");
  }
}
```

**`lib/` placement rationale:** `auth.server.ts` is a pure utility — it only validates a session, has no Tingee or Shopify business logic. It belongs in `lib/`, not `services/`. Rule: "Could this be copied to an unrelated project and still work?" → Yes for session validation.

### Task 2: Modify `app/routes/app.tsx` — Merchant Upsert

Current `app.tsx` loader (do not lose `apiKey` return or `ErrorBoundary`/`headers` exports):

```typescript
// ADD at top of file:
import db from "../db.server";

// REPLACE loader with:
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  await db.merchant.upsert({
    where: { shopDomain: session.shop },
    update: { uninstalledAt: null }, // clear flag if re-installing
    create: { shopDomain: session.shop },
  });

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};
```

**Keep unchanged:** `App()` default export, `ErrorBoundary`, `headers` export, all existing imports except adding `db`.

**Why upsert here, not in `auth.$.tsx`?**
`authenticate.admin()` in `auth.$.tsx` throws a redirect before returning — we can't run code after it during OAuth callback. `app.tsx` is the first place the session is available as a return value. This runs on every admin navigation but the upsert is idempotent (PostgreSQL UPSERT = no-op if shopDomain exists and uninstalledAt is already null).

### Task 3: REPLACE `app/routes/app._index.tsx`

The entire current file (product creation demo, ~360 lines) must be REPLACED with:

```typescript
import { redirect } from "react-router";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return redirect("/app/settings");
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
```

**Note:** `/app/settings` route does not exist until Story 1.3. This redirect is correct — it will 404 until Story 1.3 creates the settings page. Do not create a stub for `/app/settings` in this story.

**Also delete:** `app/routes/app.additional.tsx` — this is template boilerplate that has no place in Tingee app.

### Db Import Pattern (from Story 1.1 learnings)

```typescript
import db from "../db.server"; // ← correct
// NOT: import { prisma } from "..."
// NOT: import { PrismaClient } from "@prisma/client"
```

### Test Pattern for `auth.server.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "react-router";

// Mock shopify.server BEFORE importing auth.server
vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

import { requireShopSession } from "./auth.server";
import { authenticate } from "../shopify.server";

describe("requireShopSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns shop and session when valid", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: { shop: "test-store.myshopify.com", accessToken: "tok" } as any,
    });
    const result = await requireShopSession(new Request("http://localhost/app"));
    expect(result.shop).toBe("test-store.myshopify.com");
  });

  it("redirects to /auth when session.shop is missing", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {} as any, // no shop
    });
    await expect(requireShopSession(new Request("http://localhost/app")))
      .rejects.toBeInstanceOf(Response);
    // Verify it's a redirect to /auth
  });

  it("re-throws Response objects from authenticate.admin (OAuth redirects)", async () => {
    const oauthRedirect = redirect("/auth");
    vi.mocked(authenticate.admin).mockRejectedValueOnce(oauthRedirect);
    await expect(requireShopSession(new Request("http://localhost/app")))
      .rejects.toBe(oauthRedirect); // same Response object
  });
});
```

**Important:** Do NOT import `env.server.ts` in test files (process.exit(1) issue found in Story 1.1). The `shopify.server.ts` mock prevents transitively importing env.

### Access Token Security Checklist

- [ ] `session.accessToken` is stored in the `Session` model by PrismaSessionStorage — NEVER manually log or return it
- [ ] In any log call involving `session`, wrap with `sanitizeForLog()` (from `app/lib/logger.server.ts`, to be created in a later story — for now, just never log session objects)
- [ ] `requireShopSession()` returns `{ admin, session, shop }` — callers use `shop` for DB queries, `admin` for Shopify GraphQL, never `session.accessToken` directly

### Files to MODIFY

| File | Change |
|------|--------|
| `app/routes/app.tsx` | Add `db` import + Merchant upsert in loader |
| `app/routes/app._index.tsx` | REPLACE entirely — redirect to `/app/settings` only |

### Files to CREATE

| File | Purpose |
|------|---------|
| `app/lib/auth.server.ts` | `requireShopSession()` function |
| `app/lib/auth.server.test.ts` | 3 unit tests for `requireShopSession()` |

### Files to DELETE

| File | Reason |
|------|--------|
| `app/routes/app.additional.tsx` | Shopify template boilerplate, no role in Tingee app |

### Architecture Compliance Rules

| Rule | This Story's Implementation |
|------|-----------------------------|
| `requireShopSession()` first in every admin loader | Create the function now; callers start in Story 1.3 |
| Mọi Prisma query phải include `shop_domain` filter | Merchant upsert uses `WHERE shopDomain = ?` |
| `session.accessToken` never logged, never returned to client | Library handles storage; we never touch `accessToken` |
| `authenticate.admin()` cho Admin routes only | `requireShopSession()` wraps only `authenticate.admin()` |
| `authenticate.public.checkout()` cho Extension API | Not in this story — used from Story 2.1 onward |

### Open Issues Carried from Story 1.1 (no action needed here)

- `Payment.amount` as `Int` (32-bit) — potential overflow for large VND amounts. Decision deferred. Do not change schema in this story.
- `Payment (shopDomain, orderId)` lacks unique constraint — duplicate payment rows possible on retry. Decision deferred to Epic 2.

### Project Structure Notes

- `auth.server.ts` in `lib/` (not `services/`) — pure session validation utility, no Shopify/Tingee domain knowledge
- React Router 7 route naming: `app._index.tsx` → `/app` (index child of `app.tsx`); `app.settings.tsx` → `/app/settings` (Story 1.3)
- The `boundary.headers` export in `app._index.tsx` is required by Shopify — keep it in the replacement

### References

- [Source: epics.md#Story 1.2] — Acceptance criteria verbatim
- [Source: architecture.md#Authentication & Security] — `requireShopSession()` spec, multi-tenancy guard pattern
- [Source: architecture.md#Implementation Patterns — Multi-Tenancy Guard] — Exact `requireShopSession()` code spec
- [Source: architecture.md#Project Structure] — `lib/auth.server.ts` placement and role
- [Source: story 1.1 Dev Agent Record] — `db` import pattern, env.server.ts test issue, `createMockShopifySession` location
- [Source: app/shopify.server.ts] — `authenticate.admin()` is the auth entry point; `ApiVersion.October25` is correct
- [Source: app/routes/auth.$.tsx] — OAuth callback already handled; no changes needed
- [Source: app/routes/app._index.tsx] — ~360 lines of template boilerplate to REPLACE
- [Source: prisma/schema.prisma#Merchant] — `shopDomain @unique`, `installedAt @default(now())`, `uninstalledAt DateTime?`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Testcontainers yêu cầu Docker runtime — không có trong môi trường này. Sử dụng Vitest mock thay cho integration test thực sự với PostgreSQL.
- `vi.mock` factory không cho phép top-level variable references (hoisted) — dùng `vi.fn()` trực tiếp trong factory, re-mock trong `beforeEach`.
- `.react-router/types` typegen tạo file `app.test.ts` giả — fix bằng cách thêm `**/.react-router/**` vào vitest `exclude`.
- `s-app-nav` JSX TypeScript error là lỗi pre-existing từ template Shopify — fix bằng cách thêm `/// <reference types="@shopify/app-bridge-types" />` vào `env.d.ts`.

### Completion Notes List

- Tạo `app/lib/auth.server.ts` với `requireShopSession()`: wrap `authenticate.admin()`, re-throw Response objects (OAuth redirects), redirect `/auth` cho mọi lỗi khác.
- Thêm 3 unit tests trong `app/lib/auth.server.test.ts` — tất cả pass.
- Sửa `app/routes/app.tsx` loader: thêm `db` import + `db.merchant.upsert` sau `authenticate.admin()` return. Giữ nguyên `apiKey` return, `App()` component, `ErrorBoundary`, `headers` export.
- Thêm 3 tests cho `app.tsx` loader (mock-based) trong `app/routes/app.test.ts` — verify upsert args đúng cho cả first install và re-install.
- Thay thế toàn bộ `app/routes/app._index.tsx` (~364 dòng boilerplate) bằng loader redirect-only về `/app/settings`.
- Xoá `app/routes/app.additional.tsx` (template boilerplate không cần trong Tingee).
- Xác minh scopes trong `shopify.app.toml`: `read_orders,write_orders,read_payment_gateways,write_payment_gateways` — đúng.
- Xác minh `PrismaSessionStorage` xử lý `Session.accessToken` tự động — không bao giờ log hay expose token.
- Fix pre-existing TypeScript error `s-app-nav` bằng `@shopify/app-bridge-types` reference.
- Fix Vitest config exclude `.react-router` generated type files.
- Tất cả 13 tests pass, TypeScript clean (0 errors).

### File List

- `app/lib/auth.server.ts` — CREATED
- `app/lib/auth.server.test.ts` — CREATED
- `app/routes/app.tsx` — MODIFIED (added db import + Merchant upsert in loader)
- `app/routes/app.test.ts` — CREATED
- `app/routes/app._index.tsx` — REPLACED (redirect-only, boilerplate removed)
- `app/routes/app.additional.tsx` — DELETED
- `env.d.ts` — MODIFIED (added @shopify/app-bridge-types reference)
- `vitest.config.ts` — MODIFIED (added .react-router to exclude)
- `_bmad-output/implementation-artifacts/1-2-shopify-oauth-app-installation.md` — UPDATED (status, tasks, record)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — UPDATED (status → review)

### Review Findings

- [x] [Review][Patch] Thêm null guard trên `session.shop` trước DB upsert — nếu undefined, redirect `/auth` [app/routes/app.tsx]
- [x] [Review][Patch] Set `installedAt: new Date()` tường minh trong `create` block (AC2) [app/routes/app.tsx]
- [x] [Review][Patch] Nav link đến route đã xóa `/app/additional` vẫn còn trong `app.tsx` [app/routes/app.tsx]
- [x] [Review][Patch] Thiếu test case cho non-Response error từ `authenticate.admin` trong `requireShopSession` [app/lib/auth.server.test.ts]
- [x] [Review][Patch] Test chưa cover `session.shop === ""` (empty string) [app/lib/auth.server.test.ts]
- [x] [Review][Defer] Race condition khi concurrent installs cùng shop có thể vi phạm unique constraint [app/routes/app.tsx] — deferred, pre-existing architectural concern
- [x] [Review][Defer] Upsert ghi `uninstalledAt: null` trên mọi request, không chỉ khi reinstall [app/routes/app.tsx] — deferred, performance optimization cho sau
- [x] [Review][Defer] DB failure trong loader không được xử lý hay log [app/routes/app.tsx] — deferred, logging/monitoring cho story sau
