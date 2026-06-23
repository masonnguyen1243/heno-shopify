---
baseline_commit: 0751dd9
---

# Story 1.5: Credential Update & Deletion

Status: done

## Story

As a merchant,
I want to update my credentials when my Secret Token changes, or remove them entirely to disconnect Tingee,
So that I maintain control of my integration at any time.

## Acceptance Criteria

1. **Given** a merchant with existing credentials enters new values and saves, **When** Tingee API validates the new credentials, **Then** if valid: old encrypted values are overwritten atomically, badge shows "Đã kết nối"

2. **Given** a merchant submits new credentials that fail Tingee validation, **When** Tingee API rejects them, **Then** old credentials remain unchanged — no overwrite until new ones pass

3. **Given** a merchant confirms credential deletion, **When** delete is executed, **Then** `MerchantCredential` is deleted from DB AND "Thanh toán qua Tingee QR" is unregistered from Shopify — both atomically (if either fails, neither completes)

4. **Given** the Shopify call to unregister payment method fails, **When** the error occurs during deletion, **Then** an error Banner is shown and credentials are NOT deleted — consistent state maintained

## Tasks / Subtasks

- [x] Task 1: Add `unregisterPaymentMethod(shop, accessToken)` to `app/services/order.server.ts` (AC: #3, #4)
  - [x] GET `/admin/api/2025-07/payment_gateways.json` with `X-Shopify-Access-Token` header to list all gateways
  - [x] Filter by name `"Thanh toán qua Tingee QR"` — use the same `PAYMENT_METHOD_NAME` const already in file
  - [x] If no gateway found → return silently (idempotent — already unregistered or never registered)
  - [x] If found → DELETE `/admin/api/2025-07/payment_gateways/{id}.json`
  - [x] Wrap both fetch calls with `AbortSignal.timeout(10_000)` (matches existing `registerPaymentMethod` timeout)
  - [x] Throw descriptive error if DELETE returns non-2xx — caller will catch for AC4

- [x] Task 2: Add `deleteCredential(shop)` to `app/services/credential.server.ts` (AC: #3)
  - [x] Find `Merchant` by `shopDomain` → get `id`
  - [x] If no merchant found → return silently (no credential to delete)
  - [x] If no credential → return silently (idempotent)
  - [x] `await db.merchantCredential.delete({ where: { merchantId: merchant.id } })`
  - [x] Log `console.info("Credential deleted", { shop })` (matches existing log pattern in `saveCredential`)

- [x] Task 3: Add `intent: "delete"` branch to action in `app/routes/app.settings.tsx` (AC: #3, #4)
  - [x] Read `intent` from formData: `const intent = String(formData.get("intent") ?? "save")`
  - [x] If `intent === "delete"`: run delete flow (Tasks 1 & 2), else run existing save flow
  - [x] Delete flow (MUST be this order for AC4 atomicity):
    - [x] Call `unregisterPaymentMethod(session.shop, session.accessToken)` first
    - [x] If it throws → catch and return `{ error: "PAYMENT_METHOD_UNREGISTRATION_FAILED" }` — do NOT call `deleteCredential`
    - [x] Only call `deleteCredential(shop)` after Shopify succeeds
    - [x] Return `{ deleted: true }` on success
  - [x] Wrap delete flow errors with try/catch, sanitize log before any error log

- [x] Task 4: Add delete UI to `app/components/CredentialForm.tsx` (AC: #3, #4)
  - [x] Import `Modal`, `InlineStack` from `@shopify/polaris` (add to existing import list)
  - [x] Add `showDeleteModal` state (boolean, default false)
  - [x] Add `isDeleting` derived state: `fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete"`
  - [x] Show "Xóa Credential" button only when `localHasCredential === true` — renders below "Lưu cài đặt" button, use `tone="critical"` variant
  - [x] Button click → `setShowDeleteModal(true)` (NOT submit directly)
  - [x] Polaris Modal: title "Xóa Credential Tingee", primary action "Xóa" (destructive), secondary action "Hủy"
  - [x] Modal "Xóa" action → `fetcher.submit({ intent: "delete" }, { method: "post" })`
  - [x] On `saveResult?.deleted === true` → `setLocalHasCredential(false)`, close modal, reset form state
  - [x] Error handling: `saveResult?.error === "PAYMENT_METHOD_UNREGISTRATION_FAILED"` → critical Banner "Không thể hủy đăng ký phương thức thanh toán với Shopify. Credential chưa bị xóa. Vui lòng thử lại."
  - [x] Keep modal closed after error (don't auto-close on error)

- [x] Task 5: Add tests to `app/routes/app.settings.test.ts` (AC: #1, #2, #3, #4)
  - [x] Add `deleteCredential: vi.fn()` and `unregisterPaymentMethod: vi.fn()` to existing mocks
  - [x] Test: `intent=delete`, Shopify call succeeds → returns `{ deleted: true }`, `deleteCredential` called once, `unregisterPaymentMethod` called once
  - [x] Test: `intent=delete`, `unregisterPaymentMethod` throws → returns `{ error: "PAYMENT_METHOD_UNREGISTRATION_FAILED" }`, `deleteCredential` NOT called
  - [x] Test: `intent=save` (update existing credential), new credentials valid → returns `{ success: true }`, `saveCredential` called, `registerPaymentMethod` NOT called (because `hasCredential` returns true)
  - [x] Test: `intent=save` (update), `verifyCredentials` throws `InvalidCredentialsError` → returns `{ error: "INVALID_CREDENTIALS" }`, `saveCredential` NOT called (AC2)

- [x] Task 6: Add unit tests for `unregisterPaymentMethod` (AC: #3, #4)
  - [x] Create `app/services/order.server.test.ts` (new file, follows co-location pattern from architecture)
  - [x] Use `vi.stubGlobal("fetch", ...)` or MSW to mock Shopify API
  - [x] Test: gateway found by name → DELETE called with correct URL and headers → resolves
  - [x] Test: gateway NOT found (empty list) → resolves without calling DELETE (idempotent)
  - [x] Test: DELETE returns non-2xx → throws error (for AC4 catch)
  - [x] Test: GET gateways returns non-2xx → throws error

## Dev Notes

### AC1/AC2 Update Flow — Already Implemented

The credential UPDATE path is **already complete from Story 1.4**:
- Existing action calls `verifyCredentials` BEFORE `saveCredential`
- `saveCredential` uses `db.merchantCredential.upsert` — handles both create and update atomically
- If `verifyCredentials` throws, `saveCredential` is never called → AC2 satisfied automatically
- No backend changes needed for update. Only new work is the DELETE flow.

### Unregistering Payment Method — No Gateway ID Stored

Story 1.4 explicitly does NOT store `payment_gateway.id`. To unregister:

```typescript
// app/services/order.server.ts — add below registerPaymentMethod

export async function unregisterPaymentMethod(
  shop: string,
  accessToken: string
): Promise<void> {
  const listUrl = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/payment_gateways.json`;
  const listRes = await fetch(listUrl, {
    headers: { "X-Shopify-Access-Token": accessToken },
    signal: AbortSignal.timeout(10_000),
  });
  if (!listRes.ok) {
    throw new Error(`Failed to list payment gateways: HTTP ${listRes.status}`);
  }
  const { payment_gateways } = (await listRes.json()) as {
    payment_gateways: Array<{ id: number; name: string }>;
  };
  const gateway = payment_gateways.find((g) => g.name === PAYMENT_METHOD_NAME);
  if (!gateway) return; // Already unregistered — idempotent

  const deleteUrl = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/payment_gateways/${gateway.id}.json`;
  const deleteRes = await fetch(deleteUrl, {
    method: "DELETE",
    headers: { "X-Shopify-Access-Token": accessToken },
    signal: AbortSignal.timeout(10_000),
  });
  if (!deleteRes.ok) {
    throw new Error(`Failed to unregister payment method: HTTP ${deleteRes.status}`);
  }
}
```

### Action Intent Routing Pattern

```typescript
// app/routes/app.settings.tsx — updated action (replace existing)

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, shop } = await requireShopSession(request); // ALWAYS first

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "delete") {
    try {
      await unregisterPaymentMethod(session.shop, session.accessToken);
    } catch (error) {
      console.error("Unregister payment method failed", sanitizeForLog({
        shop,
        errorMessage: error instanceof Error ? error.message : String(error),
      }));
      return { error: "PAYMENT_METHOD_UNREGISTRATION_FAILED" };
    }
    await deleteCredential(shop);
    return { deleted: true };
  }

  // Existing save flow below — UNCHANGED
  const clientId = String(formData.get("clientId") ?? "").trim();
  const secretToken = String(formData.get("secretToken") ?? "").trim();
  // ... rest of existing save action
};
```

### Delete UI — Polaris Modal Pattern

```typescript
// Key additions to CredentialForm.tsx

import { Modal, InlineStack } from "@shopify/polaris"; // add to existing import

const [showDeleteModal, setShowDeleteModal] = useState(false);
const isDeleting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";

// In useEffect — handle delete success:
useEffect(() => {
  if (saveResult?.deleted) {
    setLocalHasCredential(false);
    setShowDeleteModal(false);
    setClientId("");
    setSecretToken("");
  }
}, [saveResult?.deleted]);

// Delete button (only when localHasCredential):
{localHasCredential && (
  <Button
    tone="critical"
    disabled={isSubmitting || isDeleting}
    loading={isDeleting}
    onClick={() => setShowDeleteModal(true)}
  >
    Xóa Credential
  </Button>
)}

// Modal component (outside fetcher.Form):
<Modal
  open={showDeleteModal}
  onClose={() => setShowDeleteModal(false)}
  title="Xóa Credential Tingee"
  primaryAction={{
    content: "Xóa",
    destructive: true,
    loading: isDeleting,
    onAction: () => {
      fetcher.submit({ intent: "delete" }, { method: "post" });
    },
  }}
  secondaryActions={[{
    content: "Hủy",
    onAction: () => setShowDeleteModal(false),
  }]}
>
  <Modal.Section>
    <Text as="p">
      Xóa Credential sẽ hủy đăng ký phương thức thanh toán "Thanh toán qua Tingee QR" khỏi cửa hàng của bạn. Người mua sẽ không còn thấy tùy chọn này tại checkout.
    </Text>
  </Modal.Section>
</Modal>
```

### ActionData Type — Must be Extended

Update the `ActionData` type in `CredentialForm.tsx` to include `deleted`:

```typescript
type ActionData = { success?: boolean; error?: string; deleted?: boolean } | undefined;
```

### Error Message Mapping — Add to errorMessage Switch

```typescript
// Add to errorMessage derivation in CredentialForm:
: saveResult?.error === "PAYMENT_METHOD_UNREGISTRATION_FAILED"
  ? "Không thể hủy đăng ký phương thức thanh toán với Shopify. Credential chưa bị xóa. Vui lòng thử lại."
```

### Multi-Tenancy & Security Rules

| Rule | How Enforced |
|------|-------------|
| `requireShopSession()` first in action | ✅ Inherited from existing action structure |
| `shop` from session, never from formData | ✅ `deleteCredential(shop)` uses session shop |
| `session.accessToken` never logged | ✅ Not passed to `sanitizeForLog()` in delete flow |
| Delete scoped to session's shop only | ✅ `deleteCredential(shop)` scoped by `shopDomain` |

### Files to MODIFY

| File | Change |
|------|--------|
| `app/services/order.server.ts` | Add `unregisterPaymentMethod` function |
| `app/services/credential.server.ts` | Add `deleteCredential` function |
| `app/routes/app.settings.tsx` | Add `intent` routing + delete branch to action; add imports |
| `app/components/CredentialForm.tsx` | Add delete button, Modal, delete-specific state, `ActionData.deleted` |
| `app/routes/app.settings.test.ts` | Add delete flow tests (4 new tests) |

### Files to CREATE

| File | Purpose |
|------|---------|
| `app/services/order.server.test.ts` | Unit tests for `unregisterPaymentMethod` |

### Files to NOT TOUCH

| File | Reason |
|------|--------|
| `app/shopify.server.ts` | Shopify template file — never modify |
| `prisma/schema.prisma` | No schema changes needed |
| `app/lib/encryption.server.ts` | No changes needed |
| `app/lib/logger.server.ts` | No changes needed — use existing `sanitizeForLog()` |
| `app/lib/auth.server.ts` | No changes needed |

### Regression Guards

The existing save flow (Task 3 calls it "save flow") must not be altered. Only add the `intent` check at the top. All existing action logic (isFirstSave, verifyCredentials, saveCredential, registerPaymentMethod) remains unchanged. Existing 30 tests must still pass.

### Architecture Compliance

- `lib/` vs `services/` rule: `unregisterPaymentMethod` and `deleteCredential` both know Shopify/Tingee domain → `services/` ✅
- `requireShopSession()` always first ✅
- All Prisma queries scoped to `shop_domain` ✅
- `sanitizeForLog()` before all error logs ✅
- `session.accessToken` never logged ✅
- Shopify API version pinned to `2025-07` via `SHOPIFY_API_VERSION` const ✅

### References

- [Source: epics.md#Story 1.5] — Acceptance criteria verbatim
- [Source: architecture.md#Authentication & Security] — `requireShopSession()` pattern, multi-tenancy rule
- [Source: architecture.md#Project Structure] — `services/order.server.ts` location, `lib/` vs `services/` rule
- [Source: architecture.md#Naming Conventions] — co-located test files pattern
- [Source: story 1.4 Dev Notes] — registerPaymentMethod uses REST API, gateway ID NOT stored, `sanitizeForLog()` usage, useFetcher form pattern, `AbortSignal.timeout(10_000)` pattern
- [Source: story 1.4 Review Findings] — `PAYMENT_METHOD_REGISTRATION_FAILED` pattern (mirrors `PAYMENT_METHOD_UNREGISTRATION_FAILED`)
- [Source: story 1.4 File List] — exact Polaris 13.9.5 component names in use

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `unregisterPaymentMethod` in `order.server.ts`: GET payment_gateways list → filter by PAYMENT_METHOD_NAME → DELETE if found (idempotent if not found). Uses AbortSignal.timeout(10_000) consistent with registerPaymentMethod.
- Implemented `deleteCredential` in `credential.server.ts`: find merchant by shopDomain → silently return if no merchant or no credential → delete MerchantCredential.
- Updated action in `app.settings.tsx`: added `intent` routing at top; delete flow calls unregisterPaymentMethod first (AC4: if Shopify fails, deleteCredential is never called), then deleteCredential.
- Fixed pre-existing TypeScript error: `session.accessToken!` non-null assertion added to both registerPaymentMethod and unregisterPaymentMethod calls (Shopify auth guarantees accessToken on authenticated sessions).
- Updated `CredentialForm.tsx`: extended ActionData type with `deleted?: boolean`; added `showDeleteModal` state, `isDeleting` derived state; "Xóa Credential" button (tone=critical, visible only when localHasCredential=true) triggers modal; Polaris Modal with destructive primary action submits `{ intent: "delete" }`; useEffect resets state on `saveResult?.deleted`; PAYMENT_METHOD_UNREGISTRATION_FAILED error message added to errorMessage chain.
- 40/40 tests pass (11 pre-existing + 4 new action tests in app.settings.test.ts + 4 new unit tests in order.server.test.ts + 21 others). TypeScript clean.

### File List

- app/services/order.server.ts (modified — added unregisterPaymentMethod)
- app/services/credential.server.ts (modified — added deleteCredential)
- app/routes/app.settings.tsx (modified — intent routing, delete branch, imports, accessToken! fix)
- app/components/CredentialForm.tsx (modified — delete UI: Modal, button, state, ActionData type, error message)
- app/routes/app.settings.test.ts (modified — added mocks for deleteCredential/unregisterPaymentMethod, 4 new tests)
- app/services/order.server.test.ts (created — 4 unit tests for unregisterPaymentMethod)

### Change Log

- 2026-06-23: Implemented Story 1-5 — credential update & deletion. Added unregisterPaymentMethod, deleteCredential, intent-based action routing, delete UI with Polaris Modal, and full test coverage (8 new tests).

### Review Findings

- [x] [Review][Patch] deleteCredential throw uncaught — DB delete nằm ngoài try/catch; nếu Prisma throws sau khi Shopify unregister đã thành công, state bị broken (gateway gone, credential còn) và trả 500 [app/routes/app.settings.tsx]
- [x] [Review][Patch] Double-submit race trong Modal — onAction callback fires trước khi isDeleting=true (render chưa cập nhật), user double-click gửi 2 DELETE request [app/components/CredentialForm.tsx]
- [x] [Review][Patch] isSaveDisabled thiếu isDeleting — nút Lưu cài đặt không bị disable khi delete đang in-flight, save và delete có thể race [app/components/CredentialForm.tsx]
- [x] [Review][Patch] Duplicate vi.mock cho credential.server trong test file — false positive, diff format bị nhầm; test file chỉ có 1 mock [app/routes/app.settings.test.ts]
- [x] [Review][Patch] deleteCredential findUnique+delete race — hai DB round-trips không có transaction; concurrent delete giữa 2 requests có thể throw Prisma RecordNotFound uncaught [app/services/credential.server.ts]
- [x] [Review][Defer] session.shop vs shop inconsistency — unregisterPaymentMethod gọi với session.shop, deleteCredential gọi với shop; functionally identical nhưng lệch pattern [app/routes/app.settings.tsx] — deferred, pre-existing
- [x] [Review][Defer] CSRF không có secondary guard trên delete action — Shopify session cookie mitigate nhưng không có idempotency key hay re-auth [app/routes/app.settings.tsx] — deferred, pre-existing
- [x] [Review][Defer] AbortSignal.timeout không có trên Node.js < 17.3 — pattern pre-existing từ registerPaymentMethod [app/services/order.server.ts] — deferred, pre-existing
- [x] [Review][Defer] Gateway name exact-match có thể miss nếu Shopify normalize Unicode hoặc merchant đổi tên — unregisterPaymentMethod skip silently, credential vẫn bị xóa [app/services/order.server.ts] — deferred, pre-existing
- [x] [Review][Defer] localHasCredential không sync khi parent re-render với prop mới — useState(hasCredential) chỉ dùng prop làm initial value [app/components/CredentialForm.tsx] — deferred, pre-existing
- [x] [Review][Defer] Error Banner tone "critical" chưa verify — errorMessage string được pass vào Banner đã có từ trước, tone prop không thay đổi trong diff này [app/components/CredentialForm.tsx] — deferred, pre-existing
