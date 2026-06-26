---
baseline_commit: b6f54b2450de2c7e01c0fe3aff73aff600fd1c79
---

# Story 2.5: Real-time Polling, Status Updates & Offline Resilience

Status: done

## Story

As a buyer,
I want the page to automatically show "Đã thanh toán" when my transfer goes through,
So that I don't need to refresh and can confidently leave the page.

## Acceptance Criteria

1. **Given** Extension mounts with order status `PENDING`, **When** polling starts, **Then** `GET /api/orders/:orderId/payment-status` is called immediately (0ms initial delay) then every 5000ms

2. **Given** polling receives `{ status: 'COMPLETED' }`, **When** UI updates, **Then** QR and Deeplink button are hidden; Status Badge changes to "Đã thanh toán ✓" (background `#e3f1ec`, foreground `#008060`); message "Đơn hàng của bạn đã được xác nhận. Cảm ơn!" appears — all in-place, no page reload; polling stops

3. **Given** 3 consecutive polling failures (network error or HTTP 5xx), **When** 4th poll is due, **Then** interval backs off: 10s → 20s → 30s (cap)

4. **Given** 6+ consecutive failures, **When** count is reached, **Then** small toast "Đang kiểm tra kết nối..." appears — no alarming error, polling continues with backoff

5. **Given** HTTP 4xx from polling endpoint (401/403/404), **When** received, **Then** polling stops immediately — no retry for client errors

6. **Given** Extension component unmounts, **When** unmount occurs, **Then** `clearInterval` is called and any in-flight `fetch` is cancelled via `AbortController` — no memory leak

7. **Given** browser tab becomes hidden, **When** `visibilitychange` fires, **Then** polling pauses; resumes immediately when tab becomes visible again

8. **Given** Extension re-mounts after Shopify theme re-render, **When** `usePaymentStatus` initializes, **Then** it reads `sessionStorage` key `tng_payment_{orderId}` — if cached status is <30s old, rehydrates immediately (no flash of loading state)

9. **Given** Status Badge container, **When** status changes, **Then** container has `aria-live="polite"` so screen readers announce the update

## Tasks / Subtasks

- [x] Task 1: Thêm `fetchPaymentStatus()` vào `extensions/order-status-ui/src/api/client.ts` (AC: #1, #5)
  - [x] Export `PaymentStatusResponse` type: `{ status: PaymentStatus; paidAt?: string }`
  - [x] Export `fetchPaymentStatus(orderId: string, signal?: AbortSignal): Promise<PaymentStatusResponse>`
  - [x] Throw error với `.status` property khi response không ok (để hook phân biệt 4xx vs 5xx)
  - [x] Không dùng AbortController bên trong — nhận signal từ caller (hook tự quản lý lifecycle)

- [x] Task 2: Tạo `extensions/order-status-ui/src/hooks/usePaymentStatus.ts` (AC: #1-#9)
  - [x] Export `UsePaymentStatusResult` type: `{ status: PaymentStatus | null; paidAt?: string; showConnectionToast: boolean }`
  - [x] Signature: `usePaymentStatus(orderId: string | null, initialStatus: PaymentStatus | null): UsePaymentStatusResult`
  - [x] sessionStorage: đọc key `tng_payment_{orderId}` trong lazy initializer của useState — nếu `cachedAt` < 30s ago, dùng cached `status` và `paidAt`
  - [x] sessionStorage write: mỗi khi status thay đổi, ghi `{ status, paidAt, cachedAt: Date.now() }`
  - [x] Sync `initialStatus` → state: dùng `useEffect([initialStatus])` để set status khi `currentStatusRef.current === null` (tránh overwrite sessionStorage cache)
  - [x] Dùng `useRef` để track mutable state bên trong poll (tránh stale closure): `currentStatusRef`, `consecutiveFailuresRef`, `currentIntervalRef`, `isActiveRef`, `abortControllerRef`, `timerRef`
  - [x] Poll function (recursive setTimeout, KHÔNG setInterval):
    - [x] Kiểm tra `isActiveRef.current` trước khi fetch
    - [x] Tạo AbortController mới cho mỗi fetch, hủy controller cũ
    - [x] On success: reset `consecutiveFailuresRef = 0`, `currentIntervalRef = POLL_INTERVAL_MS`, `setShowConnectionToast(false)`, update `status` + `paidAt` state, write sessionStorage, schedule next poll nếu không phải terminal state
    - [x] On 4xx error: `return` ngay (không schedule next poll — dừng hẳn)
    - [x] On network/5xx error: tăng `consecutiveFailuresRef`, apply backoff sau failure thứ 3 (`[10000, 20000, 30000]`), show toast sau failure thứ 6, schedule next poll với interval mới
  - [x] Start polling: `useEffect` — gọi poll ngay lập tức (0ms) khi `orderId` không null và status không phải terminal, trả cleanup function
  - [x] `visibilitychange` handler: `useEffect` riêng — khi `document.hidden`, cancel timer + abort in-flight; khi tab visible lại, restart poll ngay
  - [x] Cleanup (unmount): set `isActiveRef.current = false`, clear timer, abort controller
  - [x] Không poll khi `orderId === null` hoặc status đã là terminal khi mount
  - [x] Terminal states: `new Set(["COMPLETED", "EXPIRED", "FAILED"])`

- [x] Task 3: Tạo `extensions/order-status-ui/src/components/StatusBadge.tsx` (AC: #2, #9)
  - [x] Props: `{ status: PaymentStatus; locale: string }`
  - [x] Render: `<div aria-live="polite" className="tng-status-badge-container"><span className={...}>...</span></div>`
  - [x] `COMPLETED`: class `tng-status-badge tng-status-badge--paid`, text `t("paid", locale)` = "Đã thanh toán ✓"
  - [x] `PENDING`: class `tng-status-badge tng-status-badge--pending`, text `t("pending", locale)` = "Chờ thanh toán"
  - [x] `EXPIRED`: class `tng-status-badge tng-status-badge--expired`, text `t("expired", locale)` = "Mã QR đã hết hạn"
  - [x] `FAILED`: class `tng-status-badge tng-status-badge--pending` (show pending style không alarming)

- [x] Task 4: Cập nhật `extensions/order-status-ui/src/utils/i18n.ts` (AC: #2, #4)
  - [x] Thêm key `paidConfirmMessage`: vi = `"Đơn hàng của bạn đã được xác nhận. Cảm ơn!"`, en = `"Your order has been confirmed. Thank you!"`
  - [x] Giữ nguyên key `checkingConnection`: "Đang kiểm tra kết nối..." (dùng cho toast AC#4)
  - [x] Không thay đổi keys hiện có — chỉ thêm `paidConfirmMessage` vào cả `vi` và `en` objects

- [x] Task 5: Cập nhật `extensions/order-status-ui/src/components/PaymentCard.tsx` (AC: #1-#9)
  - [x] Import `usePaymentStatus` từ `../hooks/usePaymentStatus`
  - [x] Import `StatusBadge` từ `./StatusBadge`
  - [x] Gọi `usePaymentStatus` sớm (trước conditional returns): `const { status: polledStatus, paidAt, showConnectionToast } = usePaymentStatus(orderId, loadState === "loaded" ? data?.status ?? null : null)`
  - [x] Derive `effectiveStatus`: khi `loadState === "loaded"`, dùng `polledStatus ?? data?.status`; khi loading/error, giữ nguyên behavior hiện tại
  - [x] Thay thế `data?.status === "COMPLETED"` checks → dùng `effectiveStatus === "COMPLETED"`
  - [x] Thay thế `data?.status === "EXPIRED"` checks → dùng `effectiveStatus === "EXPIRED"`
  - [x] Thay thế `data?.status === "FAILED"` checks → dùng `effectiveStatus === "FAILED"`
  - [x] PENDING render (khi `effectiveStatus === "PENDING"` hoặc `null`):
    - [x] Giữ nguyên `DeeplinkButton` + `QRDisplay` + amount display
    - [x] Thêm `<StatusBadge status="PENDING" locale={locale} />` thay thế `<p>{t("pending", locale)}</p>`
    - [x] Thêm toast: `{showConnectionToast && <p className="tng-connection-toast">{t("checkingConnection", locale)}</p>}`
  - [x] COMPLETED render: thay `<span className="tng-status-badge tng-status-badge--paid">` → dùng `<StatusBadge status="COMPLETED" locale={locale} />`, thêm `<p className="tng-paid-message">{t("paidConfirmMessage", locale)}</p>`, ẨN `QRDisplay` + `DeeplinkButton`
  - [x] Giữ nguyên EXPIRED + FAILED renders hiện tại (Story 2.6 sẽ enhance expired)

- [x] Task 6: Cập nhật `extensions/order-status-ui/src/components/PaymentCard.css` (AC: #2, #4, #9)
  - [x] `.tng-status-badge-container`: `/* aria-live wrapper — no visual styles */` (transparent container)
  - [x] `.tng-status-badge--pending`: `background: #fef3c7; color: #f59e0b; border-radius: 9999px; padding: 4px 12px; font-size: 12px; font-weight: 500; display: inline-block;`
  - [x] `.tng-paid-message`: `color: #008060; font-size: 14px; margin-top: 8px; text-align: center;`
  - [x] `.tng-connection-toast`: `color: #6b6b6b; font-size: 12px; margin-top: 8px; text-align: center;` (nhỏ, không alarming)
  - [x] `.tng-status-badge--paid` đã có từ Story 2.3 — không tạo lại; chỉ thêm các class còn thiếu

- [x] Task 7: Viết tests
  - [x] **`hooks/usePaymentStatus.test.ts`** (AC: #1-#9):
    - [x] `// @vitest-environment jsdom` header
    - [x] Mock `../api/client` với `fetchPaymentStatus: vi.fn()`
    - [x] Test: status PENDING → poll ngay lập tức (0ms) — dùng `vi.useFakeTimers()`, `vi.runAllTimers()`
    - [x] Test: COMPLETED response → status updates, polling stops
    - [x] Test: 3 failures → 4th interval = 10s (kiểm tra `currentIntervalRef` gián tiếp qua timing)
    - [x] Test: 6+ failures → `showConnectionToast = true`
    - [x] Test: HTTP 4xx (status=401) → polling stops ngay
    - [x] Test: unmount → `isActiveRef = false`, no more polls (mock verifies no calls after unmount)
    - [x] Test: `document.hidden = true` → visibilitychange → polling pauses; visible → resumes
    - [x] Test: sessionStorage cache < 30s → rehydrates status on init
    - [x] Test: sessionStorage cache > 30s → ignored, uses initialStatus
    - [x] Test: initialStatus = terminal state (COMPLETED) → polling never starts
    - [x] Cleanup: `vi.useRealTimers()` trong `afterEach`; `sessionStorage.clear()` trong `beforeEach`
  - [x] **`components/StatusBadge.test.tsx`** (AC: #2, #9):
    - [x] `// @vitest-environment jsdom`
    - [x] Test: COMPLETED → "Đã thanh toán ✓", class `tng-status-badge--paid`
    - [x] Test: PENDING → "Chờ thanh toán", class `tng-status-badge--pending`
    - [x] Test: `aria-live="polite"` trên container
    - [x] Test: locale "en" → English text
  - [x] **Cập nhật `PaymentCard.test.tsx`** (AC: #2, #4):
    - [x] Mock `usePaymentStatus`: `vi.mock('../hooks/usePaymentStatus', () => ({ usePaymentStatus: vi.fn(() => ({ status: null, paidAt: undefined, showConnectionToast: false })) }))`
    - [x] Mock `./StatusBadge`: `vi.mock('./StatusBadge', () => ({ StatusBadge: ({ status }: any) => <span data-testid="status-badge">{status}</span> }))`
    - [x] Test: khi `usePaymentStatus` trả `status: 'COMPLETED'` → "Đã thanh toán ✓" hiển thị, `paidConfirmMessage` hiển thị
    - [x] Test: khi `showConnectionToast: true` → "Đang kiểm tra kết nối..." hiển thị
    - [x] Giữ nguyên tất cả tests hiện có — chỉ thêm mocks mới cần thiết

## Dev Notes

### Trạng thái Hiện Tại sau Story 2.4

Files đã có — **KHÔNG ĐỘNG**:
```
extensions/order-status-ui/src/
├── index.tsx                           ← KHÔNG ĐỘNG
├── api/client.ts                       ← CẦN SỬA (thêm fetchPaymentStatus)
├── components/
│   ├── PaymentCard.tsx                 ← CẦN SỬA (integrate polling + StatusBadge)
│   ├── PaymentCard.css                 ← CẦN SỬA (thêm styles mới)
│   ├── PaymentCard.test.tsx            ← CẦN SỬA (thêm mocks + tests)
│   ├── QRDisplay.tsx                   ← KHÔNG ĐỘNG
│   ├── QRDisplay.test.tsx              ← KHÔNG ĐỘNG
│   ├── DeeplinkButton.tsx              ← KHÔNG ĐỘNG
│   └── DeeplinkButton.test.tsx         ← KHÔNG ĐỘNG
├── hooks/
│   ├── useMobileDetect.ts              ← KHÔNG ĐỘNG
│   └── useMobileDetect.test.ts         ← KHÔNG ĐỘNG
└── utils/
    ├── constants.ts                    ← KHÔNG ĐỘNG (đã có POLL_INTERVAL_MS=5000, POLL_MAX_INTERVAL_MS=30000)
    ├── formatters.ts                   ← KHÔNG ĐỘNG
    ├── i18n.ts                         ← CẦN SỬA (thêm paidConfirmMessage)
    ├── deeplink.ts                     ← KHÔNG ĐỘNG
    └── deeplink.test.ts                ← KHÔNG ĐỘNG
```

Files **TẠO MỚI**:
```
├── components/
│   ├── StatusBadge.tsx                 ← TẠO MỚI
│   └── StatusBadge.test.tsx            ← TẠO MỚI
└── hooks/
    ├── usePaymentStatus.ts             ← TẠO MỚI
    └── usePaymentStatus.test.ts        ← TẠO MỚI
```

**DO NOT CREATE** trong Story này:
- `CountdownTimer.tsx` — Story 2.6
- `useCountdown.ts` — Story 2.6

### PaymentCard.tsx — Trạng thái Hiện Tại

Hiện tại `PaymentCard.tsx` không có polling. Nó:
1. Gọi `fetchTingeeData()` một lần khi mount để lấy trạng thái ban đầu
2. Render dựa trên `data.status` tĩnh từ initial fetch
3. Có `COMPLETED`, `EXPIRED`, `FAILED`, `PENDING` renders

Story 2.5 thêm `usePaymentStatus` để poll `/payment-status` endpoint mỗi 5s và cập nhật UI real-time khi payment thành công.

**CÁCH GỌI `usePaymentStatus` — TRÁNH hooks order violation:**

```tsx
// Gọi TRƯỚC mọi conditional return (React hooks rule)
const { status: polledStatus, paidAt, showConnectionToast } = usePaymentStatus(
  orderId,
  loadState === "loaded" ? (data?.status ?? null) : null
);

// Derive effective status
const effectiveStatus = loadState === "loaded"
  ? (polledStatus ?? data?.status ?? null)
  : null;

// Sau đó dùng effectiveStatus cho render logic
```

### `fetchPaymentStatus` — Implementation trong `api/client.ts`

```typescript
export type PaymentStatusResponse = {
  status: PaymentStatus;
  paidAt?: string;
};

export async function fetchPaymentStatus(
  orderId: string,
  signal?: AbortSignal
): Promise<PaymentStatusResponse> {
  const url = `/api/orders/${encodeURIComponent(orderId)}/payment-status`;
  const response = await fetch(url, { signal });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `HTTP ${response.status}`, code: "REQUEST_FAILED" }));
    throw Object.assign(new Error(err.error ?? `HTTP ${response.status}`), {
      code: err.code ?? "REQUEST_FAILED",
      status: response.status, // QUAN TRỌNG: hook dùng .status để phân biệt 4xx vs 5xx
    });
  }

  return response.json();
}
```

### `usePaymentStatus` — Implementation Reference

```typescript
// extensions/order-status-ui/src/hooks/usePaymentStatus.ts
import { useState, useEffect, useRef, useCallback } from "react";
import type { PaymentStatus } from "../utils/constants";
import { POLL_INTERVAL_MS } from "../utils/constants";
import { fetchPaymentStatus } from "../api/client";

const BACKOFF_STEPS = [10000, 20000, 30000]; // ms, áp dụng sau failure thứ 3
const TOAST_FAILURE_THRESHOLD = 6;
const SESSION_CACHE_TTL_MS = 30_000; // 30s
const TERMINAL_STATES = new Set<PaymentStatus>(["COMPLETED", "EXPIRED", "FAILED"]);

type CachedStatus = { status: PaymentStatus; paidAt?: string; cachedAt: number };

function readCache(orderId: string): CachedStatus | null {
  try {
    const raw = sessionStorage.getItem(`tng_payment_${orderId}`);
    if (!raw) return null;
    const parsed: CachedStatus = JSON.parse(raw);
    return Date.now() - parsed.cachedAt < SESSION_CACHE_TTL_MS ? parsed : null;
  } catch { return null; }
}

function writeCache(orderId: string, status: PaymentStatus, paidAt?: string): void {
  try {
    sessionStorage.setItem(`tng_payment_${orderId}`, JSON.stringify({ status, paidAt, cachedAt: Date.now() }));
  } catch {}
}

export type UsePaymentStatusResult = {
  status: PaymentStatus | null;
  paidAt?: string;
  showConnectionToast: boolean;
};

export function usePaymentStatus(
  orderId: string | null,
  initialStatus: PaymentStatus | null
): UsePaymentStatusResult {
  // Lazy init từ sessionStorage (tránh flash sau theme re-render)
  const [status, setStatus] = useState<PaymentStatus | null>(() => {
    if (!orderId) return null;
    return readCache(orderId)?.status ?? null;
  });
  const [paidAt, setPaidAt] = useState<string | undefined>(() =>
    orderId ? readCache(orderId)?.paidAt : undefined
  );
  const [showConnectionToast, setShowConnectionToast] = useState(false);

  // Refs — tránh stale closure trong recursive poll
  const currentStatusRef = useRef<PaymentStatus | null>(status);
  const consecutiveFailuresRef = useRef(0);
  const currentIntervalRef = useRef(POLL_INTERVAL_MS);
  const isActiveRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);

  // Sync initialStatus khi data arrives từ fetchTingeeData
  useEffect(() => {
    if (initialStatus !== null && currentStatusRef.current === null) {
      setStatus(initialStatus);
      currentStatusRef.current = initialStatus;
    }
  }, [initialStatus]);

  // Sync ref với state
  useEffect(() => {
    currentStatusRef.current = status;
  }, [status]);

  const poll = useCallback(async () => {
    if (!isActiveRef.current || !orderId || pausedRef.current) return;
    if (currentStatusRef.current && TERMINAL_STATES.has(currentStatusRef.current)) return;

    // Abort previous in-flight fetch
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await fetchPaymentStatus(orderId, controller.signal);
      if (!isActiveRef.current || controller.signal.aborted) return;

      // Reset failure tracking
      consecutiveFailuresRef.current = 0;
      currentIntervalRef.current = POLL_INTERVAL_MS;
      setShowConnectionToast(false);

      // Update state
      const newStatus = result.status;
      setStatus(newStatus);
      currentStatusRef.current = newStatus;
      if (result.paidAt) { setPaidAt(result.paidAt); }
      if (orderId) writeCache(orderId, newStatus, result.paidAt);

      // Continue polling nếu chưa terminal
      if (!TERMINAL_STATES.has(newStatus) && isActiveRef.current) {
        timerRef.current = setTimeout(poll, currentIntervalRef.current);
      }
    } catch (err: unknown) {
      if (!isActiveRef.current || (err instanceof DOMException && err.name === "AbortError")) return;

      const httpStatus = (err as { status?: number })?.status;
      if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) {
        return; // HTTP 4xx: dừng hẳn
      }

      // Network/5xx: backoff
      consecutiveFailuresRef.current++;
      const failures = consecutiveFailuresRef.current;
      if (failures >= TOAST_FAILURE_THRESHOLD) setShowConnectionToast(true);
      if (failures >= 3) {
        const backoffIdx = Math.min(failures - 3, BACKOFF_STEPS.length - 1);
        currentIntervalRef.current = BACKOFF_STEPS[backoffIdx];
      }
      if (isActiveRef.current) {
        timerRef.current = setTimeout(poll, currentIntervalRef.current);
      }
    }
  }, [orderId]); // orderId stable; poll không capture state (dùng refs)

  // Start polling
  useEffect(() => {
    if (!orderId) return;
    isActiveRef.current = true;

    // Bắt đầu poll: nếu status hiện tại là terminal thì không poll
    const currentStatus = currentStatusRef.current;
    if (currentStatus && TERMINAL_STATES.has(currentStatus)) return;

    // 0ms initial delay (poll ngay lập tức)
    timerRef.current = setTimeout(poll, 0);

    return () => {
      isActiveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortControllerRef.current?.abort();
    };
  }, [orderId, poll]);

  // Pause/resume on visibilitychange
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        pausedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        abortControllerRef.current?.abort();
      } else {
        pausedRef.current = false;
        // Chỉ resume nếu vẫn active và status chưa terminal
        if (isActiveRef.current && currentStatusRef.current &&
            !TERMINAL_STATES.has(currentStatusRef.current)) {
          timerRef.current = setTimeout(poll, 0); // resume ngay
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [poll]);

  return { status, paidAt, showConnectionToast };
}
```

### Stale Closure Lưu Ý

`poll` function dùng `orderId` từ closure nhưng dùng refs cho mọi mutable state (status, failure count, interval). `orderId` ổn định trong lifecycle của Extension vì orderId không thay đổi. Chỉ `orderId` cần trong dependency array của `useCallback`.

### PaymentCard.tsx — PENDING render sau Story 2.5

```tsx
// Trong PaymentCard, sau khi data loaded, PENDING state:
return (
  <div data-tng-extension className={containerClass}>
    <div className="tng-payment-card">
      <p>{t("payWith", locale)}</p>
      <DeeplinkButton
        deeplinkUrl={data?.deeplinkUrl ?? null}
        amount={amount}
        locale={locale}
        isMobile={isMobile}
      />
      <QRDisplay
        qrImageUrl={data?.qrImageUrl}
        amount={amount}
        locale={locale}
        isMobile={isMobile}
      />
      <p className="tng-amount">{formatVndAmount(amount)}</p>
      <StatusBadge status="PENDING" locale={locale} />
      {showConnectionToast && (
        <p className="tng-connection-toast">{t("checkingConnection", locale)}</p>
      )}
    </div>
  </div>
);
```

### PaymentCard.tsx — COMPLETED render sau Story 2.5

```tsx
// COMPLETED state — QR + Deeplink ẩn, hiện confirmation message
if (effectiveStatus === "COMPLETED") {
  return (
    <div data-tng-extension className={containerClass}>
      <div className="tng-payment-card">
        <StatusBadge status="COMPLETED" locale={locale} />
        <p className="tng-paid-message">{t("paidConfirmMessage", locale)}</p>
      </div>
    </div>
  );
}
```

### `.tng-status-badge--paid` — Đã có từ Story 2.3

Kiểm tra `PaymentCard.css` trước khi thêm — style này đã tồn tại:
```css
.tng-status-badge--paid {
  background: #e3f1ec;
  color: #008060;
  ...
}
```

Chỉ thêm `.tng-status-badge--pending` và `.tng-status-badge-container` (nếu chưa có).

### Testing — Patterns từ Story 2.4

1. **Fake timers**: `vi.useFakeTimers()` + `await vi.runAllTimersAsync()` để advance setTimeout
2. **AbortController mock**: jsdom hỗ trợ sẵn AbortController, không cần mock
3. **sessionStorage**: jsdom hỗ trợ sẵn, clear trong `beforeEach(() => sessionStorage.clear())`
4. **visibilitychange**: `Object.defineProperty(document, 'hidden', { writable: true, value: true })` + `document.dispatchEvent(new Event('visibilitychange'))`
5. **fetchPaymentStatus mock**: `vi.mock('../api/client', () => ({ fetchPaymentStatus: vi.fn(), fetchTingeeData: vi.fn() }))`
6. **Vitest v4 ESM**: Dùng `vi.fn(function() {...})` cho constructors, không phải arrow function
7. **Testing Library act()**: Wrap state-changing operations trong `act()` khi dùng `renderHook`

### Backend Endpoint — Đã có, Không Sửa

`app/routes/api.orders.$orderId.payment-status.tsx` đã implement đầy đủ:
- Auth: `authenticate.public.checkout()`
- Rate limiting: `pollingRateLimiter`
- Expiry detection: tự động update `EXPIRED` khi `expiresAt < new Date()`
- Returns: `{ status: 'PENDING'|'COMPLETED'|'FAILED'|'EXPIRED', paidAt? }`

**KHÔNG SỬA file này.** `fetchPaymentStatus()` trong `client.ts` consume endpoint này.

### Auth Boundary — Không Thay Đổi

Extension gọi `/api/orders/*` qua `fetchPaymentStatus()`. Authentication xảy ra hoàn toàn ở backend (`authenticate.public.checkout()`). Extension không biết về auth mechanism.

### UX Design Tokens — StatusBadge

```
Paid Badge:    background #e3f1ec; color #008060; border-radius 9999px; padding 4px 12px; font 12px/500
Pending Badge: background #fef3c7; color #f59e0b; border-radius 9999px; padding 4px 12px; font 12px/500
Expired Badge: background #f5f5f5; color #6b6b6b; border-radius 9999px; padding 4px 12px; font 12px/500
Paid Message:  color #008060; font 14px; margin-top 8px; text-align center
Toast:         color #6b6b6b; font 12px; margin-top 8px; text-align center (nhỏ, không alarming)
```

### References

- [Source: epics.md#Story 2.5] — Acceptance criteria đầy đủ
- [Source: epics.md#Epic 2 Overview] — sessionStorage `tng_payment_{orderId}` 30s TTL, Two-endpoint API pattern
- [Source: architecture.md#Order Status Extension State Machine] — PENDING → COMPLETED/EXPIRED/FAILED
- [Source: architecture.md#Smart Polling Backoff] — 5s → 5s → 5s → 10s → 20s → 30s cap, toast at 6+ failures
- [Source: architecture.md#Payment State Persistence] — sessionStorage pattern, 30s window
- [Source: architecture.md#Polling lifecycle] — AbortController, visibilitychange, clearInterval on unmount
- [Source: api.orders.$orderId.payment-status.tsx] — Backend endpoint đã implement đầy đủ
- [Source: story 2.4 Dev Notes#Testing — Known Patterns] — jsdom patterns, fake timers, Vitest ESM mock pattern
- [Source: constants.ts] — POLL_INTERVAL_MS=5000, POLL_MAX_INTERVAL_MS=30000
- [Source: i18n.ts] — checkingConnection đã có, cần thêm paidConfirmMessage
- [Source: UX-DR11] — Status Badge colors: paid #e3f1ec/#008060, pending #fef3c7/#f59e0b
- [Source: NFR-10] — Polling 5s, backoff 10s/20s/30s, stop at terminal, 6 failures → toast

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- Test "polls immediately": dùng `vi.advanceTimersByTimeAsync(1)` thay vì `vi.runAllTimersAsync()` để tránh infinite loop với recursive setTimeout.
- Test "ignores stale cache": assertion ban đầu kiểm tra `null` sai vì `useEffect([initialStatus])` chạy sync sau render và set status thành "PENDING".

### Completion Notes List
- ✅ `fetchPaymentStatus()` thêm vào `client.ts` với pattern giống `fetchTingeeData` — throw error có `.status` để hook phân biệt 4xx vs 5xx
- ✅ `usePaymentStatus` hook: recursive setTimeout (không dùng setInterval), 6 refs tránh stale closure, backoff [10s/20s/30s] sau 3 failures liên tiếp, toast sau 6+ failures, visibilitychange pause/resume, sessionStorage 30s TTL cache
- ✅ `StatusBadge` component: FAILED render dùng pending style (không alarming per spec), `aria-live="polite"` wrapper
- ✅ `paidConfirmMessage` thêm vào cả `vi` và `en` trong i18n.ts
- ✅ `PaymentCard` cập nhật: hooks trước conditional returns (tránh React hooks order violation), `effectiveStatus` derived từ polling override
- ✅ 63/63 extension tests pass, 4 pre-existing failures trong `app.settings.test.ts` không liên quan

### File List

**Tạo mới:**
- `extensions/order-status-ui/src/hooks/usePaymentStatus.ts`
- `extensions/order-status-ui/src/hooks/usePaymentStatus.test.ts`
- `extensions/order-status-ui/src/components/StatusBadge.tsx`
- `extensions/order-status-ui/src/components/StatusBadge.test.tsx`

**Cập nhật:**
- `extensions/order-status-ui/src/api/client.ts`
- `extensions/order-status-ui/src/components/PaymentCard.tsx`
- `extensions/order-status-ui/src/components/PaymentCard.css`
- `extensions/order-status-ui/src/components/PaymentCard.test.tsx`
- `extensions/order-status-ui/src/utils/i18n.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/2-5-real-time-polling-status-updates-and-offline-resilience.md`

## Change Log

- Story 2.5 implementation hoàn thành (2026-06-26): real-time polling hook, StatusBadge component, sessionStorage cache, backoff/toast resilience, visibilitychange pause/resume, AbortController cleanup

### Review Findings

- [x] [Review][Decision] AC8 gap — cached polledStatus ignored during loadState="loading" phase: `effectiveStatus` gates on `loadState === "loaded"`, so a sessionStorage-cached COMPLETED status from `usePaymentStatus` is invisible until `fetchTingeeData` completes — causing a flash of loading state on re-mount despite AC8 requiring "no flash". Options: (a) propagate polledStatus into effectiveStatus regardless of loadState, (b) short-circuit the fetchTingeeData loading phase when cache hit exists, (c) accept partial AC8 compliance.
- [x] [Review][Decision] 4xx stop leaves stale PENDING in sessionStorage → re-poll on next page load: When polling stops on 401/403, the cache entry still holds `PENDING`. On the next page mount, `readCache` returns `PENDING`, bypasses the terminal-state guard, and starts polling again even though the backend session is invalid. Options: (a) clear sessionStorage on 4xx stop, (b) write a special sentinel value on 4xx stop, (c) accept this behavior (next poll will get same 4xx and stop again).
- [x] [Review][Patch] HTTP 429 treated as permanent 4xx stop — polling terminates on rate-limit instead of backing off [`usePaymentStatus.ts` catch block: `httpStatus >= 400 && httpStatus < 500`] — 429 should route to the backoff path not the hard-stop return
- [x] [Review][Patch] Terminal status re-polled after 30s sessionStorage TTL expiry — COMPLETED/EXPIRED/FAILED orders re-start polling on re-mount when cache entry is >30s old, causing a brief flash to null/PENDING before poll confirms terminal state [`usePaymentStatus.ts:readCache`, `SESSION_CACHE_TTL_MS = 30_000`]
- [x] [Review][Defer] No maximum retry count or wall-clock timeout for permanently PENDING orders [`usePaymentStatus.ts`] — deferred, design decision not spec'd
- [x] [Review][Defer] `readCache` called twice during hook init (duplicate sessionStorage read + JSON.parse for status and paidAt) [`usePaymentStatus.ts:43,47`] — deferred, minor perf, pre-existing pattern
- [x] [Review][Defer] `writeCache` silently swallows errors — sessionStorage failures unobservable [`usePaymentStatus.ts:27`] — deferred, pre-existing pattern
- [x] [Review][Defer] Backoff test timing assertions hardcode interval values instead of importing constants [`usePaymentStatus.test.ts`] — deferred, test fragility
- [x] [Review][Defer] `aria-live="polite"` applied to all StatusBadge instances including static terminal states — screen readers announce static badges on load [`StatusBadge.tsx`] — deferred, Story 2.6 scope
- [x] [Review][Defer] URL encoding inconsistency — `fetchPaymentStatus` uses `encodeURIComponent(orderId)` but `fetchTingeeData` URL construction not shown in diff [`client.ts`] — deferred, needs investigation
- [x] [Review][Defer] Shopify `gid://shopify/Order/...` orderId format written raw to sessionStorage key — potential key collision with encoded variants [`usePaymentStatus.ts:readCache`] — deferred, needs orderId format investigation
- [x] [Review][Defer] `financialStatus === "PAID"` bypass may flicker if Shopify and Tingee disagree — shows COMPLETED badge then switches to QR when loadState resolves [`PaymentCard.tsx`] — deferred, pre-existing behavior from 2.4
- [x] [Review][Defer] `consecutiveFailuresRef` not reset on visibility-hide/show cycle — toast fires sooner after tab restore if failures were already accumulating [`usePaymentStatus.ts:handleVisibility`] — deferred, minor UX edge case
- [x] [Review][Defer] `fetchPaymentStatus` calls `response.json()` on potentially empty 2xx body — SyntaxError would trigger network error path [`client.ts`] — deferred, backend always returns JSON per spec
- [x] [Review][Defer] `SESSION_CACHE_TTL_MS = 30s` may be too short — completed orders could re-fetch from server after 30s unnecessarily [`usePaymentStatus.ts`] — deferred, design consideration
