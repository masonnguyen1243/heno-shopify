---
baseline_commit: 339a4d6c6a1cace2553f75466893f6f452c5dc84
---

# Story 2.3: Order Status Extension — Foundation & Loading State

Status: done

## Story

As a buyer,
I want to see the Tingee payment block appear immediately on the Order Status page while my payment info loads,
So that I know a payment action is expected and the experience feels fast.

## Acceptance Criteria

1. **Given** a buyer lands on Order Status page for an order with "Thanh toán qua Tingee QR", **When** the Extension mounts, **Then** a Payment Card renders immediately with a loading skeleton: 200×200 gray placeholder for QR + skeleton bar for amount — resolves within 2 seconds
2. **Given** the Payment Card loads succe1ssfully, **When** data is received from `/tingee-data`, **Then** Amount Display renders format "1.500.000 đ" (dots for thousands, đ suffix — NOT "VND"), brand red `#e12a41`, 24px bold
3. **Given** the Payment Card is rendered, **When** CSS is inspected, **Then** scoping uses `[data-tng-extension]` + BEM prefix `tng-` — no style leaks into merchant theme; explicit property resets used instead of `all: revert` (Chromium <84 compatibility)
4. **Given** the order payment method is NOT "Thanh toán qua Tingee QR", **When** Extension evaluates the order, **Then** the entire block does NOT render — no empty space, no error shown
5. **Given** the order is already `COMPLETED` (Paid) when the page loads, **When** Extension fetches initial data, **Then** the block renders in success state directly — no loading → pending → success flash
6. **Given** any interactive element in the Payment Card, **When** rendered on any device, **Then** minimum 44×44px touch target and minimum 12px font size are maintained
7. **Given** dark mode merchant theme, **When** the card renders, **Then** Payment Card uses dark variants (`#1a1a1a` bg, `#3a3a3a` border) but QR container background remains white unconditionally
8. **Given** Extension renders and Shopify `shop.primary_locale` is `vi`, **When** UI text is displayed, **Then** all microcopy is in Vietnamese; when locale is not `vi`, all microcopy falls back to English

## Tasks / Subtasks

- [x] Task 1: Tạo `extensions/order-status-ui/src/api/client.ts` — thin fetch wrapper (AC: #1, #5)

  - [x] Export `fetchTingeeData(orderId: string, amount: number, orderNumber: string): Promise<TingeeDataResponse>`
  - [x] URL: `/api/orders/${orderId}/tingee-data?amount=${amount}&orderNumber=${orderNumber}`
  - [x] Return type: `TingeeDataResponse = { qrImageUrl: string; deeplinkUrl: string | null; amount: number; currency: 'VND'; status: PaymentStatus; expiresAt: string; orderId: string }` (match Pact contract từ Story 2.1)
  - [x] Error return: `TingeeDataError = { error: string; code: string }` (HTTP 503 khi Tingee unavailable)
  - [x] KHÔNG dùng `authenticate.admin()` ở Extension — Extension không có admin session
  - [x] Dùng `fetch()` native — không import react-router loader utilities

- [x] Task 2: Tạo `extensions/order-status-ui/src/utils/constants.ts` (AC: #1)

  - [x] Export: `POLL_INTERVAL_MS = 5000`, `EXPIRED_TIMEOUT_MS = 15 * 60 * 1000`, `POLL_MAX_INTERVAL_MS = 30000`, `DEEPLINK_TIMEOUT_IOS_MS = 3500`, `DEEPLINK_TIMEOUT_ANDROID_MS = 2000`
  - [x] Export type: `PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED'`
  - [x] Chỉ constants — không có logic

- [x] Task 3: Tạo `extensions/order-status-ui/src/utils/formatters.ts` (AC: #2)

  - [x] Export `formatVndAmount(amount: number): string` — format VND kiểu Việt: `1500000` → `"1.500.000 đ"` (dùng dấu chấm phân ngàn, suffix "đ", không "VND")
  - [x] Dùng `Intl.NumberFormat('vi-VN', { style: 'decimal' })` rồi thêm " đ" — KHÔNG dùng `style: 'currency'` vì sẽ in ra "₫" hoặc "VND"
  - [x] Export unit test inline (`formatVndAmount(1500000) === '1.500.000 đ'`, `formatVndAmount(50000) === '50.000 đ'`)

- [x] Task 4: Tạo `extensions/order-status-ui/src/utils/i18n.ts` (AC: #8)

  - [x] Export `t(key: keyof typeof translations, locale: string): string`
  - [x] Translations object với keys: `loading`, `payWith`, `openBankApp`, `paid`, `pending`, `expired`, `expiredMessage`, `backToStore`, `qrAltText`, `checkingConnection`
  - [x] Vietnamese values: `loading: "Đang tải..."`, `payWith: "Thanh toán qua Tingee QR"`, `openBankApp: "Mở app ngân hàng"`, `paid: "Đã thanh toán ✓"`, `pending: "Chờ thanh toán"`, `expired: "Mã QR đã hết hạn"`, `expiredMessage: "Mã QR đã hết hạn sau 15 phút."`, `backToStore: "Quay lại cửa hàng"`, `qrAltText: (amount: string) => \`Mã QR thanh toán ${amount} qua Tingee\``, `checkingConnection: "Đang kiểm tra kết nối..."`
  - [x] English fallback values cho tất cả keys
  - [x] Logic: `locale.startsWith('vi')` → Vietnamese, else English

- [x] Task 5: Tạo `extensions/order-status-ui/src/components/PaymentCard.tsx` — container chính (AC: #1, #3, #6, #7)

  - [x] Props: `{ orderId: string; amount: number; orderNumber: string; locale: string }`
  - [x] State: `status: 'loading' | 'loaded' | 'error'`, `data: TingeeDataResponse | null`
  - [x] Loading skeleton: `<div class="tng-skeleton tng-skeleton--qr" />` (200×200, `#e0e0e0` bg) + `<div class="tng-skeleton tng-skeleton--amount" />` (bar skeleton)
  - [x] Khi loaded và `data.status` là 'PENDING': render QR + amount + trạng thái chờ
  - [x] Khi loaded và `data.status` là 'COMPLETED': render success state ngay (AC #5) — không flash loading
  - [x] Wrap outermost div với `data-tng-extension` attribute: `<div data-tng-extension className="tng-payment-container">`
  - [x] Dark mode: check `useColorScheme()` từ `@shopify/ui-extensions-react/customer-account`; nếu dark → thêm class `tng-payment-container--dark`
  - [x] Error state: nếu HTTP 503 từ `/tingee-data` → render fallback message nhỏ, không crash
  - [x] Call `fetchTingeeData()` trong `useEffect([], [])` — chỉ load một lần khi mount

- [x] Task 6: Tạo CSS module `extensions/order-status-ui/src/components/PaymentCard.css` (AC: #3, #6, #7)

  - [x] **BEM scoping bắt buộc** — tất cả rules đều nằm trong `[data-tng-extension]`
  - [x] Reset layer với explicit resets (không `all: revert`)
  - [x] KHÔNG dùng `all: revert` — không support Chromium <84 (phổ biến tại VN trên device 2020-2021)
  - [x] `!important` chỉ dùng trong explicit resets — không dùng trong component-specific rules
  - [x] `.tng-payment-card`: `background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);`
  - [x] `.tng-payment-container--dark .tng-payment-card`: `background: #1a1a1a; border-color: #3a3a3a;`
  - [x] `.tng-qr-container`: `background: #FFFFFF !important; width: 200px; height: 200px; border: 1px solid #e0e0e0; border-radius: 8px; padding: 8px;` — ALWAYS white (dùng `!important`)
  - [x] `.tng-amount`: `font-size: 24px; font-weight: 700; color: #e12a41;`
  - [x] `.tng-skeleton--qr`: `width: 200px; height: 200px; background: #e0e0e0; border-radius: 8px;`
  - [x] `.tng-skeleton--amount`: `width: 120px; height: 24px; background: #e0e0e0; border-radius: 4px; margin: 8px 0;`
  - [x] Touch targets: mọi button/link có `min-height: 44px; min-width: 44px;`
  - [x] Min font-size: 12px trên toàn bộ extension

- [x] Task 7: Cập nhật `extensions/order-status-ui/src/index.tsx` — entry point (AC: #4, #1, #8)

  - [x] Import hooks từ `@shopify/ui-extensions-react/customer-account`
  - [x] Render PaymentCard chỉ khi payment method đúng (AC #4) — check `paymentGatewayNames`
  - [x] KHÔNG dùng React Router, KHÔNG dùng `authenticate.admin()`
  - [x] UPDATE in-place placeholder thành implementation đầy đủ

- [x] Task 8: Viết unit tests `extensions/order-status-ui/src/components/PaymentCard.test.tsx` (AC: #1-#8)

  - [x] Setup: dùng `@testing-library/react` với jsdom environment (mock Shopify hooks — `@shopify/ui-extensions-react/testing` không tồn tại trong v2025.7.3)
  - [x] Test: render loading skeleton trước khi data load (có `.tng-skeleton--qr`)
  - [x] Test: render amount "1.500.000 đ" khi data loaded (format đúng)
  - [x] Test: render success state trực tiếp khi `data.status = 'COMPLETED'` (không flash)
  - [x] Test: `data-tng-extension` attribute có mặt trên wrapper
  - [x] Test: locale `vi` → text tiếng Việt; locale `en` → text tiếng Anh
  - [x] Test: HTTP 503 từ fetchTingeeData → fallback UI không crash
  - [x] Mock `fetchTingeeData` trong tests

- [x] Task 9: Viết unit tests `extensions/order-status-ui/src/utils/formatters.test.ts` (AC: #2)

  - [x] Test: `1500000` → `"1.500.000 đ"`
  - [x] Test: `50000` → `"50.000 đ"`
  - [x] Test: `1000` → `"1.000 đ"`
  - [x] Test: `500` → `"500 đ"`
  - [x] Dùng Vitest (không phải Jest) — dùng `import { describe, it, expect } from 'vitest'`

## Dev Notes

### CRITICAL: Extension Environment vs App Routes

Extension (`extensions/order-status-ui/`) chạy trong Shopify's sandboxed environment — khác hoàn toàn với `app/routes/`:

```
Extension hooks (DÙNG TRONG EXTENSION):
- useOrder(), useLocalization(), useColorScheme() — từ @shopify/ui-extensions-react/customer-account
- reactExtension() — để register extension

App routes (KHÔNG DÙNG TRONG EXTENSION):
- authenticate.admin() — sẽ crash vì không có admin session
- authenticate.public.checkout() — chỉ dùng trong app/routes/, không phải extension component
- json() từ react-router — không available trong extension
- useLoaderData(), Form — không tồn tại trong extension environment
```

Extension FETCH sang backend API của mình (`/api/orders/*/tingee-data`) — backend đó mới dùng `authenticate.public.checkout()`.

### Extension File Structure

```
extensions/order-status-ui/src/
├── index.tsx                    ← MODIFY (hiện là placeholder)
├── api/
│   └── client.ts               ← CREATE (fetch wrapper)
├── components/
│   ├── PaymentCard.tsx          ← CREATE (container, loading state)
│   ├── PaymentCard.css          ← CREATE (CSS isolation, BEM)
│   ├── PaymentCard.test.tsx     ← CREATE (tests)
│   └── [QRDisplay, DeeplinkButton, StatusBadge, CountdownTimer] ← Story 2.4, 2.5, 2.6
├── hooks/
│   └── [usePaymentStatus, useMobileDetect]   ← Story 2.5, 2.4
└── utils/
    ├── constants.ts             ← CREATE
    ├── formatters.ts            ← CREATE
    ├── formatters.test.ts       ← CREATE
    ├── i18n.ts                  ← CREATE
    └── deeplink.ts              ← Story 2.4
```

**Story này chỉ tạo foundation + PaymentCard + skeleton.** QRDisplay, DeeplinkButton, CountdownTimer, StatusBadge là Story 2.4-2.6.

### CSS Isolation — Bắt Buộc (Không Dùng Shadow DOM)

Shopify Extension không cho phép custom shadow root. Dùng attribute scope + BEM:

```css
/* ĐÚng — attribute scope bắt buộc */
[data-tng-extension] .tng-payment-card { ... }

/* SAI — không scope, sẽ leak vào merchant theme */
.tng-payment-card { ... }
```

Explicit resets thay `all: revert`:

```css
[data-tng-extension] .tng-payment-container {
  box-sizing: border-box !important;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  font-size: 16px !important;
  line-height: 1.5 !important;
  color: #111 !important;
  background: #fff !important;
  margin: 0 !important;
  padding: 16px !important;
}
[data-tng-extension] .tng-payment-container img {
  width: 200px !important;
  height: 200px !important;
  max-width: none !important;
  display: block !important;
}
```

`!important` chỉ trong reset layer — không dùng trong component-specific rules.

### Import Path — Extension vs App

```typescript
// TRONG EXTENSION (extensions/order-status-ui/src/):
import {
  useOrder,
  useLocalization,
} from "@shopify/ui-extensions-react/customer-account";
// PATH: @shopify/ui-extensions-react/customer-account (KHÔNG phải /checkout)

// SAI — đây là Checkout Extension, không phải Order Status:
import { useOrder } from "@shopify/ui-extensions-react/checkout";
```

### useOrder() — API Shape

```typescript
const order = useOrder();
// order.id: string (GID format: "gid://shopify/Order/123")
// order.name: string (e.g., "#1001")
// order.totalPrice: { amount: string; currencyCode: string }
// order.paymentGatewayNames: string[]
// order.financialStatus: 'PENDING' | 'PAID' | 'REFUNDED' | ...
```

Kiểm tra payment method qua `order.paymentGatewayNames`. Test env có thể dùng `"manual"` thay vì `"Thanh toán qua Tingee QR"`.

### VND Amount Formatting

```typescript
// ĐÚng — format kiểu Việt
export function formatVndAmount(amount: number): string {
  return (
    new Intl.NumberFormat("vi-VN", { style: "decimal" }).format(amount) + " đ"
  );
  // 1500000 → "1.500.000 đ"
}

// SAI — style: 'currency' sẽ in "₫" hoặc "VND"
new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
  1500000,
);
// → "1.500.000 ₫" hoặc "1.500.000 VND" (không đúng spec AC #2)
```

### Loading Skeleton — Không Dùng Thư Viện Ngoài

Extension environment không có React 18's `Suspense` từ Shopify. Dùng conditional rendering:

```typescript
const [isLoading, setIsLoading] = useState(true);
const [data, setData] = useState<TingeeDataResponse | null>(null);

useEffect(() => {
  fetchTingeeData(orderId, amount, orderNumber)
    .then(result => {
      setData(result);
      setIsLoading(false);
    })
    .catch(() => {
      setIsLoading(false);
      setError(true);
    });
}, []); // Run once on mount

if (isLoading) {
  return (
    <div data-tng-extension>
      <div className="tng-skeleton tng-skeleton--qr" />
      <div className="tng-skeleton tng-skeleton--amount" />
    </div>
  );
}
```

### COMPLETED State — Render Trực Tiếp (AC #5)

Khi order đã Paid trước khi Extension mount (buyer quay lại trang):

```typescript
// Khi data.status === 'COMPLETED': render success ngay, KHÔNG flash loading → pending
if (data?.status === 'COMPLETED') {
  return (
    <div data-tng-extension className="tng-payment-container">
      <div className="tng-payment-card">
        <span className="tng-status-badge tng-status-badge--paid">{t('paid', locale)}</span>
      </div>
    </div>
  );
}
```

Đây là Story 2.3. Story 2.5 sẽ implement polling cycle đầy đủ (PENDING → COMPLETED transition real-time).

### Dark Mode Detection

```typescript
import { useColorScheme } from "@shopify/ui-extensions-react/customer-account";

// Trong component:
const colorScheme = useColorScheme();
const isDark = colorScheme === "dark";
```

Áp dụng vào CSS class:

```typescript
<div
  data-tng-extension
  className={`tng-payment-container ${isDark ? 'tng-payment-container--dark' : ''}`}
>
```

QR container ALWAYS white — không override dù dark mode:

```css
[data-tng-extension] .tng-qr-container {
  background: #ffffff !important; /* Always white for QR scanning */
}
```

### API Endpoint (đã implement trong Story 2.1 và 2.2)

Story này chỉ CONSUME — không tạo backend:

```
GET /api/orders/{orderId}/tingee-data?amount={amount}&orderNumber={orderNumber}
→ { qrImageUrl, deeplinkUrl, amount, currency: 'VND', status: PaymentStatus, expiresAt, orderId }
  hoặc { error: string, code: string } với HTTP 503 khi Tingee down

GET /api/orders/{orderId}/payment-status
→ { status: PaymentStatus, paidAt?: string }
```

Backend route files đã có: `app/routes/api.orders.$orderId.tingee-data.tsx` và `app/routes/api.orders.$orderId.payment-status.tsx`.

### Testing trong Extension Environment

```typescript
// Dùng @shopify/ui-extensions-react/testing
import { mount } from "@shopify/ui-extensions-react/testing";

// Không dùng @testing-library/react — không compatible
// Không dùng jsdom render trực tiếp
```

Vitest config cho Extension nằm ở `vitest.config.ts` ở project root.

### Learnings từ Story 2.1 & 2.2 (Phải Follow)

1. **`Response.json()` (Node 22 native) — NOT `json()` từ react-router**: Backend đã implement. Extension fetch thông thường, không bị ảnh hưởng.
2. **Vitest mock pattern**: Dùng `vi.fn(function() {...})` cho class constructor mocks, không dùng arrow function (Vitest v4 ESM limitation). Áp dụng khi mock `fetchTingeeData`.
3. **IDOR prevention**: Backend lấy `shop` từ `sessionToken.dest` — Extension không cần làm gì thêm, chỉ gọi đúng endpoint với đúng `orderId`.
4. **`sessionToken.dest` null guard**: Extension fetch là unauthenticated từ phía Extension (authentication xảy ra ở backend via `authenticate.public.checkout()`).
5. **PaymentStatus mapping**: DB `SUCCESS` → Response `COMPLETED`. Extension luôn nhận `COMPLETED` (không nhận `SUCCESS`).
6. **Rate limit (Story 2.2)**: Backend enforce 10 req/10s per orderId+shop. Extension polling 5s interval là safe, nhưng cần handle 429 (Story 2.5 implement backoff).

### Files Summary

**MODIFY:**

| File                                       | Thay đổi                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `extensions/order-status-ui/src/index.tsx` | Thay placeholder bằng implementation với `useOrder()`, `useLocalization()`, điều kiện render Tingee payment |

**CREATE:**

| File                                                             | Mục đích                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `extensions/order-status-ui/src/api/client.ts`                   | Fetch wrapper cho `/api/orders/*` endpoints                    |
| `extensions/order-status-ui/src/utils/constants.ts`              | `POLL_INTERVAL_MS`, `EXPIRED_TIMEOUT_MS`, `PaymentStatus` type |
| `extensions/order-status-ui/src/utils/formatters.ts`             | `formatVndAmount()` — format "1.500.000 đ"                     |
| `extensions/order-status-ui/src/utils/formatters.test.ts`        | Unit tests cho formatter                                       |
| `extensions/order-status-ui/src/utils/i18n.ts`                   | `t()` function — Vietnamese/English microcopy                  |
| `extensions/order-status-ui/src/components/PaymentCard.tsx`      | Container, loading skeleton, loaded state, dark mode           |
| `extensions/order-status-ui/src/components/PaymentCard.css`      | CSS isolation (BEM +`[data-tng-extension]` scope)              |
| `extensions/order-status-ui/src/components/PaymentCard.test.tsx` | Unit tests cho PaymentCard                                     |

**DO NOT TOUCH:**

| File                                                | Lý do                                             |
| --------------------------------------------------- | ------------------------------------------------- |
| `app/routes/api.orders.$orderId.tingee-data.tsx`    | Đã implement trong Story 2.1 — không sửa          |
| `app/routes/api.orders.$orderId.payment-status.tsx` | Đã implement trong Story 2.2 — không sửa          |
| `app/services/tingee.server.ts`                     | `verifyWebhookHMAC` stub giữ nguyên cho Story 3.1 |
| `prisma/schema.prisma`                              | Schema frozen từ Story 1.1 — không migration mới  |
| `extensions/order-status-ui/node_modules/`          | Không sửa node_modules                            |

**DO NOT CREATE:**

- Không tạo `QRDisplay.tsx`, `DeeplinkButton.tsx`, `CountdownTimer.tsx`, `StatusBadge.tsx` — đây là Story 2.4-2.6
- Không tạo `usePaymentStatus.ts`, `useMobileDetect.ts` — Story 2.5 và 2.4
- Không tạo backend routes mới — đã đủ từ Story 2.1 & 2.2
- Không tạo Pact tests — Story 2.3 không thêm contract mới

### Design Token Reference (từ UX DESIGN.md)

```
Payment Card:  background #fff / dark #1a1a1a; border 1px solid #e0e0e0 / dark #3a3a3a; radius 12px; padding 24px
QR Container:  background ALWAYS #fff; size 200×200; border 1px solid #e0e0e0; radius 8px; padding 8px
Amount:        font 24px/700; color #e12a41
Skeleton:      background #e0e0e0 (không animated — simple static gray box)
Touch target:  min 44×44px
Min font:      12px
```

### References

- [Source: epics.md#Story 2.3] — Acceptance criteria đầy đủ
- [Source: epics.md#Epic 2 Overview] — Two-endpoint API pattern, CSS isolation, sessionStorage
- [Source: architecture.md#Frontend Architecture] — State machine, polling lifecycle, BEM scoping
- [Source: architecture.md#CSS — `all: revert` Compatibility Fix] — Explicit resets thay `all: revert`
- [Source: architecture.md#Project Structure] — `extensions/order-status-ui/src/` structure
- [Source: architecture.md#Buyer Surface] — CSS isolation strategy, mobile detection, smart polling
- [Source: UX DESIGN.md] — Design tokens, colors, typography, spacing
- [Source: UX DESIGN.md#components.buyer-payment-card] — Card styles, dark mode
- [Source: story 2.1 Dev Notes] — Auth boundary, `authenticate.public.checkout()`, patterns
- [Source: story 2.2 Dev Notes] — Rate limiter, Pact patterns, `Response.json()` vs `json()`
- [Source: extensions/order-status-ui/src/index.tsx] — Current placeholder, imports đã có
- [Source: extensions/order-status-ui/package.json] — `@shopify/ui-extensions-react: ^2025.7.0`
- [Source: NFR-7] — QR/Deeplink pre-generated tại order time, không re-fetch khi render
- [Source: NFR-9] — Extension không làm chậm trang Order Status > 500ms (render non-blocking)
- [Source: UX-DR1 đến UX-DR20] — Design requirements đầy đủ trong epics.md

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `@shopify/ui-extensions-react/testing` không tồn tại trong v2025.7.3 — dùng `@testing-library/react` với `// @vitest-environment jsdom` và mock Shopify hooks thay thế
- `jsdom` chưa được cài trong root project — đã cài thêm `jsdom` và `@testing-library/jest-dom` as devDependencies
- 4 tests trong `app.settings.test.ts` fail là pre-existing (baseline commit), không liên quan story 2.3

### Completion Notes List

- Tạo `api/client.ts`: thin fetch wrapper, types `TingeeDataResponse` và `TingeeDataError`, dùng native `fetch()`, không dùng `authenticate.admin()`
- Tạo `utils/constants.ts`: constants cho polling và timeouts, type `PaymentStatus`
- Tạo `utils/formatters.ts`: `formatVndAmount()` dùng `Intl.NumberFormat('vi-VN', { style: 'decimal' })` + " đ" suffix — đúng spec AC#2
- Tạo `utils/i18n.ts`: `t()` function với Vietnamese/English translations, hỗ trợ `qrAltText` function key
- Tạo `components/PaymentCard.tsx`: container với loading skeleton, error state, COMPLETED direct render (AC#5), dark mode via `useColorScheme()`
- Tạo `components/PaymentCard.css`: CSS isolation với `[data-tng-extension]` scope + BEM, explicit resets (không `all: revert`), touch targets 44px, min-font 12px
- Cập nhật `index.tsx`: `useOrder()` + `useLocalization()` + `isTingeePayment` guard, render PaymentCard
- 11 tests mới: 4 formatter tests + 7 PaymentCard tests — tất cả pass
- Không có regression: 97/101 tests pass (4 pre-existing failures không liên quan)

### File List

- `extensions/order-status-ui/src/api/client.ts` (created)
- `extensions/order-status-ui/src/utils/constants.ts` (created)
- `extensions/order-status-ui/src/utils/formatters.ts` (created)
- `extensions/order-status-ui/src/utils/formatters.test.ts` (created)
- `extensions/order-status-ui/src/utils/i18n.ts` (created)
- `extensions/order-status-ui/src/components/PaymentCard.tsx` (created)
- `extensions/order-status-ui/src/components/PaymentCard.css` (created)
- `extensions/order-status-ui/src/components/PaymentCard.test.tsx` (created)
- `extensions/order-status-ui/src/index.tsx` (modified)
- `package.json` (modified — added jsdom, @testing-library/jest-dom as devDependencies)
- `pnpm-lock.yaml` (modified)

### Review Findings

- [x] [Review][Decision] `orderId` là Shopify GID — resolved: dùng `encodeURIComponent(orderId)` trong path (Option B); Pact contract đã design sẵn cho format này [`client.ts:23`]
- [x] [Review][Decision] AC5 violation — resolved: pass `financialStatus` prop từ `useOrder()`, bypass skeleton khi `financialStatus === "PAID"` (Option Y) [`PaymentCard.tsx:45-55`, `index.tsx:35`]
- [x] [Review][Patch] CSS selector mismatch — fixed: `[data-tng-extension] .tng-payment-container` → `[data-tng-extension].tng-payment-container` (compound selector) [`PaymentCard.css:2`]
- [x] [Review][Patch] Remove `|| order.paymentGatewayNames?.includes("manual")` — fixed [`index.tsx:19-21`]
- [x] [Review][Patch] `encodeURIComponent(orderNumber)` trong query string — fixed cùng với orderId fix [`client.ts:23`]
- [x] [Review][Patch] Wrap `response.json()` trong error branch bằng try/catch — fixed [`client.ts:27-30`]
- [x] [Review][Patch] QR `alt` text không localize — fixed: dùng `tWithArgs("qrAltText", locale, formatVndAmount(amount))` [`PaymentCard.tsx:103`]
- [x] [Review][Patch] Remove `[data-tng-extension] * { font-size: 12px; }` wildcard và duplicate selectors — fixed [`PaymentCard.css`]
- [x] [Review][Patch] Add FAILED/EXPIRED render branches — fixed: EXPIRED → badge + expiredMessage, FAILED → fallback UI [`PaymentCard.tsx:80-99`]
- [x] [Review][Patch] `useEffect` không có cleanup — fixed: dùng `AbortController`, cleanup trên unmount [`PaymentCard.tsx:27-39`]
- [x] [Review][Patch] Dark mode: outer container background/color — fixed: `[data-tng-extension].tng-payment-container--dark` override sau reset layer [`PaymentCard.css:20-23`]
- [x] [Review][Patch] Locale default `?? "vi"` → `?? "en"` — fixed [`index.tsx:35`]
- [x] [Review][Defer] No polling — `POLL_INTERVAL_MS` không được dùng; status không update sau fetch đầu [`PaymentCard.tsx`] — deferred, Story 2.5 (real-time polling)
- [x] [Review][Defer] QR expiry không enforce client-side — `expiresAt` nhận nhưng không check [`PaymentCard.tsx`] — deferred, Story 2.5-2.6 (countdown timer)
- [x] [Review][Defer] No fetch timeout / retry — skeleton mãi nếu network hang, không có auto-retry [`PaymentCard.tsx:27`] — deferred, Story 2.5 (offline resilience)
- [x] [Review][Defer] DEEPLINK constants (`DEEPLINK_TIMEOUT_IOS_MS`, `DEEPLINK_TIMEOUT_ANDROID_MS`) unused [`constants.ts`] — deferred, Story 2.4
- [x] [Review][Defer] `tWithArgs` exported nhưng chưa dùng [`i18n.ts`] — deferred, Story 2.4/2.5 sẽ dùng cho deeplink/QR alt
- [x] [Review][Defer] `parseFloat` NaN nếu `totalPrice.amount` không phải numeric [`index.tsx:24`] — deferred, Shopify API đảm bảo numeric string
- [x] [Review][Defer] `amount=0` gọi Tingee API với zero amount [`index.tsx:24`] — deferred, behavior ngoài scope story này
- [x] [Review][Defer] `qrImageUrl` null/empty trong PENDING state — QR section ẩn không có giải thích [`PaymentCard.tsx:74`] — deferred, edge case ngoài scope story này

## Change Log

- 2026-06-25: Story created — Extension foundation, loading skeleton, Payment Card, CSS isolation, VND formatter, i18n
- 2026-06-25: Implementation complete — 8 files created/modified, 11 tests added, all ACs satisfied
