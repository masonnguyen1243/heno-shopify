---
baseline_commit: b22a122f04b6b7c4d3fe933dc9c7d1aa5c838b38
---

# Story 2.4: QR Display, Deeplink Button & Mobile Detection

Status: done

## Story

As a buyer,
I want to see a QR code on desktop or a "Mở app ngân hàng" button on mobile,
So that I can pay using whichever method suits my device.

## Acceptance Criteria

1. **Given** a desktop viewport (≥768px), **When** the Payment Card renders, **Then** QR code image displays at minimum 200×200px (never below 160px), always white container, 1px border, 8px radius — Deeplink button is NOT rendered

2. **Given** a mobile viewport (<768px), **When** the Payment Card renders, **Then** Deeplink button "Mở app ngân hàng" renders prominently ABOVE the QR, brand red `#e12a41`, minimum 44×44px touch target, `aria-label="Mở app ngân hàng để thanh toán [amount] đồng"`

3. **Given** mobile detection logic in `hooks/useMobileDetect.ts`, **When** evaluated, **Then** 2-of-3 signals are required: (1) `(hover: none) and (pointer: coarse)` media query, (2) `window.innerWidth < 768`, (3) UA string `/Mobi|Android/i` — correctly handles Cốc Cốc, UC Browser, iPad Pro, Samsung DeX

4. **Given** the buyer taps "Mở app ngân hàng" on iOS, **When** tapped, **Then** `window.location.href = deeplinkUrl` fires; if app does not open within 3500ms, QR fallback shows (`showQRFallback()`); if tab becomes hidden (app opened), the timer is cancelled via `visibilitychange`

5. **Given** the buyer taps "Mở app ngân hàng" on Android, **When** tapped, **Then** same flow with 2000ms timeout before QR fallback

6. **Given** the buyer taps the QR image on mobile, **When** tapped, **Then** a zoom/lightbox opens showing QR at full screen width (aids scanning in difficult conditions)

7. **Given** `deeplinkUrl` is `null` (Tingee API failed to generate Deeplink), **When** rendered on mobile, **Then** Deeplink button is hidden — only QR is shown, no error message to buyer

8. **Given** QR `<img>` element, **When** inspected for accessibility, **Then** alt text is "Mã QR thanh toán [amount] đồng qua Tingee"

## Tasks / Subtasks

- [x] Task 1: Tạo `extensions/order-status-ui/src/hooks/useMobileDetect.ts` (AC: #3)
  - [x] Export `useMobileDetect(): boolean` — trả `true` nếu 2/3 signal đúng
  - [x] Signal 1: `window.matchMedia('(hover: none) and (pointer: coarse)').matches`
  - [x] Signal 2: `window.innerWidth < 768`
  - [x] Signal 3: `navigator.userAgentData?.mobile ?? /Mobi|Android/i.test(navigator.userAgent)`
  - [x] Voting: `[signal1, signal2, signal3].filter(Boolean).length >= 2`
  - [x] SSR safety: wrap trong `typeof window !== 'undefined'` guard — trả `false` nếu không có window
  - [x] Dùng lazy initializer để tránh flash desktop layout trên mobile: `useState(() => detectMobile())` — tách `detectMobile()` thành function riêng, gọi trong initializer và trong `useEffect` (để đồng bộ sau hydration nếu cần)
  - [x] Hook thuần React — KHÔNG import từ `@shopify/ui-extensions-react` (hook này là logic thuần)

- [x] Task 2: Tạo `extensions/order-status-ui/src/utils/deeplink.ts` (AC: #4, #5)
  - [x] Export `openDeeplink(url: string, onFallback: () => void): void`
  - [x] iOS detection: `/iPhone|iPad|iPod/i.test(navigator.userAgent)` → dùng `DEEPLINK_TIMEOUT_IOS_MS` (3500ms từ constants.ts)
  - [x] Android và khác: dùng `DEEPLINK_TIMEOUT_ANDROID_MS` (2000ms từ constants.ts)
  - [x] `window.location.href = url` để trigger deeplink
  - [x] `const fallbackTimer = setTimeout(onFallback, timeout)` sau khi navigate
  - [x] `document.addEventListener('visibilitychange', handler, { once: true })` — khi tab hidden (app mở thành công) → `clearTimeout(fallbackTimer)`
  - [x] KHÔNG import từ `@shopify/ui-extensions-react` — utils thuần browser

- [x] Task 3: Tạo `extensions/order-status-ui/src/components/QRDisplay.tsx` (AC: #1, #6, #7, #8)
  - [x] Props: `{ qrImageUrl: string | undefined; amount: number; locale: string; isMobile: boolean }`
  - [x] State: `isLightboxOpen: boolean`
  - [x] Render QR: `<div className="tng-qr-container"><img src={qrImageUrl} alt={tWithArgs('qrAltText', locale, formatVndAmount(amount))} width={200} height={200} /></div>`
  - [x] Nếu `isMobile`: wrap img với button tap target để mở lightbox — `onClick={() => setIsLightboxOpen(true)}`
  - [x] Lightbox: khi `isLightboxOpen === true`, render overlay div `.tng-lightbox` với QR img full width
  - [x] Lightbox đóng khi click backdrop: `onClick` trên overlay (không phải trên QR img bên trong)
  - [x] `aria-label` trên lightbox trigger: "Phóng to mã QR" / "Zoom QR code"
  - [x] Nếu `qrImageUrl` là `undefined`/falsy: không render gì (parent đã handle loading state)

- [x] Task 4: Tạo `extensions/order-status-ui/src/components/DeeplinkButton.tsx` (AC: #2, #4, #5, #7)
  - [x] Props: `{ deeplinkUrl: string | null; amount: number; locale: string; isMobile: boolean; onFallback: () => void }`
  - [x] Nếu `!isMobile || !deeplinkUrl`: trả `null` — không render gì
  - [x] Button: `<button className="tng-deeplink-btn" onClick={handleClick} aria-label={...}>{t('openBankApp', locale)}</button>`
  - [x] `aria-label`: dùng `Intl.NumberFormat('vi-VN').format(amount)` (không suffix "đ") trong template: `"Mở app ngân hàng để thanh toán ${Intl.NumberFormat('vi-VN').format(amount)} đồng"` — KHÔNG dùng `formatVndAmount()` ở đây vì nó đã có "đ" suffix, sẽ tạo ra "1.500.000 đ đồng" (tiếng Anh: `"Open bank app to pay ${Intl.NumberFormat('vi-VN').format(amount)} đồng"`)
  - [x] `handleClick`: gọi `openDeeplink(deeplinkUrl, onFallback)` từ `utils/deeplink.ts`
  - [x] Import `openDeeplink` từ `../utils/deeplink`

- [x] Task 5: Cập nhật `extensions/order-status-ui/src/components/PaymentCard.tsx` (AC: #1, #2, #7)
  - [x] Import `useMobileDetect` từ `../hooks/useMobileDetect`
  - [x] Import `useColorScheme` từ `@shopify/ui-extensions-react/customer-account` (đã có trong project — dark mode fix)
  - [x] Import `QRDisplay` từ `./QRDisplay`
  - [x] Import `DeeplinkButton` từ `./DeeplinkButton`
  - [x] Thêm state: `const [showQRFallback, setShowQRFallback] = useState(false)`
  - [x] Call hook: `const isMobile = useMobileDetect()`
  - [x] Dark mode (fix từ Story 2.3): `const colorScheme = useColorScheme(); const isDark = colorScheme === 'dark';`
  - [x] Cập nhật `containerClass`: `const containerClass = \`tng-payment-container${isDark ? ' tng-payment-container--dark' : ''}\`` — hiện tại dark mode chưa bao giờ được apply vì `containerClass` hardcoded là `"tng-payment-container"`
  - [x] Trong render PENDING (phần cuối function): thay thế đoạn QR hiện tại bằng:
    ```tsx
    <DeeplinkButton
      deeplinkUrl={data?.deeplinkUrl ?? null}
      amount={amount}
      locale={locale}
      isMobile={isMobile}
      onFallback={() => setShowQRFallback(true)}
    />
    <QRDisplay
      qrImageUrl={data?.qrImageUrl}
      amount={amount}
      locale={locale}
      isMobile={isMobile}
    />
    ```
  - [x] `showQRFallback` state: khi deeplink fail → set `true`. QR đã luôn hiển thị nên state này chủ yếu để log/track. Implement đơn giản: chỉ định nghĩa state, truyền vào `onFallback`, không cần dùng trong render condition vì QR đã visible.

- [x] Task 6: Cập nhật `extensions/order-status-ui/src/components/PaymentCard.css` (AC: #2, #6)
  - [x] `.tng-deeplink-btn`: `background: #e12a41; color: #fff; border: none; border-radius: 8px; padding: 12px 24px; font-size: 16px; font-weight: 600; cursor: pointer; min-height: 44px; min-width: 44px; width: 100%; margin-bottom: 16px;`
  - [x] `.tng-deeplink-btn:hover`: `background: #c4223a;`
  - [x] `.tng-deeplink-btn:active`: `background: #a81b30;`
  - [x] `.tng-lightbox`: `position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 9999;`
  - [x] `.tng-lightbox__qr-container`: `background: #fff; border-radius: 8px; padding: 16px;`
  - [x] `.tng-lightbox__qr-container img`: `width: min(90vw, 400px) !important; height: min(90vw, 400px) !important; max-width: none !important;` — override img reset
  - [x] `.tng-qr-container--mobile`: cursor pointer, subtle tap affordance
  - [x] `.tng-qr-tap-trigger`: `background: none; border: none; padding: 0; cursor: pointer; display: block;` — reset button defaults để không làm lệch layout QR container bên trong

- [x] Task 7: Viết unit tests (AC: #1-#8)
  - [x] Cập nhật `extensions/order-status-ui/src/components/PaymentCard.test.tsx` — PHẢI SỬA vì Task 5 thêm `useMobileDetect()` vào PaymentCard:
    - [x] Mock `useMobileDetect` module ở đầu file: `vi.mock('../hooks/useMobileDetect', () => ({ useMobileDetect: () => false }))`
    - [x] Mock `useColorScheme`: `vi.mock('@shopify/ui-extensions-react/customer-account', ...)` — thêm `useColorScheme: () => 'light'` vào mock hiện tại
    - [x] Verify các tests PENDING state vẫn pass sau khi thêm mock
  - [x] `extensions/order-status-ui/src/hooks/useMobileDetect.test.ts`:
    - [x] Mock `window.matchMedia`, `window.innerWidth`, `navigator.userAgent`
    - [x] Test: 3/3 signals true → `true`
    - [x] Test: 2/3 signals true → `true`
    - [x] Test: 1/3 signals true → `false`
    - [x] Test: iPad Pro UA (tablet, no Mobi) + small screen + coarse → `true` (2/3)
    - [x] Test: Samsung DeX (large screen + no touch) → `false` (0-1/3)
    - [x] Dùng `// @vitest-environment jsdom` header
  - [x] `extensions/order-status-ui/src/utils/deeplink.test.ts`:
    - [x] Mock `window.location` — jsdom không support `href` assignment theo mặc định: `const locationMock = { href: '' }; Object.defineProperty(window, 'location', { value: locationMock, writable: true });`
    - [x] Mock `document.addEventListener` để capture visibilitychange handler
    - [x] Test: iOS UA → dùng 3500ms timeout (`vi.useFakeTimers()` + `vi.advanceTimersByTime(3500)`)
    - [x] Test: Android UA → dùng 2000ms timeout
    - [x] Test: tab becomes hidden (`document.hidden = false` trong callback) → `clearTimeout` được gọi, `onFallback` không được gọi
    - [x] Test: timeout fires trước visibilitychange → `onFallback` được gọi
    - [x] `afterEach: vi.useRealTimers()` để cleanup fake timers
  - [x] `extensions/order-status-ui/src/components/QRDisplay.test.tsx`:
    - [x] Setup: `@testing-library/react` với jsdom, mock Shopify hooks
    - [x] Test: desktop (isMobile=false) → QR img hiển thị, không có lightbox trigger
    - [x] Test: mobile (isMobile=true) → QR img với click handler
    - [x] Test: click QR trên mobile → lightbox mở
    - [x] Test: click lightbox backdrop → lightbox đóng
    - [x] Test: `qrImageUrl` undefined → không render img
    - [x] Test: alt text đúng format "Mã QR thanh toán [amount] qua Tingee"
  - [x] `extensions/order-status-ui/src/components/DeeplinkButton.test.tsx`:
    - [x] Test: `isMobile=false` → render `null`
    - [x] Test: `deeplinkUrl=null` → render `null`
    - [x] Test: `isMobile=true, deeplinkUrl="https://..."` → render button
    - [x] Test: aria-label có amount đúng
    - [x] Test: click button → `openDeeplink` được gọi (mock)

## Dev Notes

### Trạng thái hiện tại sau Story 2.3

Story này BUILD TRÊN FOUNDATION của Story 2.3. Các file đã có:

```
extensions/order-status-ui/src/
├── index.tsx                    ← ĐÃ CÓ — không sửa
├── api/client.ts               ← ĐÃ CÓ — không sửa
├── utils/constants.ts          ← ĐÃ CÓ — DEEPLINK_TIMEOUT_IOS_MS=3500, DEEPLINK_TIMEOUT_ANDROID_MS=2000
├── utils/formatters.ts         ← ĐÃ CÓ — formatVndAmount()
├── utils/i18n.ts               ← ĐÃ CÓ — openBankApp, backToStore, qrAltText đã có trong translations
├── components/PaymentCard.tsx  ← CẦN SỬA — thêm DeeplinkButton + QRDisplay
└── components/PaymentCard.css  ← CẦN SỬA — thêm deeplink button + lightbox styles
```

### PaymentCard.tsx — Trạng thái hiện tại và cần sửa

**Render PENDING hiện tại** (dòng 108-127):
```tsx
return (
  <div data-tng-extension className={containerClass}>
    <div className="tng-payment-card">
      <p>{t("payWith", locale)}</p>
      {data?.qrImageUrl && (
        <div className="tng-qr-container">
          <img src={data.qrImageUrl} alt={tWithArgs("qrAltText", locale, formatVndAmount(amount))} width={200} height={200} />
        </div>
      )}
      <p className="tng-amount">{formatVndAmount(amount)}</p>
      <p>{t("pending", locale)}</p>
    </div>
  </div>
);
```

**Render PENDING sau Story 2.4** — phần thay thế:
```tsx
return (
  <div data-tng-extension className={containerClass}>
    <div className="tng-payment-card">
      <p>{t("payWith", locale)}</p>
      <DeeplinkButton
        deeplinkUrl={data?.deeplinkUrl ?? null}
        amount={amount}
        locale={locale}
        isMobile={isMobile}
        onFallback={() => setShowQRFallback(true)}
      />
      <QRDisplay
        qrImageUrl={data?.qrImageUrl}
        amount={amount}
        locale={locale}
        isMobile={isMobile}
      />
      <p className="tng-amount">{formatVndAmount(amount)}</p>
      <p>{t("pending", locale)}</p>
    </div>
  </div>
);
```

Thêm vào đầu component:
```tsx
const isMobile = useMobileDetect();
const [showQRFallback, setShowQRFallback] = useState(false);
```

**Ghi chú `showQRFallback`:** Khi deeplink fail và `onFallback` được gọi, muốn hiển thị QR rõ ràng hơn cho user. Vì QR đã luôn hiển thị trong PENDING state, state này chỉ cần thiết nếu muốn thêm UI hint. Cho Phase 1, chỉ cần lưu state để tránh show deeplink button lại sau khi fallback (tuy nhiên `DeeplinkButton` đã ẩn khi `deeplinkUrl=null`, nên `showQRFallback` không thực sự cần thiết cho render logic). Implement đơn giản nhất: chỉ định nghĩa state, truyền vào `onFallback`, không dùng trong render condition.

### useMobileDetect — Implementation Chi Tiết

```typescript
// extensions/order-status-ui/src/hooks/useMobileDetect.ts
import { useState, useEffect } from "react";

function detectMobile(): boolean {
  if (typeof window === "undefined") return false;
  const signal1 = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const signal2 = window.innerWidth < 768;
  // userAgentData.mobile handles modern browsers; UA regex handles Cốc Cốc, UC Browser
  const signal3 = (navigator as any).userAgentData?.mobile 
    ?? /Mobi|Android/i.test(navigator.userAgent);
  return [signal1, signal2, signal3].filter(Boolean).length >= 2;
}

export function useMobileDetect(): boolean {
  // Lazy initializer: detect on first render to avoid desktop-flash on mobile
  const [isMobile, setIsMobile] = useState(() => detectMobile());

  useEffect(() => {
    // Re-run after hydration (safe no-op if value unchanged)
    setIsMobile(detectMobile());
  }, []);

  return isMobile;
}
```

**Tại sao dùng lazy initializer:** Extension chạy hoàn toàn client-side. Dùng `useState(false)` + `useEffect` sẽ gây mobile users thấy desktop layout 1 frame trước khi switch sang mobile. Lazy initializer `() => detectMobile()` detect ngay lần render đầu, loại bỏ flash.

**iPad Pro case:** iPad Pro thường có UA không chứa "Mobi" (signal3=false) nhưng có touch (signal1=true) và screen width < 768 trên portrait mode (signal2=true) → 2/3 = mobile.

**Samsung DeX case:** DeX mode kết nối màn hình ngoài, `innerWidth` sẽ lớn (signal2=false), UA không có "Mobi" (signal3=false), có thể không có `(hover: none)` (signal1=false) → 0/3 = desktop. Đúng behavior.

### deeplink.ts — Implementation Chi Tiết

```typescript
// extensions/order-status-ui/src/utils/deeplink.ts
import { DEEPLINK_TIMEOUT_IOS_MS, DEEPLINK_TIMEOUT_ANDROID_MS } from "./constants";

export function openDeeplink(url: string, onFallback: () => void): void {
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const timeout = isIOS ? DEEPLINK_TIMEOUT_IOS_MS : DEEPLINK_TIMEOUT_ANDROID_MS;

  window.location.href = url;

  const fallbackTimer = setTimeout(onFallback, timeout);

  // Nếu user quay lại tab (đã mở app thành công), cancel fallback
  const cancelFallback = () => {
    if (!document.hidden) {
      clearTimeout(fallbackTimer);
    }
  };
  document.addEventListener("visibilitychange", cancelFallback, { once: true });
}
```

**Edge case:** Nếu browser block `window.location.href` (pop-up blocker), deeplink sẽ không navigate và `onFallback` sẽ fire sau timeout. Đây là behavior đúng — user vẫn thấy QR.

**Unmount safety:** `openDeeplink` là pure function, không biết về React lifecycle. Nếu `DeeplinkButton` unmount trong khi timer đang chạy, `onFallback` vẫn sẽ fire và gọi `setShowQRFallback(true)` trên unmounted component (React warning, không crash). `DeeplinkButton` nên dùng `useRef` để guard:
```typescript
const isMountedRef = useRef(true);
useEffect(() => { return () => { isMountedRef.current = false; }; }, []);
const handleClick = () => {
  openDeeplink(deeplinkUrl, () => { if (isMountedRef.current) onFallback(); });
};
```

### QRDisplay — Design Quyết Định

**Lightbox approach:** Simple state-managed overlay, không cần thư viện:
```tsx
// Lightbox khi click QR trên mobile
{isLightboxOpen && (
  <div 
    className="tng-lightbox" 
    onClick={() => setIsLightboxOpen(false)} 
    role="dialog"
    aria-label={locale.startsWith("vi") ? "Phóng to mã QR" : "QR code zoom"}
  >
    <div className="tng-lightbox__qr-container" onClick={e => e.stopPropagation()}>
      <img src={qrImageUrl} alt={tWithArgs("qrAltText", locale, formatVndAmount(amount))} />
    </div>
  </div>
)}
```

**Tại sao `e.stopPropagation()` trên inner div:** Để click vào QR img bên trong không đóng lightbox. Chỉ click backdrop (`.tng-lightbox`) mới đóng.

**Trigger button khi mobile:**
```tsx
{isMobile && qrImageUrl ? (
  <button 
    className="tng-qr-tap-trigger" 
    onClick={() => setIsLightboxOpen(true)}
    aria-label={locale.startsWith("vi") ? "Phóng to mã QR" : "Zoom QR code"}
  >
    <div className="tng-qr-container">
      <img src={qrImageUrl} alt={...} width={200} height={200} />
    </div>
  </button>
) : (
  <div className="tng-qr-container">
    {qrImageUrl && <img src={qrImageUrl} alt={...} width={200} height={200} />}
  </div>
)}
```

### CSS Quan Trọng

**Lightbox z-index:** Phải cao hơn Shopify theme elements. `9999` là safe.

**Lightbox QR size:** Override rule `[data-tng-extension] img { width: 200px !important; height: 200px !important; }` hiện tại trong PaymentCard.css. Cần specificity mạnh hơn trong lightbox context:
```css
[data-tng-extension] .tng-lightbox__qr-container img {
  width: min(90vw, 400px) !important;
  height: min(90vw, 400px) !important;
}
```

**Deeplink button width:** `width: 100%` để đủ touch target trên mobile nhỏ.

### Testing — Known Patterns từ Story 2.3

1. **Testing environment:** Dùng `// @vitest-environment jsdom` ở đầu file test
2. **Mock `window.matchMedia`:** Phải mock vì jsdom không implement đầy đủ:
   ```typescript
   Object.defineProperty(window, 'matchMedia', {
     writable: true,
     value: vi.fn().mockImplementation(query => ({
       matches: false, // override per test
       media: query,
       addEventListener: vi.fn(),
       removeEventListener: vi.fn(),
     }))
   });
   ```
3. **Mock `window.innerWidth`:** `Object.defineProperty(window, 'innerWidth', { writable: true, value: 375 })`
4. **Mock Shopify hooks khi cần:** (QRDisplay và DeeplinkButton không dùng Shopify hooks — dùng `@testing-library/react` trực tiếp)
5. **Vitest mock pattern:** Dùng `vi.fn(function() {...})` cho constructor mocks (không phải arrow function) — Vitest v4 ESM limitation
6. **Fake timers:** `vi.useFakeTimers()` và `vi.useRealTimers()` trong `afterEach`

### i18n — Translations đã có sẵn

`utils/i18n.ts` đã có tất cả keys cần thiết:
- `openBankApp`: "Mở app ngân hàng" (vi) / "Open bank app" (en)
- `backToStore`: "Quay lại cửa hàng" (vi) / "Back to store" (en)
- `qrAltText`: function (amount: string) => `Mã QR thanh toán ${amount} qua Tingee`

**KHÔNG cần thêm key mới vào i18n.ts.** Chỉ cần thêm key cho lightbox aria-label nếu muốn i18n — nhưng có thể hardcode inline vì nó là accessibility text.

### Auth Boundary — Không thay đổi

Extension component gọi `/api/orders/*` qua `fetchTingeeData()` đã implement. Không tạo backend routes mới. Authentication xảy ra ở backend via `authenticate.public.checkout()` — Extension không cần biết.

### Không Có Polling trong Story Này

`useMobileDetect`, `QRDisplay`, `DeeplinkButton` không implement polling. Polling là Story 2.5. Đây chỉ là hiển thị và tương tác một lần.

### File Structure sau Story 2.4

```
extensions/order-status-ui/src/
├── index.tsx                           ← KHÔNG ĐỘNG
├── api/client.ts                       ← KHÔNG ĐỘNG
├── components/
│   ├── PaymentCard.tsx                 ← SỬA (thêm DeeplinkButton + QRDisplay + dark mode fix)
│   ├── PaymentCard.css                 ← SỬA (thêm styles)
│   ├── PaymentCard.test.tsx            ← SỬA (thêm mock useMobileDetect + useColorScheme)
│   ├── QRDisplay.tsx                   ← TẠO MỚI
│   ├── QRDisplay.test.tsx              ← TẠO MỚI
│   ├── DeeplinkButton.tsx              ← TẠO MỚI
│   └── DeeplinkButton.test.tsx         ← TẠO MỚI
├── hooks/
│   ├── useMobileDetect.ts              ← TẠO MỚI
│   └── useMobileDetect.test.ts         ← TẠO MỚI
└── utils/
    ├── constants.ts                    ← KHÔNG ĐỘNG
    ├── formatters.ts                   ← KHÔNG ĐỘNG
    ├── formatters.test.ts              ← KHÔNG ĐỘNG
    ├── i18n.ts                         ← KHÔNG ĐỘNG
    ├── deeplink.ts                     ← TẠO MỚI
    └── deeplink.test.ts                ← TẠO MỚI
```

**DO NOT CREATE:**
- `CountdownTimer.tsx`, `StatusBadge.tsx` — Story 2.5 và 2.6
- `usePaymentStatus.ts` — Story 2.5
- Backend routes mới

**DO NOT TOUCH:**
- `app/routes/api.orders.$orderId.tingee-data.tsx` — backend đã implement, không sửa
- `app/routes/api.orders.$orderId.payment-status.tsx` — Story 2.5 sẽ consume
- `app/services/tingee.server.ts` — `verifyWebhookHMAC` stub giữ nguyên cho Story 3.1
- `prisma/schema.prisma` — frozen từ Story 1.1

### Design Tokens Reference

```
Deeplink Button:   background #e12a41; hover #c4223a; active #a81b30; color #fff; radius 8px; min-touch 44×44px
QR Container:      background ALWAYS #fff (!important); size 200×200; min 160px mobile; border 1px #e0e0e0; radius 8px; padding 8px
Lightbox:          backdrop rgba(0,0,0,0.8); z-index 9999; QR size min(90vw, 400px)
```

### References

- [Source: epics.md#Story 2.4] — Acceptance criteria đầy đủ
- [Source: epics.md#Epic 2 Overview] — CSS isolation, mobile detection 2/3-signal voting
- [Source: architecture.md#Buyer Surface] — Mobile detection code snippet, deeplink fallback pattern
- [Source: architecture.md#Deeplink Timeout — iOS vs Android] — iOS 3500ms vs Android 2000ms chi tiết
- [Source: architecture.md#CSS — `all: revert` Compatibility Fix] — Explicit resets pattern
- [Source: architecture.md#Project Structure] — File paths trong `extensions/order-status-ui/src/`
- [Source: story 2.3 Dev Notes#Extension File Structure] — Files đã tạo, files Story 2.4+ cần tạo
- [Source: story 2.3 Dev Notes#Testing trong Extension Environment] — @testing-library/react + jsdom pattern
- [Source: story 2.3 Dev Notes#Learnings từ Story 2.1 & 2.2] — Vitest mock pattern `vi.fn(function...)`
- [Source: UX-DR12] — Deeplink Button: brand red, white text, 8px radius, aria-label format
- [Source: UX-DR16] — QR tap-to-zoom lightbox trên mobile
- [Source: UX-DR17] — Mobile detection 2/3 signal, handles Cốc Cốc/UC Browser/iPad Pro/Samsung DeX
- [Source: UX-DR8] — QR Container: always white, 200×200px minimum, không scale xuống < 160px
- [Source: constants.ts] — DEEPLINK_TIMEOUT_IOS_MS=3500, DEEPLINK_TIMEOUT_ANDROID_MS=2000
- [Source: i18n.ts] — `openBankApp`, `backToStore`, `qrAltText` đã có sẵn

### Review Findings

- [x] [Review][Decision] showQRFallback state đặt nhưng không dùng — **Resolved: Option 1** — xóa dead state. QR luôn visible là đủ. Party mode: John/Sally/Amelia đồng thuận 3/3.
- [x] [Review][Decision] visibilitychange cancel-on-any-hide — **Resolved: Dismiss** — browser API limitation, industry standard pattern. Winston/Amelia đồng thuận. Comment inline thêm vào deeplink.ts.
- [x] [Review][Patch] AC#8: alt text dùng "đ" thay vì "đồng" — fixed: i18n.ts vi template → `${amount} đồng qua Tingee`; QRDisplay.tsx dùng `Intl.NumberFormat` thay vì `formatVndAmount` [QRDisplay.tsx / i18n.ts]
- [x] [Review][Patch] AC#3: `userAgentData?.mobile ?? regex` — fixed: đổi `??` thành `||` để regex vẫn chạy khi userAgentData.mobile=false [useMobileDetect.ts:8]
- [x] [Review][Patch] Double-tap race: không có in-flight guard trên DeeplinkButton — fixed: thêm `isProcessingRef` + `cleanupRef` để block double-tap và cleanup listener khi unmount [DeeplinkButton.tsx]
- [x] [Review][Patch] Lightbox thiếu Escape key dismiss — fixed: thêm `useEffect` với `document.addEventListener("keydown")` + `aria-modal="true"` [QRDisplay.tsx]
- [x] [Review][Patch] detectMobile không guard `window.matchMedia` undefined — fixed: `typeof window.matchMedia === "function"` check trước khi gọi [useMobileDetect.ts:4]
- [x] [Review][Patch] openDeeplink visibilitychange listener leak — fixed: `openDeeplink` giờ return cleanup function `() => void`; DeeplinkButton dùng `cleanupRef` để gọi cleanup khi unmount [deeplink.ts / DeeplinkButton.tsx]
- [x] [Review][Defer] useMobileDetect không subscribe resize/orientationchange — device rotation sau render không cập nhật isMobile [useMobileDetect.ts] — deferred, pre-existing design scope
- [x] [Review][Defer] window.location.href deeplink trong iframe context — một số browser/WebView có thể block custom-scheme navigation trong iframe; fallback timer sẽ fire đúng nhưng initial navigation có thể fail silently [deeplink.ts:7] — deferred, pre-existing design scope

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Tạo `useMobileDetect` hook với 2-of-3 signal voting (matchMedia, innerWidth, UA). Dùng lazy initializer để tránh desktop flash trên mobile. 8 tests pass.
- Tạo `openDeeplink` util: iOS 3500ms / Android 2000ms timeout, visibilitychange cancel-on-app-open. 5 tests pass.
- Tạo `QRDisplay` component: desktop-only QR, mobile tap-to-zoom lightbox, null-safe khi qrImageUrl undefined. 10 tests pass.
- Tạo `DeeplinkButton` component: null khi !isMobile || !deeplinkUrl, aria-label dùng Intl.NumberFormat (không "đ" suffix), isMountedRef guard chống unmount warning. 8 tests pass.
- Cập nhật `PaymentCard.tsx`: thêm useMobileDetect + useColorScheme, dark mode containerClass fix, thay thế QR inline bằng DeeplinkButton + QRDisplay. 7 tests pass (existing tests giữ nguyên).
- Cập nhật `PaymentCard.css`: thêm deeplink button styles (brand red #e12a41), lightbox styles (z-index 9999), tng-qr-tap-trigger reset.
- Tổng: 42 tests pass, 0 failures, 0 regressions.

### File List

**Tạo mới:**
- `extensions/order-status-ui/src/hooks/useMobileDetect.ts`
- `extensions/order-status-ui/src/hooks/useMobileDetect.test.ts`
- `extensions/order-status-ui/src/utils/deeplink.ts`
- `extensions/order-status-ui/src/utils/deeplink.test.ts`
- `extensions/order-status-ui/src/components/QRDisplay.tsx`
- `extensions/order-status-ui/src/components/QRDisplay.test.tsx`
- `extensions/order-status-ui/src/components/DeeplinkButton.tsx`
- `extensions/order-status-ui/src/components/DeeplinkButton.test.tsx`

**Cập nhật:**
- `extensions/order-status-ui/src/components/PaymentCard.tsx`
- `extensions/order-status-ui/src/components/PaymentCard.css`
- `extensions/order-status-ui/src/components/PaymentCard.test.tsx`

## Change Log

- 2026-06-26: Story 2.4 implemented — QR Display, Deeplink Button & Mobile Detection. Tạo mới 8 files (4 implementation + 4 test), cập nhật 3 files hiện tại. 42 tests pass.
