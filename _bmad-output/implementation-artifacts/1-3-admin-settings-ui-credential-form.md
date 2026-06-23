---
baseline_commit: ed8028f5cfc8c33eee8608d8f101ecdf419cc17d
---

# Story 1.3: Admin Settings UI — Credential Form

Status: done

## Story

As a merchant,
I want to see a settings page with a form to enter my Tingee Client ID and Secret Token,
so that I can configure my Tingee connection without leaving Shopify Admin.

## Acceptance Criteria

1. **Given** the merchant navigates to admin settings after fresh install, **When** the page loads, **Then** a Polaris Page titled "Cài đặt Tingee Payment" renders with Card 1 (Credential form) and Card 2 (Connection Status)

2. **Given** fresh install (no saved credentials), **When** the Credential form renders, **Then** Client ID field is empty, Secret Token field is empty, "Lưu cài đặt" button is disabled, and a Banner shows "Nhập Client ID và Secret Token từ portal Tingee để bắt đầu"

3. **Given** the merchant types in both fields, **When** both are non-empty, **Then** the "Lưu cài đặt" button becomes enabled

4. **Given** the Secret Token field, **When** displayed, **Then** it renders as `type="password"` (masked by default) with a toggle-reveal icon button

5. **Given** credentials were previously saved, **When** the merchant returns to settings, **Then** Secret Token field shows `placeholder="••••••••"` with helpText "Secret Token đã được lưu — nhập giá trị mới để thay đổi" — the actual token is NEVER returned from loader to frontend

6. **Given** the Connection Status Card with no saved credential, **When** rendered, **Then** a Polaris Badge shows "Chưa kết nối" (critical/red style)

7. **Given** any form field with an error state, **When** error is displayed, **Then** the error message is linked via `aria-describedby`, label is always visible (never placeholder-as-label), and minimum 12px font size is maintained

## Tasks / Subtasks

- [x] Task 0: Install `@shopify/polaris` (prerequisite — Polaris not in package.json) (AC: #1)
  - [x] Run `pnpm add @shopify/polaris` (project uses pnpm — see `pnpm-workspace.yaml`)
  - [x] Add Polaris CSS import to `app/root.tsx`: `import '@shopify/polaris/build/esm/styles.css'`
  - [x] Run `pnpm typecheck` to verify no TypeScript conflicts

- [x] Task 1: Create `app/routes/app.settings.tsx` route (AC: #1, #2, #6)
  - [x] Call `requireShopSession(request)` FIRST (architecture mandate — see Dev Notes)
  - [x] Query DB: find `Merchant` including `credential` relation (select `id` only — never decrypt or return encrypted values)
  - [x] Return `{ hasCredential: boolean }` — never return `encryptedClientId`, `encryptedSecretToken`, or `keyVersion`
  - [x] Render `<CredentialForm hasCredential={hasCredential} />` inside Polaris `<Page>`
  - [x] Export `boundary.headers` (required by Shopify — see app._index.tsx pattern from Story 1.2)
  - [x] No action function in this story — Story 1.4 owns the save logic

- [x] Task 2: Create `app/components/CredentialForm.tsx` (AC: #1–#7)
  - [x] Polaris layout: `Page` → 2 `Card` sections (`LegacyCard` or `Card` depending on Polaris version)
    - Card 1: Credential form fields + "Lưu cài đặt" button
    - Card 2: Connection Status display
  - [x] State: `clientId: string`, `secretToken: string`, `showSecret: boolean` (all local `useState`)
  - [x] Client ID: `<TextField label="Client ID" value={clientId} onChange={setClientId} autoComplete="off" />`
  - [x] Secret Token: `<TextField label="Secret Token" type={showSecret ? "text" : "password"} suffix={<ToggleIcon />} />`
  - [x] Toggle-reveal: `suffix` prop on TextField with eye/eye-off Icon button — click toggles `showSecret`
  - [x] Button enabled logic: `!clientId.trim() || !secretToken.trim()` → `disabled`
  - [x] `hasCredential=true` state: Secret Token `placeholder="••••••••"` + helpText (see AC #5); Client ID stays empty — user must re-enter both to update
  - [x] Fresh install banner: `<Banner title="..." status="info">` only when `!hasCredential`
  - [x] Connection Status Card: `<Badge status="critical">Chưa kết nối</Badge>` when `!hasCredential`; `<Badge status="success">Đã kết nối</Badge>` when `hasCredential` (Story 1.4 will update this dynamically post-save)
  - [x] Brand color override for primary button: apply CSS custom property `--p-color-bg-fill-brand: #e12a41` (see Dev Notes)
  - [x] Accessibility: labels always visible (never `placeholder` as substitute for `label`), `aria-describedby` for error messages (Polaris `TextField` `error` prop handles this automatically)
  - [x] Minimum 12px font size everywhere — Polaris defaults comply; do NOT override to smaller sizes

- [x] Task 3: Tests for `app/routes/app.settings.tsx` loader (AC: #1, #2, #5)
  - [x] Create `app/routes/app.settings.test.ts`
  - [x] Test: authenticated session with no credential → loader returns `{ hasCredential: false }`
  - [x] Test: authenticated session with existing credential → loader returns `{ hasCredential: true }`
  - [x] Test: missing session → loader throws redirect to `/auth` (via `requireShopSession`)
  - [x] Mock pattern: `vi.mock("../shopify.server", ...)` + `vi.mock("../db.server", ...)`
  - [x] Do NOT import `env.server.ts` in tests (causes `process.exit(1)` — see Story 1.1 deferred)
  - [x] Exclude `.react-router/**` in vitest config (already done in Story 1.2 — verify not regressed)

### Review Findings

- [x] [Review][Patch] Thêm `placeholder` + `helpText` cho Client ID khi `hasCredential=true` — đồng nhất với Secret Token: `placeholder="Nhập lại Client ID"` và `helpText="Client ID đã được lưu — nhập lại để thay đổi"`. [`app/components/CredentialForm.tsx`]

- [x] [Review][Patch] Xóa prop `submit` khỏi Button "Lưu cài đặt" — không có `<form>` hoặc `<Form>` bao ngoài, prop `submit` gây no-op gây hiểu nhầm. Spec ghi rõ "button will not submit yet". [`app/components/CredentialForm.tsx`]

- [x] [Review][Patch] Di chuyển `<style>` CSS variables vào trong `<head>` — hiện đặt trong `<body>` sau `<Outlet />` gây FOUC: button hiển thị màu tím Polaris trước khi brand color được apply. [`app/root.tsx`]

- [x] [Review][Patch] Test #3 chỉ kiểm tra `rejects.toBeInstanceOf(Response)` — chưa verify redirect đến `/auth`. Cần thêm assertion `response.status === 302` và location header chứa `/auth`. [`app/routes/app.settings.test.ts`]

- [x] [Review][Defer] AC7 error states chưa implement — không có `error` prop trên TextField; Polaris xử lý `aria-describedby` tự động khi `error` được pass. Defer sang Story 1.4 khi có action/error handling. [`app/components/CredentialForm.tsx`] — deferred, pre-existing

- [x] [Review][Defer] Không có `ErrorBoundary` trên `app.settings.tsx` — `boundary.headers` không được pair với `boundary.error`; DB failure propagates lên parent boundary không có context. Đã ghi nhận trong deferred-work.md. [`app/routes/app.settings.tsx`] — deferred, pre-existing

- [x] [Review][Defer] Không có max-length validation trên Client ID / Secret Token — giá trị dài tùy ý sẽ pass guard. Defer sang Story 1.4. [`app/components/CredentialForm.tsx`] — deferred, pre-existing

- [x] [Review][Defer] `clientId`/`secretToken` trim khi check disabled nhưng sẽ submit raw — áp dụng khi Story 1.4 thêm save action. [`app/components/CredentialForm.tsx`] — deferred, pre-existing

- [x] [Review][Defer] Non-Response error branch trong `requireShopSession` không được test — catch block redirect bất kỳ lỗi nào sang `/auth`, có thể mask real failures. [`app/routes/app.settings.test.ts`] — deferred, pre-existing

## Dev Notes

### Critical: `@shopify/polaris` Not Installed

`@shopify/polaris` is **absent** from `package.json`. Only `@shopify/polaris-types` (dev dep, type definitions only) is present. This story requires installing the actual Polaris package.

Verify first:
```bash
ls node_modules/@shopify/ | grep polaris
# Expected: only "polaris-types" — NOT "polaris"
```

Install:
```bash
pnpm add @shopify/polaris
```

Then add CSS in `app/root.tsx`:
```typescript
// app/root.tsx — ADD this import at the top (before other styles)
import '@shopify/polaris/build/esm/styles.css';
```

### Route File Pattern

React Router 7 dot-notation: `app.settings.tsx` → `/app/settings`
File lives at: `app/routes/app.settings.tsx`

This route is a **child of `app.tsx`** — it renders inside the `<Outlet />` in `app.tsx`, which means it's already wrapped with `AppProvider` (Polaris context). Do NOT wrap with AppProvider again.

### Loader — Exact Implementation Pattern

```typescript
// app/routes/app.settings.tsx
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireShopSession } from "../lib/auth.server";
import db from "../db.server";
import { CredentialForm } from "../components/CredentialForm";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShopSession(request); // ALWAYS first

  const merchant = await db.merchant.findUnique({
    where: { shopDomain: shop },
    include: { credential: { select: { id: true } } }, // id only — never return encrypted values
  });

  return { hasCredential: !!merchant?.credential };
};

export default function Settings() {
  const { hasCredential } = useLoaderData<typeof loader>();
  return <CredentialForm hasCredential={hasCredential} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
```

**Why `select: { id: true }` on credential?** Prevents encrypted token values from ever appearing in loader response, even in Remix DevTools or serialized JSON. Defense-in-depth per NFR-1.

**Why no action here?** Story 1.3 is UI-only. The "Lưu cài đặt" action (Tingee API validation + AES-256 save + payment method registration) is Story 1.4. The button will not submit yet — it becomes enabled client-side but the form has no server action until Story 1.4.

### CredentialForm Component Structure

```typescript
// app/components/CredentialForm.tsx
import { useState } from "react";
import {
  Page, Card, TextField, Button, Badge, Banner,
  BlockStack, InlineStack, Icon, Text
} from "@shopify/polaris";
import { HideMinor, ViewMinor } from "@shopify/polaris-icons";

interface CredentialFormProps {
  hasCredential: boolean;
}

export function CredentialForm({ hasCredential }: CredentialFormProps) {
  const [clientId, setClientId] = useState("");
  const [secretToken, setSecretToken] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const isSaveDisabled = !clientId.trim() || !secretToken.trim();

  return (
    <Page title="Cài đặt Tingee Payment">
      <BlockStack gap="400">
        {/* Card 1: Credential Form */}
        <Card>
          <BlockStack gap="400">
            {!hasCredential && (
              <Banner>
                Nhập Client ID và Secret Token từ portal Tingee để bắt đầu
              </Banner>
            )}
            <TextField
              label="Client ID"
              value={clientId}
              onChange={setClientId}
              autoComplete="off"
            />
            <TextField
              label="Secret Token"
              type={showSecret ? "text" : "password"}
              value={secretToken}
              onChange={setSecretToken}
              autoComplete="off"
              placeholder={hasCredential ? "••••••••" : undefined}
              helpText={hasCredential ? "Secret Token đã được lưu — nhập giá trị mới để thay đổi" : undefined}
              suffix={
                <Button
                  variant="plain"
                  onClick={() => setShowSecret((v) => !v)}
                  icon={showSecret ? HideMinor : ViewMinor}
                  accessibilityLabel={showSecret ? "Ẩn Secret Token" : "Hiện Secret Token"}
                />
              }
            />
            <Button
              variant="primary"
              disabled={isSaveDisabled}
              submit
            >
              Lưu cài đặt
            </Button>
          </BlockStack>
        </Card>

        {/* Card 2: Connection Status */}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Trạng thái kết nối</Text>
            {hasCredential ? (
              <Badge tone="success">Đã kết nối</Badge>
            ) : (
              <Badge tone="critical">Chưa kết nối</Badge>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
```

**Note on Polaris API:** The exact prop names (`variant`, `tone`, `gap`) depend on the Polaris version installed. Polaris 12+ uses `tone` (not `status`) for Badge, `variant` (not `primary={true}`) for Button, `gap` (not `spacing`) for BlockStack. If Polaris 11 is installed, adjust accordingly — run `pnpm list @shopify/polaris` to verify version.

### Brand Color Override

Per UX design (DESIGN.md): primary button must use `#e12a41` (Tingee Red), not Polaris default purple.

Add to `app/root.tsx` or a global CSS file:
```css
/* Override Polaris brand color for Admin surface only */
.shopify-polaris {
  --p-color-bg-fill-brand: #e12a41;
  --p-color-bg-fill-brand-hover: #c4223a;
  --p-color-bg-fill-brand-active: #a81b30;
}
```

Or use `<AppProvider theme={...}>` customTheme if Polaris version supports it.
**Do NOT override Polaris component shapes** (border-radius, padding) — only brand colors per UX-DR5.

### Multi-Tenancy Guard (Mandatory)

`requireShopSession()` **must be the first call** in every loader/action per architecture mandate. This is already implemented in `app/lib/auth.server.ts` (Story 1.2). Do not re-implement it.

Pattern for Settings loader:
```typescript
const { shop } = await requireShopSession(request); // throws redirect if invalid
// All DB queries below use shop parameter — NEVER use a hard-coded shop domain
const merchant = await db.merchant.findUnique({ where: { shopDomain: shop } });
```

### Test Pattern

Follow Story 1.2 test patterns exactly:

```typescript
// app/routes/app.settings.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock BEFORE importing the loader
vi.mock("../shopify.server", () => ({
  authenticate: { admin: vi.fn() },
}));
vi.mock("../db.server", () => ({
  default: {
    merchant: {
      findUnique: vi.fn(),
    },
  },
}));

import { loader } from "./app.settings";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { createMockShopifySession } from "../../test/helpers/shopify-session";

describe("Settings loader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns hasCredential=false when no credential exists", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: createMockShopifySession() as any,
    });
    vi.mocked(db.merchant.findUnique).mockResolvedValueOnce({
      id: "m1",
      shopDomain: "test-store.myshopify.com",
      installedAt: new Date(),
      uninstalledAt: null,
      credential: null,
    } as any);

    const result = await loader({
      request: new Request("http://localhost/app/settings"),
      params: {},
      context: {},
    });
    const data = await result.json();
    expect(data.hasCredential).toBe(false);
  });

  it("returns hasCredential=true when credential exists", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: createMockShopifySession() as any,
    });
    vi.mocked(db.merchant.findUnique).mockResolvedValueOnce({
      id: "m1",
      shopDomain: "test-store.myshopify.com",
      installedAt: new Date(),
      uninstalledAt: null,
      credential: { id: "cred1" }, // presence only — no encrypted values
    } as any);

    const result = await loader({
      request: new Request("http://localhost/app/settings"),
      params: {},
      context: {},
    });
    const data = await result.json();
    expect(data.hasCredential).toBe(true);
  });

  it("throws redirect when session missing (requireShopSession guard)", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {} as any, // no shop
    });
    await expect(
      loader({ request: new Request("http://localhost/app/settings"), params: {}, context: {} })
    ).rejects.toBeInstanceOf(Response);
  });
});
```

**Do NOT import `env.server.ts` or `lib/env.server.ts`** — causes `process.exit(1)` at module eval time (known issue from Story 1.1, still deferred). The `vi.mock("../shopify.server")` prevents transitive import of env.server.

### What Story 1.2 Already Built — Do Not Redo

| Item | Location |
|------|----------|
| `requireShopSession()` | `app/lib/auth.server.ts` |
| `db` import singleton | `app/db.server.ts` — use `import db from "../db.server"` |
| `Merchant` model with `credential` relation | `prisma/schema.prisma` — relation already defined |
| `createMockShopifySession` test helper | `test/helpers/shopify-session.ts` |
| `boundary.headers` export pattern | `app/routes/app._index.tsx` — copy the same pattern |
| Vitest `.react-router` exclude | `vitest.config.ts` — already configured, do not re-add |

### Files to CREATE

| File | Purpose |
|------|---------|
| `app/routes/app.settings.tsx` | Settings route — loader + Settings page |
| `app/components/CredentialForm.tsx` | Polaris form component (client-side state) |
| `app/routes/app.settings.test.ts` | Loader unit tests (3 cases) |

### Files to MODIFY

| File | Change |
|------|--------|
| `app/root.tsx` | Add `import '@shopify/polaris/build/esm/styles.css'` + brand CSS variables |
| `package.json` | `@shopify/polaris` added by pnpm (auto-updated) |

### Files to NOT TOUCH

| File | Reason |
|------|--------|
| `app/routes/app.tsx` | Story 1.3 does NOT modify nav — that's a separate concern |
| `app/lib/auth.server.ts` | Already complete from Story 1.2 |
| `prisma/schema.prisma` | No schema changes in this story |
| `app/shopify.server.ts` | Never modify — Shopify template file |

### Architecture Compliance Rules for This Story

| Rule | Implementation |
|------|----------------|
| `requireShopSession()` first in every loader | ✅ First line of settings loader |
| Mọi DB query phải include `shop_domain` filter | ✅ `db.merchant.findUnique({ where: { shopDomain: shop } })` |
| `session.accessToken` never logged/returned | ✅ Only `{ shop }` extracted from `requireShopSession()` return |
| `authenticate.admin()` cho Admin routes only | ✅ Settings is admin route, uses `requireShopSession()` which wraps `authenticate.admin()` |
| Encrypted values never in API response | ✅ `select: { id: true }` on credential query |
| Admin surface: Polaris only | ✅ All UI components from `@shopify/polaris` |

### UX Design Requirements for This Story

From `DESIGN.md` (Admin surface):

| Requirement | Implementation |
|-------------|----------------|
| UX-DR5: Polaris-only, override brand-layer only | ✅ No shape overrides, only brand color CSS vars |
| UX-DR6: Polaris Page + 2 Cards | ✅ `<Page>` + 2 `<Card>` |
| UX-DR6: Banner success auto-dismiss 5s (Story 1.4) | Not in scope this story |
| UX-DR6: Polaris Spinner khi verify (Story 1.4) | Not in scope this story |
| UX-DR14: Minimum 12px font everywhere | ✅ Polaris defaults comply — do not override |
| UX-DR14: aria-live="polite" on status container | Polaris Badge handles accessibility |

Connection badge colors from `DESIGN.md`:
- Connected: `background: #e3f1ec, foreground: #008060` (Polaris `tone="success"`)
- Disconnected: `background: #fdeaec, foreground: #a81b30` (Polaris `tone="critical"`)

### Open Issues / Deferred

From deferred-work.md (context only — no action in this story):
- DB failure in loader has no log/alert path — Prisma error surfaces through `boundary.error()`. Logging/monitoring deferred.

### References

- [Source: epics.md#Story 1.3] — Acceptance criteria verbatim
- [Source: architecture.md#Authentication & Security] — `requireShopSession()` pattern, multi-tenancy mandate
- [Source: architecture.md#Project Structure] — `app/routes/app.settings.tsx` file path, `app/components/CredentialForm.tsx`
- [Source: architecture.md#Requirements→Files Mapping] — FR-3: `routes/app.settings.tsx` + `components/CredentialForm.tsx`
- [Source: ux-designs/DESIGN.md#components] — `admin-primary-button` brand override, `admin-connection-badge-*` colors
- [Source: epics.md#Additional Requirements] — UX-DR5, UX-DR6, UX-DR14
- [Source: story 1.2 Dev Notes] — `db` import pattern, test mock pattern, `boundary.headers` export, `createMockShopifySession` location, env.server.ts test issue
- [Source: deferred-work.md] — DB failure in loader not handled (do not address in this story)
- [Source: prisma/schema.prisma] — `Merchant.credential` relation: `MerchantCredential?`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Test `result.json()` mismatch: loader returns plain object in RR7 (not Response). Fixed tests to use `result.hasCredential` directly, following existing `app.test.ts` pattern.
- Polaris 13 uses `HideIcon`/`ViewIcon` (not `HideMinor`/`ViewMinor` from Polaris 11). Updated component to use correct icon names from `@shopify/polaris-icons`.
- Polaris 13 `Banner` uses `tone="info"` (not `status="info"`). Updated component accordingly.

### Completion Notes List

- Installed `@shopify/polaris` 13.9.5 via pnpm. CSS import and brand color CSS variables (`--p-color-bg-fill-brand: #e12a41`) added to `app/root.tsx` via `:root` selector.
- Created `app/routes/app.settings.tsx`: calls `requireShopSession` first, queries Merchant with credential `select: { id: true }` (never returns encrypted values), returns `{ hasCredential: boolean }`, exports `boundary.headers`.
- Created `app/components/CredentialForm.tsx`: Polaris 13 Page → 2 Cards; local state for clientId/secretToken/showSecret; toggle-reveal using `HideIcon`/`ViewIcon`; button disabled when either field empty; hasCredential state shows placeholder + helpText on secret field; fresh install banner; connection status badge.
- Created `app/routes/app.settings.test.ts`: 3 loader tests (no credential, has credential, missing session redirect) — all passing. Used `as unknown as LoaderFunctionArgs` type cast consistent with `app.test.ts`.
- Full test suite: 18/18 pass, no regressions. TypeScript typecheck: clean.

### File List

- `app/routes/app.settings.tsx` (created)
- `app/components/CredentialForm.tsx` (created)
- `app/routes/app.settings.test.ts` (created)
- `app/root.tsx` (modified — Polaris CSS import + brand color CSS vars)
- `package.json` (modified — @shopify/polaris added by pnpm)
- `pnpm-lock.yaml` (modified — lockfile updated)

## Change Log

- 2026-06-23: Implemented Story 1.3 — installed @shopify/polaris 13.9.5, created settings route with secure loader, created CredentialForm component, created 3 loader unit tests. All 18 tests pass, typecheck clean.
