---
baseline_commit: "NO_VCS"
---

# Story 2.6: Countdown Timer & QR Expiry State

Status: done

## Story

As a buyer,
I want to know how much time I have left to complete payment, and get clear guidance if the QR expires,
So that I never end up stuck on a page with an unusable QR.

## Acceptance Criteria

1. **Given** order status is `PENDING` and `expiresAt` is in the future, **When** CountdownTimer renders, **Then** displays `mm:ss` countdown from 15:00 in JetBrains Mono 13px, muted-text `#6b6b6b`, `aria-live="off"` (no announcement every second)

2. **Given** countdown reaches 0:00 OR polling receives `{ status: 'EXPIRED' }` (whichever is first), **When** either condition is met, **Then** QR image and Deeplink button are hidden; Payment Card shows: "Mã QR đã hết hạn sau 15 phút." + button "Quay lại cửa hàng" linking to merchant storefront root; polling stops

3. **Given** the expired state, **When** inspected, **Then** there is NO "Tạo lại QR" or refresh button — buyer must place a new order

4. **Given** 30 minutes have elapsed since Extension mount with no payment, **When** this threshold is reached, **Then** the block shows: "Chưa nhận được xác nhận thanh toán. Nếu bạn đã thanh toán, đơn hàng sẽ được xác nhận trong vài phút." + contact support link; polling has already stopped at the 15-min expiry

5. **Given** `EXPIRED` status in `sessionStorage` cache, **When** Extension re-mounts, **Then** it restores expired UI immediately — no flicker to loading/pending state

6. **Given** countdown reaches 0, **When** expiry triggers, **Then** `aria-live="polite"` fires once on the status container to announce expiry to screen readers

## Tasks / Subtasks

- [x] Task 1: Tạo `extensions/order-status-ui/src/hooks/useCountdown.ts` (AC: #1, #2, #6)
  - [x] Export `CountdownResult` type: `{ secondsLeft: number; isExpired: boolean }`
  - [x] Signature: `useCountdown(expiresAt: string | null, onExpire?: () => void): CountdownResult`
  - [x] Tính `secondsLeft` từ `Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))`
  - [x] Khởi tạo state bằng lazy initializer — tránh flash "15:00" khi expiresAt đã gần hết
  - [x] Dùng `setInterval(1000)` để giảm secondsLeft mỗi giây
  - [x] Dùng `useRef` để track `onExpireCalled` — đảm bảo `onExpire()` chỉ gọi đúng 1 lần khi `secondsLeft === 0`
  - [x] Cleanup `clearInterval` khi unmount
  - [x] Khi `expiresAt === null`: return `{ secondsLeft: 0, isExpired: false }` (không start timer)
  - [x] Khi `expiresAt` đã qua: return `{ secondsLeft: 0, isExpired: true }` ngay lập tức (không wait 1 tick)

- [x] Task 2: Tạo `extensions/order-status-ui/src/hooks/useCountdown.test.ts` (AC: #1, #2, #6)
  - [x] `// @vitest-environment jsdom`
  - [x] `vi.useFakeTimers()` trong `beforeEach`; `vi.useRealTimers()` trong `afterEach`
  - [x] Test: `expiresAt` = now + 900s → `secondsLeft = 900`, `isExpired = false`
  - [x] Test: Advance timer 1000ms → `secondsLeft = 899`
  - [x] Test: Advance timer đến hết → `secondsLeft = 0`, `isExpired = true`
  - [x] Test: `onExpire` gọi đúng 1 lần khi countdown về 0 (không gọi lại ở tick tiếp theo)
  - [x] Test: `expiresAt` đã qua → `isExpired = true` ngay lập tức, `onExpire` gọi ngay
  - [x] Test: `expiresAt = null` → `secondsLeft = 0`, `isExpired = false`, timer KHÔNG chạy
  - [x] Test: Unmount → không có memory leak (timer cleared — dùng `vi.getTimerCount()`)

- [x] Task 3: Tạo `extensions/order-status-ui/src/components/CountdownTimer.tsx` (AC: #1)
  - [x] Props: `{ expiresAt: string | null; onExpire: () => void; locale: string }`
  - [x] Gọi `useCountdown(expiresAt, onExpire)`
  - [x] Format "mm:ss": `String(Math.floor(secondsLeft / 60)).padStart(2, '0') + ':' + String(secondsLeft % 60).padStart(2, '0')`
  - [x] Không render gì nếu `isExpired` (CountdownTimer ẩn khi hết hạn — EXPIRED render xử lý bởi PaymentCard)
  - [x] JSX: `<p className="tng-countdown-timer" aria-live="off" aria-label="...">mm:ss</p>`
  - [x] `aria-label`: vi = `"Thời gian còn lại: ${mm} phút ${ss} giây"`, en = `"Time remaining: ${mm} minutes ${ss} seconds"` — dùng `locale` prop

- [x] Task 4: Tạo `extensions/order-status-ui/src/components/CountdownTimer.test.tsx` (AC: #1)
  - [x] `// @vitest-environment jsdom`
  - [x] Mock `useCountdown`: `vi.mock('../hooks/useCountdown', () => ({ useCountdown: vi.fn() }))`
  - [x] Test: `secondsLeft = 900` → renders "15:00"
  - [x] Test: `secondsLeft = 61` → renders "01:01"
  - [x] Test: `secondsLeft = 0`, `isExpired = true` → renders nothing (không render `<p>`)
  - [x] Test: `aria-live="off"` trên `<p>` element
  - [x] Test: locale "vi" → `aria-label` chứa "Thời gian còn lại"
  - [x] Test: locale "en" → `aria-label` chứa "Time remaining"

- [x] Task 5: Cập nhật `extensions/order-status-ui/src/utils/i18n.ts` (AC: #2, #4)
  - [x] Thêm `timeoutMessage`: vi = `"Chưa nhận được xác nhận thanh toán. Nếu bạn đã thanh toán, đơn hàng sẽ được xác nhận trong vài phút."`, en = `"Payment confirmation not yet received. If you've already paid, your order will be confirmed in a few minutes."`
  - [x] Thêm `contactSupport`: vi = `"Liên hệ hỗ trợ"`, en = `"Contact support"`
  - [x] Giữ nguyên mọi key hiện có — chỉ append `timeoutMessage` và `contactSupport`

- [x] Task 6: Cập nhật `extensions/order-status-ui/src/components/PaymentCard.tsx` (AC: #1-#6)
  - [x] Import `CountdownTimer` từ `./CountdownTimer`
  - [x] Import `useRef`, `useCallback` (đã có từ React — chỉ thêm nếu chưa có)
  - [x] Thêm `mountTimeRef = useRef(Date.now())` ngay TRƯỚC `const [loadState, ...]` (đảm bảo mount time được capture ngay lập tức)
  - [x] Thêm `const [localExpired, setLocalExpired] = useState(false)` — đặt cạnh `useState` khác
  - [x] Thêm `const handleLocalExpiry = useCallback(() => setLocalExpired(true), [])`
  - [x] Cập nhật `effectiveStatus` calculation:
    ```tsx
    const baseStatus = polledStatus ?? (loadState === "loaded" ? (data?.status ?? null) : null);
    const effectiveStatus: PaymentStatus | null =
      localExpired && baseStatus !== "COMPLETED" ? "EXPIRED" : baseStatus;
    ```
  - [x] Trong PENDING render: thêm `<CountdownTimer expiresAt={data?.expiresAt ?? null} onExpire={handleLocalExpiry} locale={locale} />` — đặt SAU `<StatusBadge>` và TRƯỚC `{showConnectionToast && ...}`
  - [x] **THAY THẾ HOÀN TOÀN** EXPIRED render hiện tại (đang dùng raw `<span>`) bằng render mới
  - [x] **KHÔNG THÊM** bất kỳ nút "Tạo lại QR" hay "Refresh" nào (AC #3 — hard requirement)

- [x] Task 7: Cập nhật `extensions/order-status-ui/src/components/PaymentCard.css` (AC: #1, #2)
  - [x] Thêm countdown timer style
  - [x] Thêm "Quay lại cửa hàng" button style
  - [x] Thêm 30-minute timeout message + support link
  - [x] Không chỉnh sửa `.tng-status-badge--expired` (đã có từ Story 2.3)

- [x] Task 8: Cập nhật `extensions/order-status-ui/src/components/PaymentCard.test.tsx` (AC: #1-#6)
  - [x] Thêm mock `CountdownTimer`
  - [x] Test: PENDING state → `CountdownTimer` renders (data-testid="mock-countdown" present), `expiresAt` prop passed down
  - [x] Test: click `mock-countdown` (simulate onExpire) → EXPIRED state renders (hides QR, shows expiredMessage)
  - [x] Test: EXPIRED state (via `usePaymentStatus` returning 'EXPIRED') → "Mã QR đã hết hạn sau 15 phút." và "Quay lại cửa hàng" hiển thị
  - [x] Test: EXPIRED state → KHÔNG có text "Tạo lại QR"
  - [x] Test: EXPIRED state với `Date.now() > mountTime + 30min` → "Chưa nhận được xác nhận thanh toán..." và "Liên hệ hỗ trợ" hiển thị
  - [x] Test: AC5 — `usePaymentStatus` trả `status: 'EXPIRED'` từ cache → EXPIRED UI render ngay không flicker
  - [x] Giữ nguyên tất cả tests hiện có — chỉ thêm mock + tests mới

## Dev Notes

### Trạng Thái Hiện Tại sau Story 2.5

**KHÔNG ĐỘNG** (các files này đã hoàn thiện, không sửa):
```
extensions/order-status-ui/src/
├── index.tsx
├── api/client.ts
├── components/
│   ├── QRDisplay.tsx / QRDisplay.test.tsx
│   ├── DeeplinkButton.tsx / DeeplinkButton.test.tsx
│   └── StatusBadge.tsx / StatusBadge.test.tsx
├── hooks/
│   ├── useMobileDetect.ts / useMobileDetect.test.ts
│   └── usePaymentStatus.ts / usePaymentStatus.test.ts
└── utils/
    ├── constants.ts       ← KHÔNG ĐỘNG (EXPIRED_TIMEOUT_MS đã có = 15*60*1000)
    ├── formatters.ts
    ├── deeplink.ts / deeplink.test.ts
    └── formatters.test.ts
```

**CẦN SỬA:**
```
├── components/
│   ├── PaymentCard.tsx         ← CẦN SỬA (CountdownTimer + EXPIRED render mới)
│   ├── PaymentCard.css         ← CẦN SỬA (countdown + expiry styles)
│   └── PaymentCard.test.tsx    ← CẦN SỬA (thêm CountdownTimer mock + tests)
└── utils/
    └── i18n.ts                 ← CẦN SỬA (thêm timeoutMessage, contactSupport)
```

**TẠO MỚI:**
```
├── components/
│   ├── CountdownTimer.tsx
│   └── CountdownTimer.test.tsx
└── hooks/
    ├── useCountdown.ts
    └── useCountdown.test.ts
```

### `constants.ts` — Keys Đã Có

```typescript
export const EXPIRED_TIMEOUT_MS = 15 * 60 * 1000; // = 900 giây — dùng cho reference/test
```
KHÔNG import `EXPIRED_TIMEOUT_MS` vào `useCountdown` — hook nhận `expiresAt: string` ISO và tự tính. Constant này để test có thể reference nhất quán.

### `useCountdown` — Implementation Reference

```typescript
// extensions/order-status-ui/src/hooks/useCountdown.ts
import { useState, useEffect, useRef } from "react";

export type CountdownResult = {
  secondsLeft: number;
  isExpired: boolean;
};

function computeSecondsLeft(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export function useCountdown(
  expiresAt: string | null,
  onExpire?: () => void
): CountdownResult {
  const [secondsLeft, setSecondsLeft] = useState(() => computeSecondsLeft(expiresAt));
  const onExpireCalledRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire; // always-fresh ref — không thêm vào deps

  useEffect(() => {
    if (!expiresAt) return;

    // Nếu đã hết hạn khi mount → fire onExpire ngay
    const initial = computeSecondsLeft(expiresAt);
    if (initial === 0 && !onExpireCalledRef.current) {
      onExpireCalledRef.current = true;
      onExpireRef.current?.();
      return;
    }

    const interval = setInterval(() => {
      const left = computeSecondsLeft(expiresAt);
      setSecondsLeft(left);
      if (left === 0 && !onExpireCalledRef.current) {
        onExpireCalledRef.current = true;
        onExpireRef.current?.();
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  return { secondsLeft, isExpired: secondsLeft === 0 && expiresAt !== null };
}
```

**Lưu ý quan trọng:**
- `onExpireRef` pattern tránh thêm `onExpire` vào `useEffect` deps (tránh restart timer mỗi render)
- `onExpireCalledRef` đảm bảo callback chỉ fire 1 lần — tránh double-call khi StrictMode
- `isExpired: secondsLeft === 0 && expiresAt !== null` — khi `expiresAt = null`, không coi là expired

### `CountdownTimer` — Implementation Reference

```tsx
// extensions/order-status-ui/src/components/CountdownTimer.tsx
import { useCountdown } from "../hooks/useCountdown";

type Props = {
  expiresAt: string | null;
  onExpire: () => void;
  locale: string;
};

export function CountdownTimer({ expiresAt, onExpire, locale }: Props) {
  const { secondsLeft, isExpired } = useCountdown(expiresAt, onExpire);

  if (isExpired) return null; // PaymentCard handles expired UI

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");

  const ariaLabel = locale.startsWith("vi")
    ? `Thời gian còn lại: ${mins} phút ${secs} giây`
    : `Time remaining: ${mins} minutes ${secs} seconds`;

  return (
    <p className="tng-countdown-timer" aria-live="off" aria-label={ariaLabel}>
      {mm}:{ss}
    </p>
  );
}
```

### `PaymentCard.tsx` — PENDING render sau Story 2.6

```tsx
// Trong PENDING state render (sau loadState checks, effectiveStatus === null hoặc PENDING):
return (
  <div data-tng-extension className={containerClass}>
    <div className="tng-payment-card">
      <p>{t("payWith", locale)}</p>
      <DeeplinkButton ... />
      <QRDisplay ... />
      <p className="tng-amount">{formatVndAmount(amount)}</p>
      <StatusBadge status="PENDING" locale={locale} />
      <CountdownTimer
        expiresAt={data?.expiresAt ?? null}
        onExpire={handleLocalExpiry}
        locale={locale}
      />
      {showConnectionToast && (
        <p className="tng-connection-toast">{t("checkingConnection", locale)}</p>
      )}
    </div>
  </div>
);
```

**Lưu ý:** `data?.expiresAt` có thể `undefined` khi `data === null` (loading state chưa xong). `CountdownTimer` nhận `null` trong trường hợp này — hook trả về `{ secondsLeft: 0, isExpired: false }` và không render gì (vì `isExpired: false` nhưng `secondsLeft: 0` → `null && null !== null` = false). Thực ra theo logic hook: khi `expiresAt === null`, `isExpired = false` và `secondsLeft = 0`, CountdownTimer sẽ render "00:00". Cần guard thêm:

**FIX:** Chỉ render CountdownTimer khi có data:
```tsx
{data?.expiresAt && (
  <CountdownTimer
    expiresAt={data.expiresAt}
    onExpire={handleLocalExpiry}
    locale={locale}
  />
)}
```

Điều này đảm bảo không render "00:00" trong loading phase.

### `PaymentCard.tsx` — effectiveStatus Update Pattern

Thay thế dòng hiện tại:
```tsx
// BEFORE (Story 2.5)
const effectiveStatus = polledStatus ?? (loadState === "loaded" ? (data?.status ?? null) : null);
```

Bằng:
```tsx
// AFTER (Story 2.6)
const baseStatus = polledStatus ?? (loadState === "loaded" ? (data?.status ?? null) : null);
const effectiveStatus: PaymentStatus | null =
  localExpired && baseStatus !== "COMPLETED" ? "EXPIRED" : baseStatus;
```

**Tại sao `baseStatus !== "COMPLETED"`?** Nếu countdown đồng thời về 0 với khi polling trả COMPLETED (edge case race), COMPLETED phải thắng — người mua đã thanh toán thành công.

### AC5 — sessionStorage EXPIRED Cache (Đã Handled bởi Story 2.5)

`usePaymentStatus.ts` (Story 2.5 patch) đã có:
```typescript
function readCache(orderId: string): CachedStatus | null {
  // ...
  if (TERMINAL_STATES.has(parsed.status)) return parsed; // không check TTL với terminal states
  return Date.now() - parsed.cachedAt < SESSION_CACHE_TTL_MS ? parsed : null;
}
```
Terminal states (`EXPIRED`, `COMPLETED`, `FAILED`) được restore từ sessionStorage **bất kể TTL**. Khi Extension re-mount sau EXPIRED, `polledStatus` sẽ là `'EXPIRED'` ngay từ đầu → `effectiveStatus = 'EXPIRED'` → EXPIRED UI render không flicker.

### AC6 — aria-live="polite" Fires Once on Expiry

`StatusBadge` component đã có `aria-live="polite"` wrapper:
```tsx
<div aria-live="polite" className="tng-status-badge-container">
  <span className={STATUS_CLASS[status]}>{t(STATUS_KEY[status], locale)}</span>
</div>
```
Khi `effectiveStatus` chuyển từ `PENDING` → `EXPIRED`, StatusBadge text thay đổi từ "Chờ thanh toán" → "Mã QR đã hết hạn" — screen reader sẽ announce tự động qua `aria-live="polite"`. Không cần implement thêm gì.

### JetBrains Mono Font

UX-DR2 yêu cầu JetBrains Mono 13px cho countdown timer. Trong Extension sandbox context, không thể dùng `@import` Google Fonts vì có thể bị CSP block. Giải pháp:
- CSS: `font-family: 'JetBrains Mono', 'Courier New', Courier, monospace;`
- JetBrains Mono sẽ load nếu đã có trên hệ thống (dev machines thường có). Trên buyer browser: fallback `Courier New` / `monospace` — vẫn đạt visual intent của "monospace timer".
- **KHÔNG** thêm `@import url('https://fonts.googleapis.com/...')` vào CSS Extension — CSP của Shopify storefront có thể block external font loads.

### 30-Minute Timeout State

AC #4 trigger: "30 minutes elapsed since Extension mount". Implementation:
- `mountTimeRef.current` capture `Date.now()` khi component init
- EXPIRED render kiểm tra: `Date.now() - mountTimeRef.current > 30 * 60 * 1000`
- Trên thực tế: QR hết hạn sau 15 phút → 30 phút timeout state chỉ kích hoạt khi buyer ở lại trang 30+ phút sau khi mount (= 15 phút sau khi EXPIRED)
- `mountTimeRef` KHÔNG reset khi status thay đổi — chỉ capture lúc mount ban đầu

**Testing timeout state:** Dùng `vi.setSystemTime(mountTime + 31 * 60 * 1000)` trước khi render.

### EXPIRED Render — Support Link URL

URL `/pages/contact` là Shopify convention cho contact page. Nếu merchant không có page này, link sẽ 404 — acceptable cho Phase 1. Không có dynamic shop URL available từ Extension props hiện tại (`index.tsx` không pass `shopUrl` xuống `PaymentCard`). Giữ đơn giản với `/pages/contact`.

### Testing Patterns từ Story 2.5 (Áp Dụng Cho Story Này)

```typescript
// Fake timers cho useCountdown
vi.useFakeTimers();
const { result } = renderHook(() => useCountdown("2026-01-01T00:15:00.000Z"));
vi.advanceTimersByTime(1000); // advance 1 giây
expect(result.current.secondsLeft).toBe(899);

// Test onExpire called once
const onExpire = vi.fn();
renderHook(() => useCountdown(pastISOString, onExpire));
// Không advance timer — đã expired khi mount
expect(onExpire).toHaveBeenCalledTimes(1);

// Test 30-min timeout trong PaymentCard
vi.setSystemTime(mountTime + 31 * 60 * 1000);
// Re-render với usePaymentStatus mock returning EXPIRED
```

### Project Structure Notes

- Tất cả hook files trong `hooks/` với suffix `.ts` (không phải `.tsx` — không có JSX)
- Tất cả component files trong `components/` với suffix `.tsx`
- Test files cùng folder với file được test, suffix `.test.ts` hoặc `.test.tsx`
- CSS isolation: selector luôn bắt đầu bằng `[data-tng-extension]` và class `tng-*`
- `aria-live="off"` trên countdown (KHÔNG phải `aria-live="polite"`) — critical per AC1

### References

- [Source: epics.md#Story 2.6] — Acceptance criteria đầy đủ
- [Source: epics.md#FR-10b] — QR expiry 15 phút, countdown timer, expired state + "Quay lại cửa hàng"
- [Source: epics.md#UX-DR2] — JetBrains Mono 13px chỉ cho countdown timer
- [Source: epics.md#UX-DR10] — Countdown Timer: JetBrains Mono 13px, muted-text #6b6b6b, format "mm:ss", `aria-live="off"`
- [Source: epics.md#UX-DR20] — 30-minute timeout message + contact support link
- [Source: epics.md#NFR-10] — Dừng polling tại terminal state (EXPIRED) — đã implement trong Story 2.5
- [Source: constants.ts] — `EXPIRED_TIMEOUT_MS = 15 * 60 * 1000`, `PaymentStatus` type
- [Source: story 2.5 Dev Notes#Testing Patterns] — `vi.useFakeTimers()`, `vi.advanceTimersByTimeAsync()`, `vi.setSystemTime()`
- [Source: story 2.5 Dev Notes#PaymentCard PENDING render] — Structure hiện tại của PENDING render
- [Source: story 2.5 Completion Notes] — EXPIRED render chưa dùng StatusBadge (dùng raw `<span>`) → Story 2.6 fix
- [Source: usePaymentStatus.ts:readCache] — Terminal states cache không expire → AC5 tự động handled
- [Source: StatusBadge.tsx] — aria-live="polite" wrapper → AC6 tự động handled qua status text change
- [Source: PaymentCard.tsx:98-108] — EXPIRED state hiện tại cần REPLACE HOÀN TOÀN (raw span → StatusBadge)
- [Source: i18n.ts] — `expired`, `expiredMessage`, `backToStore` đã có; cần thêm `timeoutMessage`, `contactSupport`
- [Source: PaymentCard.css] — `.tng-status-badge--expired` đã có; chỉ thêm `.tng-countdown-timer`, `.tng-back-to-store`, `.tng-timeout-message`, `.tng-support-link`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Pre-existing test failure không liên quan story 2.6: `usePaymentStatus.test.ts > ignores sessionStorage cache older than 30s` — đã có trước khi implement, không do thay đổi story này gây ra.
- Test "shows timeout message after 30 minutes": cần dùng `vi.spyOn(Date, 'now')` thay vì `vi.useFakeTimers()` để tránh `waitFor` bị block. `mountDone` flag cho phép first render capture mount time `T`, subsequent renders và EXPIRED check dùng `T + 31min`.

### Completion Notes List

- **Task 1-2**: `useCountdown` hook với lazy initializer, `onExpireRef` pattern tránh stale closure, `onExpireCalledRef` đảm bảo callback chỉ fire 1 lần. 9 tests xanh.
- **Task 3-4**: `CountdownTimer` component với `aria-live="off"` (critical per AC1), format "mm:ss", returns null khi isExpired. 6 tests xanh.
- **Task 5**: Thêm `timeoutMessage` + `contactSupport` vào `i18n.ts` cho cả vi và en.
- **Task 6**: `PaymentCard` — thêm `mountTimeRef`, `localExpired` state, `handleLocalExpiry` callback, `effectiveStatus` với COMPLETED-wins logic, CountdownTimer trong PENDING render (guard `data?.expiresAt`), EXPIRED render mới dùng `StatusBadge` + conditional 30-min timeout. 7 tests mới xanh, tất cả tests cũ giữ nguyên.
- **Task 7**: CSS cho `.tng-countdown-timer` (JetBrains Mono 13px, #6b6b6b), `.tng-back-to-store`, `.tng-timeout-message`, `.tng-support-link`.
- **Task 8**: Thêm `CountdownTimer` mock + 6 tests mới vào `PaymentCard.test.tsx`.
- Tổng: 83/84 tests xanh (1 pre-existing failure không thuộc story 2.6).

### File List

- `extensions/order-status-ui/src/hooks/useCountdown.ts` (NEW)
- `extensions/order-status-ui/src/hooks/useCountdown.test.ts` (NEW)
- `extensions/order-status-ui/src/components/CountdownTimer.tsx` (NEW)
- `extensions/order-status-ui/src/components/CountdownTimer.test.tsx` (NEW)
- `extensions/order-status-ui/src/utils/i18n.ts` (MODIFIED)
- `extensions/order-status-ui/src/components/PaymentCard.tsx` (MODIFIED)
- `extensions/order-status-ui/src/components/PaymentCard.css` (MODIFIED)
- `extensions/order-status-ui/src/components/PaymentCard.test.tsx` (MODIFIED)

### Senior Developer Review (AI)

**Outcome:** Changes Requested | **Date:** 2026-06-28

#### Action Items

- [x] [Review][Decision] FAILED status bị override bởi localExpired — dismissed, giữ nguyên EXPIRED thắng FAILED (user decision 2026-06-28)
- [x] [Review][Decision] AC6 aria-live không guaranteed — dismissed, dynamic insertion đủ cho Phase 1 (user decision 2026-06-28)
- [x] [Review][Patch] onExpireCalledRef không reset khi expiresAt thay đổi — FIXED: thêm reset trong useEffect, thêm test [useCountdown.ts:useEffect]
- [x] [Review][Patch] Invalid date string → NaN trong computeSecondsLeft — FIXED: thêm isNaN guard + isValidExpiresAt trong return, thêm 2 tests [useCountdown.ts:computeSecondsLeft]
- [x] [Review][Defer] Hard-coded URLs `/pages/contact` và `/` có thể 404 trên non-standard Shopify URL config [PaymentCard.tsx] — deferred, Phase 1 acceptable per Dev Notes
- [x] [Review][Defer] >99min expiresAt gây 3+ chữ số phút, phá MM:SS layout [CountdownTimer.tsx:14] — deferred, QR luôn 15min max trong implementation này
- [x] [Review][Defer] CSS `line-height: 44px` break khi text wrap trên viewport hẹp [PaymentCard.css] — deferred, label text đủ ngắn

## Change Log

- 2026-06-27: Story 2.6 implemented — Countdown Timer & QR Expiry State. Tạo mới `useCountdown` hook và `CountdownTimer` component. Cập nhật `PaymentCard` với timer integration, EXPIRED render mới dùng `StatusBadge`, 30-min timeout state. Thêm i18n keys `timeoutMessage` và `contactSupport`. 30 tests mới tất cả xanh.
- 2026-06-28: Code review — 2 decision-needed, 2 patch, 3 deferred, 17 dismissed.
