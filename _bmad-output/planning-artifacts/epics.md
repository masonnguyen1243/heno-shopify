---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - planning-artifacts/prds/prd-Tingee-Shopify-App-2026-06-22/prd.md
  - planning-artifacts/architecture.md
  - planning-artifacts/ux-designs/ux-Tingee-Shopify-App-2026-06-22/DESIGN.md
  - planning-artifacts/ux-designs/ux-Tingee-Shopify-App-2026-06-22/EXPERIENCE.md
---

# Tingee-Shopify-App - Epic Breakdown

## Overview

Tài liệu này phân rã toàn bộ yêu cầu từ PRD, UX Design, và Architecture thành các epics và stories có thể implement được.

## Requirements Inventory

### Functional Requirements

FR-1: Merchant có thể cài đặt App từ Shopify App Store thông qua OAuth standard flow. App request đúng scopes: `write_orders`, `read_orders`, `write_payment_gateways`, `read_payment_gateways`. Sau OAuth, Merchant được redirect đến Admin Surface. Access token được lưu bảo mật.

FR-2: Khi Merchant gỡ cài đặt app, hệ thống xóa sạch Credential và hủy đăng ký Manual Payment Method. Dữ liệu xóa trong 48 giờ (Shopify GDPR requirement).

FR-3: Merchant có thể nhập Client ID và Secret Token, kiểm tra kết nối với Tingee API, và lưu Credential. Form có toggle reveal cho Secret Token. Nếu valid: lưu mã hóa + badge "Kết nối thành công". Nếu invalid: badge "Kết nối thất bại" + thông báo lỗi cụ thể.

FR-4: Sau khi Credential hợp lệ được lưu lần đầu, hệ thống tự động đăng ký Manual Payment Method "Thanh toán qua Tingee QR" trên Shopify. Merchant không cần thao tác thêm.

FR-5: Merchant có thể cập nhật Credential (rotate Secret Token) hoặc xóa Credential. Khi xóa, Manual Payment Method bị hủy đăng ký.

FR-6: Order Status Extension hiển thị block thanh toán (Static QR + số tiền + mã đơn hàng + nội dung chuyển khoản) khi và chỉ khi đơn hàng dùng phương thức "Thanh toán qua Tingee QR" và chưa ở trạng thái Paid.

FR-7: Nút "Mở app ngân hàng" (Deeplink) chỉ render trên thiết bị mobile (viewport < 768px). Trên desktop chỉ hiển thị QR.

FR-8: Backend tạo Static QR theo chuẩn VietQR từ thông tin tài khoản Tingee, điền sẵn số tiền đơn hàng. Nội dung chuyển khoản: `TINGEE {order_number}`. QR tối thiểu 200×200px.

FR-9: Backend tạo Deeplink qua Tingee API `/v1/deep-link/generate`. Nếu API trả lỗi: ẩn Deeplink button, vẫn hiển thị QR.

FR-10: Order Status Extension polling trạng thái đơn hàng mỗi 5 giây, cập nhật UI khi thanh toán thành công. Dừng polling khi đơn Paid hoặc QR hết hạn (15 phút).

FR-10b: QR hết hạn sau 15 phút. Countdown timer hiển thị trong suốt thời gian chờ. Khi hết hạn: hiển thị trạng thái expired + nút "Quay lại cửa hàng". Không có nút "Tạo lại QR" — phải đặt đơn mới.

FR-11: Backend xác thực HMAC-SHA512 của mọi Webhook từ Tingee trước khi xử lý. Webhook không hợp lệ → HTTP 400 + log cảnh báo. Webhook hợp lệ → HTTP 200 trong 5 giây.

FR-12: Khi nhận Webhook hợp lệ, so khớp số tiền giao dịch với số tiền đơn hàng (exact match, integer VND). Khớp: cập nhật Shopify sang Paid. Không khớp: giữ trạng thái pending + thêm Order Note với đầy đủ thông tin (số tiền thực, số tiền đơn, thời gian, mã giao dịch Tingee).

FR-13: Nếu Shopify Order API call thất bại sau khi đối soát thành công, hệ thống retry với exponential backoff: 429/5xx → 3 lần (1s/3s/10s). 4xx khác: không retry, mark FAILED. Sau 3 lần thất bại: ghi log đầy đủ, giữ thông tin webhook.

FR-14: Sau khi Exact Amount Match thành công, gọi Shopify Order API để cập nhật đơn hàng sang Paid (transaction type phù hợp với Manual Payment Method). Shopify trigger email xác nhận cho người mua.

### Non-Functional Requirements

NFR-1: Secret Token được lưu mã hóa AES-256 tại backend. Không bao giờ log, không bao giờ trả về client. `sanitizeForLog()` bắt buộc trước mọi log call.

NFR-2: Mọi Webhook từ Tingee được xác thực HMAC-SHA512 trước khi xử lý. Header `x-signature` = HMAC_SHA512(timestamp + ":" + body, secretToken). Replay attack: reject payload có timestamp cũ hơn 5 phút.

NFR-3: Rate limit trên `/webhook/tingee` endpoint: 100 req/15 phút per IP.

NFR-4: Tuân thủ Shopify App Security Requirements: HTTPS only, CSP headers.

NFR-5: Webhook handler phải trả response trong 5 giây (Tingee IPN hard timeout). Tingee timeout SDK: `TINGEE_SDK_TIMEOUT_MS` = 4000ms.

NFR-6: Retry mechanism đảm bảo không mất giao dịch đã được Tingee xác nhận. Idempotency qua bảng `processed_webhooks` với unique constraint trên `transactionCode`.

NFR-7: Order Status Extension tiếp tục hoạt động khi Tingee API chậm — QR và Deeplink được tạo một lần tại thời điểm đặt hàng, không re-fetch khi render.

NFR-8: Admin Surface load < 2 giây trên kết nối 4G.

NFR-9: Order Status Extension không làm chậm trang Order Status > 500ms (render non-blocking).

NFR-10: Polling interval 5 giây. Backoff sau 3 consecutive failures: 10s → 20s → 30s (cap). Dừng polling tại terminal state (COMPLETED/EXPIRED/FAILED) hoặc HTTP 4xx.

NFR-11: App phải pass Shopify App Review trước khi list công khai. Privacy Policy route bắt buộc.

NFR-12: Sử dụng Shopify API version ≥ 2025-07. Pin exact version trong config.

NFR-13: GDPR webhooks phải được xử lý: `customers/data_request`, `customers/redact`, `shop/redact`.

NFR-14: Multi-tenancy: mọi DB query bắt buộc có `WHERE shop_domain = ?`. `requireShopSession()` phải được gọi đầu tiên trong mọi loader/action.

NFR-15: Mọi call đến Tingee API phải idempotent. Tracking state phía app trước khi call.

### Additional Requirements (Architecture)

- **Starter Template**: Shopify CLI — React Router 7. Lệnh khởi tạo: `npm create @shopify/app@latest` → "Build a React Router app". Thêm extension: `shopify app generate extension --type checkout_ui_extension`. Đây là Story đầu tiên bắt buộc.
- **Post-scaffold checklist bắt buộc (6 items)**: (1) Migrate Prisma SQLite → PostgreSQL, (2) env validation với Zod, (3) PostgreSQL connection pool config (5 connections/instance), (4) Generate Order Status Extension, (5) Pin `@tingee/sdk-node` exact version, (6) Audit shopify.app.toml scopes
- **Database Schema**: 4 Prisma models — `Merchant`, `MerchantCredential` (tách riêng để support key rotation), `Payment`, `ProcessedWebhook`
- **AES-256 Key Management**: Single master key (`ENCRYPTION_KEY` env var), keyVersion scheme trong JSON column để support rotation về sau
- **Idempotency table** (`processed_webhooks`): Phải có trước khi implement webhook handler. Key: `tingee:{transactionCode}`. Status-based pattern (không dùng `$transaction()` vì giữ DB lock)
- **Synchronous webhook processing** (không queue Phase 1): Validate HMAC → INSERT idempotency PENDING → Shopify API → UPDATE status → return 200/202
- **Two-endpoint API pattern**: `GET /api/orders/:orderId/tingee-data` (load lần đầu) + `GET /api/orders/:orderId/payment-status` (polling mỗi 5s)
- **Auth boundaries**: Admin routes dùng `authenticate.admin()`, Extension API dùng `authenticate.public.checkout()` — không được nhầm lẫn
- **Payment state machine**: PENDING → PROCESSING → SUCCESS/FAILED, EXPIRED (terminal states)
- **Deployment**: Fly.io, Fly Postgres cùng region
- **CI/CD**: GitHub Actions — test (vitest + pact verify + lint) → deploy (flyctl deploy)
- **Monitoring**: Sentry (error tracking) + Fly.io built-in logs. Metrics từ Day 1: `tingee.api.response_time`, `webhook.processing_time`, `webhook.retry_count`
- **Testing stack**: vitest + @vitest/coverage-v8, @testing-library/react, msw v2, @testcontainers/postgresql, @pact-foundation/pact
- **Contract testing** (Pact): Pin Tingee webhook payload schema. Chạy `pact verify` trước mỗi merge.
- **Privacy Policy route** (`app/privacy.tsx`): Bắt buộc để pass App Store review
- **Deeplink timeout**: iOS 3500ms vs Android 2000ms, sau timeout → show QR fallback
- **sessionStorage persistence**: `usePaymentStatus` rehydrate state từ sessionStorage, 30s window để survive theme re-render

### UX Design Requirements

UX-DR1: Implement design token hệ màu sắc: brand `#e12a41`, brand-hover `#c4223a`, brand-active `#a81b30`, brand-subtle `#fdeaec`, success `#008060` (success-subtle `#e3f1ec`), pending `#f59e0b` (pending-subtle `#fef3c7`), muted-text `#6b6b6b`.

UX-DR2: Typography scale — Inter cho toàn bộ: base (14px/400/1.5), label (12px/500/1.4/0.02em), heading (18px/600/1.3), display (24px/700/1.2). JetBrains Mono 13px chỉ dùng cho countdown timer.

UX-DR3: Spacing scale 4-based: xs(4px), sm(8px), md(16px), lg(24px), xl(32px), xxl(48px).

UX-DR4: Border-radius scale: sm(4px) cho inner elements, md(8px) cho cards/buttons, lg(12px) cho Payment Card, full(9999px) cho status badges.

UX-DR5: Admin surface Polaris-only — chỉ override brand-layer: primary button màu `#e12a41` (hover `#c4223a`), connection badge colors theo DESIGN.md. Không override Polaris component shapes.

UX-DR6: Admin layout: Polaris Page ("Cài đặt Tingee Payment") + 2 Polaris Cards (Card 1: Credential form; Card 2: Connection status). Polaris Banner cho thông báo (success auto-dismiss 5s). Polaris Spinner khi verify.

UX-DR7: Buyer Payment Card component: white background, 1px border (#e0e0e0), 12px radius, 24px padding, box-shadow `0 1px 3px rgba(0,0,0,0.08)`.

UX-DR8: QR Container: luôn white background dù theme tối hay sáng, 200×200px minimum, không scale xuống dưới 160px trên mobile. Border 1px, radius 8px, padding 8px.

UX-DR9: Amount Display: 24px font-size, 700 weight, brand red `#e12a41`. Format Việt: "1.500.000 đ" (dùng đ, không VND).

UX-DR10: Countdown Timer: JetBrains Mono 13px, muted-text color `#6b6b6b`, format "mm:ss", `aria-live="off"` (không announce mỗi giây).

UX-DR11: Status Badge variants — Paid: background `#e3f1ec`, foreground `#008060`. Pending: background `#fef3c7`, foreground `#f59e0b`. Radius: full.

UX-DR12: Deeplink Button: brand red `#e12a41`, white text, 8px radius, minimum touch target 44×44px. Label: "Mở app ngân hàng". `aria-label`: "Mở app ngân hàng để thanh toán [amount] đồng".

UX-DR13: CSS isolation cho Buyer surface: BEM prefix `tng-`, scope selector `[data-tng-extension]`, explicit property resets (không dùng `all: revert` — không support Chromium < 84). `!important` chỉ dùng trong explicit resets.

UX-DR14: Accessibility: QR Image alt text "Mã QR thanh toán [amount] đồng qua Tingee", aria-live="polite" trên status badge container, minimum 12px font size mọi nơi.

UX-DR15: Loading skeleton state: QR area 200×200 gray box + amount skeleton bar. Resolve trong < 2 giây.

UX-DR16: QR tap-to-zoom lightbox trên mobile (hữu ích khi camera khó scan).

UX-DR17: Mobile detection: 2/3 signal voting — touch media query + screen width < 768px + User-Agent. Handles Cốc Cốc/UC Browser, iPad Pro, Samsung DeX.

UX-DR18: Locale detection: Shopify `shop.primary_locale`. Mặc định tiếng Việt, fallback tiếng Anh nếu không phải `vi`.

UX-DR19: Offline resilience (Buyer): QR vẫn hiển thị sau khi đã load. Polling fail silently (không báo lỗi mỗi 5s). Sau 6 consecutive failures: hiển thị toast nhỏ "Đang kiểm tra kết nối...". Resume polling khi có lại kết nối.

UX-DR20: Buyer state — Error (webhook timeout 30 phút): "Chưa nhận được xác nhận thanh toán. Nếu bạn đã thanh toán, đơn hàng sẽ được xác nhận trong vài phút." + Contact support link.

### FR Coverage Map

FR-1: Epic 1 — Shopify OAuth install, scopes, admin redirect
FR-2: Epic 1 — Uninstall cleanup + GDPR data deletion 48h
FR-3: Epic 1 — Credential form, AES-256 storage, verify với Tingee API
FR-4: Epic 1 — Auto-register Manual Payment Method "Thanh toán qua Tingee QR"
FR-5: Epic 1 — Update/delete Credential, unregister payment method
FR-6: Epic 2 — Order Status Extension hiển thị block thanh toán
FR-7: Epic 2 — Deeplink button mobile-only (< 768px)
FR-8: Epic 2 — Static QR VietQR generation (200×200px, `TINGEE {order_number}`)
FR-9: Epic 2 — Deeplink tạo qua Tingee API `/v1/deep-link/generate`
FR-10: Epic 2 — Polling 5s real-time, cập nhật UI khi Paid
FR-10b: Epic 2 — QR expiry 15 phút, countdown timer, expired state + "Quay lại cửa hàng"
FR-11: Epic 3 — HMAC-SHA512 validation, replay attack prevention (5 phút)
FR-12: Epic 3 — Exact Amount Match, Order Note khi mismatch
FR-13: Epic 3 — Retry 3 lần backoff 1s/3s/10s, status-based idempotency
FR-14: Epic 3 — Mark Shopify order Paid, email xác nhận tự động

## Epic List

### Epic 1: Merchant Onboarding & App Foundation

Merchant có thể cài đặt app từ Shopify App Store, cấu hình Credential Tingee, và phương thức thanh toán "Thanh toán qua Tingee QR" tự động xuất hiện tại checkout — trong vòng 5 phút.

**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5

**Ghi chú:** Bao gồm post-scaffold setup (React Router 7 + PostgreSQL), DB schema đầy đủ cho cả 3 epic (Merchant, MerchantCredential, Payment, ProcessedWebhook), GDPR webhooks, Privacy Policy page, CI/CD pipeline. DB schema phải complete ở story cuối Epic 1 — tránh migration drift ở Epic 2 và 3.

---

### Epic 2: Buyer Payment Experience

Người mua thấy QR và Deeplink trên trang Order Status sau khi đặt hàng với phương thức Tingee, countdown 15 phút, và UI tự cập nhật real-time khi thanh toán thành công — không cần reload trang.

**FRs covered:** FR-6, FR-7, FR-8, FR-9, FR-10, FR-10b

**Ghi chú:** Bao gồm two-endpoint API (`GET /api/orders/:orderId/tingee-data` + `GET /api/orders/:orderId/payment-status`), Order Status Extension, payment state machine (buyer-side), UX design tokens, CSS isolation, mobile detection 2/3-signal voting, sessionStorage persistence, Pact consumer test cho `payment-status` endpoint (bắt buộc trước khi Epic 3 merge). Story đầu tiên: define full interface `tingee.server.ts` (stub cả methods Epic 3 dùng).

---

---

## Epic 1: Merchant Onboarding & App Foundation

Merchant có thể cài đặt app từ Shopify App Store, cấu hình Credential Tingee, và phương thức thanh toán "Thanh toán qua Tingee QR" tự động xuất hiện tại checkout — trong vòng 5 phút.

### Story 1.1: App Scaffold, Database Schema & CI/CD Foundation

As a developer,
I want to scaffold the Shopify app with the official React Router 7 template, configure PostgreSQL with a complete database schema, and set up CI/CD,
So that the team has a working deployment pipeline and full schema from day one — no schema migrations needed in later epics.

**Acceptance Criteria:**

**Given** Shopify CLI is installed,
**When** `npm create @shopify/app@latest` is run selecting "Build a React Router app",
**Then** a React Router 7 Shopify app is scaffolded with `shopify.app.toml`, `prisma/schema.prisma` (SQLite default), and `app/shopify.server.ts`

**Given** the scaffold is complete,
**When** Prisma datasource is changed to PostgreSQL and `DATABASE_URL` is set,
**Then** `npx prisma migrate dev --name init_postgres` succeeds and creates all 4 models: `Merchant`, `MerchantCredential`, `Payment`, `ProcessedWebhook` — with all fields per architecture doc (cuid IDs, snake_case @@map, keyVersion on MerchantCredential, status on Payment, unique idempotencyKey on ProcessedWebhook)

**Given** `app/lib/env.server.ts` is created with Zod schema,
**When** the app starts with a missing required env var (e.g., no `ENCRYPTION_KEY`),
**Then** the process exits immediately with a descriptive error message (fail-fast)

**Given** `shopify app generate extension --type checkout_ui_extension` is run,
**When** complete,
**Then** `extensions/order-status-ui/` scaffold exists and is linked in `shopify.app.toml`

**Given** `package.json` after installing `@tingee/sdk-node`,
**When** checked,
**Then** the version is pinned exactly (no `^` or `~` prefix)

**Given** `shopify.app.toml` scopes,
**When** audited,
**Then** only `read_orders, write_orders, read_payment_gateways, write_payment_gateways` are present — no extra scopes

**Given** `app/privacy.tsx` is created,
**When** accessed at `/privacy`,
**Then** a Privacy Policy page renders (required for Shopify App Store review)

**Given** `.github/workflows/ci.yml` is created,
**When** code is pushed to main,
**Then** the pipeline runs vitest + lint (all pass) then deploys to Fly.io via `flyctl deploy --remote-only`

**Given** `fly.toml` release command,
**When** deploy runs,
**Then** `npx prisma migrate deploy` executes once per deploy (not per machine) before app starts

**Given** Fly Postgres connection config,
**When** `DATABASE_URL` is set,
**Then** connection_limit=5 per instance is enforced (`?connection_limit=5&pool_timeout=20`)

---

### Story 1.2: Shopify OAuth App Installation

As a merchant,
I want to install Tingee Payment App from Shopify App Store via OAuth,
So that the app gains secure access to my store and I am redirected to the admin settings.

**Acceptance Criteria:**

**Given** a merchant clicks "Install" on the Tingee app,
**When** Shopify initiates OAuth,
**Then** the app requests exactly these scopes: `write_orders`, `read_orders`, `write_payment_gateways`, `read_payment_gateways`

**Given** OAuth completes successfully,
**When** the Shopify access token is received,
**Then** it is stored securely server-side, never logged, never returned to client, and a `Merchant` record is upserted with `shopDomain` and `installedAt`

**Given** OAuth completes,
**When** the merchant is redirected,
**Then** they land at Admin Surface (`/app/settings`)

**Given** a merchant who previously installed re-installs,
**When** OAuth completes again,
**Then** the existing `Merchant` record is updated (not duplicated) and `uninstalledAt` is cleared

**Given** `requireShopSession()` is called in any admin loader or action,
**When** the session is missing or invalid,
**Then** the user is redirected to `/auth` — never a 500 error

---

### Story 1.3: Admin Settings UI — Credential Form

As a merchant,
I want to see a settings page with a form to enter my Tingee Client ID and Secret Token,
So that I can configure my Tingee connection without leaving Shopify Admin.

**Acceptance Criteria:**

**Given** the merchant navigates to admin settings after fresh install,
**When** the page loads,
**Then** a Polaris Page titled "Cài đặt Tingee Payment" renders with Card 1 (Credential form) and Card 2 (Connection Status)

**Given** fresh install (no saved credentials),
**When** the Credential form renders,
**Then** Client ID field is empty, Secret Token field is empty, "Lưu cài đặt" button is disabled, and a Banner shows "Nhập Client ID và Secret Token từ portal Tingee để bắt đầu"

**Given** the merchant types in both fields,
**When** both are non-empty,
**Then** the "Lưu cài đặt" button becomes enabled

**Given** the Secret Token field,
**When** displayed,
**Then** it renders as `type="password"` (masked by default) with a toggle-reveal icon

**Given** credentials were previously saved,
**When** the merchant returns to settings,
**Then** Secret Token field shows a masked placeholder — the actual token is NEVER returned from the API to the frontend

**Given** the Connection Status Card with no saved credential,
**When** rendered,
**Then** a Polaris Badge shows "Chưa kết nối" (critical style)

**Given** any form field with an error state,
**When** error is displayed,
**Then** the error message is linked via `aria-describedby`, label is always visible (never placeholder-as-label), and minimum 12px font size is maintained

---

### Story 1.4: Credential Validation, Encryption & Payment Method Registration

As a merchant,
I want my credentials to be validated with Tingee and saved securely, with the payment method automatically appearing at checkout,
So that setup is complete in one action — no manual Shopify configuration needed.

**Acceptance Criteria:**

**Given** a merchant enters valid Client ID + Secret Token and clicks "Lưu cài đặt",
**When** Tingee API confirms the credentials are valid,
**Then** credentials are saved AES-256 encrypted (`{version:1, iv, tag, data}` JSON) in `MerchantCredential`, badge shows "Đã kết nối" (success/green), and a success Banner auto-dismisses after 5 seconds

**Given** credentials are saved to the database,
**When** the raw DB value of `encryptedSecretToken` is read (Testcontainers integration test),
**Then** it is ciphertext — never plaintext

**Given** valid credentials saved for the first time,
**When** payment method registration is triggered,
**Then** a Shopify Manual Payment Method named "Thanh toán qua Tingee QR" is registered via Shopify GraphQL Admin API (version ≥ 2025-07), and the merchant does NOT need any manual action in Shopify Admin

**Given** invalid credentials are submitted,
**When** Tingee API returns an auth error,
**Then** a critical Banner shows "Client ID hoặc Secret Token không đúng. Kiểm tra lại trong portal Tingee." — credentials are NOT saved, badge stays "Chưa kết nối"

**Given** a network timeout when verifying (>4000ms per `TINGEE_SDK_TIMEOUT_MS`),
**When** the timeout occurs,
**Then** a critical Banner shows "Không thể kết nối đến Tingee. Kiểm tra kết nối mạng và thử lại." — no credentials saved

**Given** the "Lưu cài đặt" button is clicked,
**When** the API call is in progress,
**Then** button shows loading state, fields are disabled, and Polaris Spinner appears in Card 2

**Given** any log call during credential processing,
**When** logs are inspected,
**Then** `secretToken` and `accessToken` values appear as `[REDACTED]` via `sanitizeForLog()` — never plaintext in logs

**Given** IDOR security test — merchant A's session attempts to save credentials for merchant B's shop_domain,
**When** the request is made,
**Then** it returns 403 — `requireShopSession()` blocks cross-tenant writes

---

### Story 1.5: Credential Update & Deletion

As a merchant,
I want to update my credentials when my Secret Token changes, or remove them entirely to disconnect Tingee,
So that I maintain control of my integration at any time.

**Acceptance Criteria:**

**Given** a merchant with existing credentials enters new values and saves,
**When** Tingee API validates the new credentials,
**Then** if valid: old encrypted values are overwritten atomically, badge shows "Đã kết nối"

**Given** a merchant submits new credentials that fail Tingee validation,
**When** Tingee API rejects them,
**Then** old credentials remain unchanged — no overwrite until new ones pass

**Given** a merchant confirms credential deletion,
**When** delete is executed,
**Then** `MerchantCredential` is deleted from DB AND "Thanh toán qua Tingee QR" is unregistered from Shopify — both atomically (if either fails, neither completes)

**Given** the Shopify GraphQL call to unregister payment method fails,
**When** the error occurs during deletion,
**Then** an error Banner is shown and credentials are NOT deleted — consistent state maintained

---

### Story 1.6: App Uninstall & GDPR Compliance

As a merchant,
I want my store's complete data to be removed automatically when I uninstall the app,
So that Tingee Payment App complies with Shopify's GDPR requirements and respects my data privacy.

**Acceptance Criteria:**

**Given** Shopify sends `APP_UNINSTALLED` webhook to `routes/webhooks.tsx`,
**When** received and validated,
**Then** `MerchantCredential` is deleted, "Thanh toán qua Tingee QR" payment method is unregistered, and `Merchant.uninstalledAt` is set — all initiated within the webhook handler (completion within 48h per Shopify GDPR policy)

**Given** Shopify sends `customers/data_request` webhook,
**When** received,
**Then** HTTP 200 is returned; response confirms no customer PII is stored by this app in Phase 1

**Given** Shopify sends `customers/redact` webhook,
**When** received,
**Then** any `Payment` records linked to that customer's orders are deleted, HTTP 200 returned

**Given** Shopify sends `shop/redact` webhook,
**When** received,
**Then** ALL records for that `shop_domain` are explicitly deleted in FK-safe order: `ProcessedWebhook`, `Payment`, `MerchantCredential`, `Merchant` — test asserts each table is queried explicitly (no wildcards)

**Given** any GDPR webhook handler,
**When** an error occurs during processing,
**Then** HTTP 200 is still returned (Shopify requirement) and the error is logged to Sentry for manual follow-up

---

---

## Epic 2: Buyer Payment Experience

Người mua thấy QR và Deeplink trên trang Order Status sau khi đặt hàng với phương thức Tingee, countdown 15 phút, và UI tự cập nhật real-time khi thanh toán thành công — không cần reload trang.

### Story 2.1: Tingee Service Interface & Payment Data API

As a buyer,
I want QR code and Deeplink to be ready when I land on the Order Status page,
So that I can start payment immediately without any loading delay.

**Acceptance Criteria:**

**Given** `app/services/tingee.server.ts` is created,
**When** the interface is defined,
**Then** it exposes stubs for ALL methods used across Epic 2 and Epic 3: `generateQR()`, `generateDeeplink()`, and `verifyWebhookHMAC()` — Epic 3 only implements, never restructures this file

**Given** a Shopify order is placed with payment method "Thanh toán qua Tingee QR",
**When** `GET /api/orders/:orderId/tingee-data` is called (authenticated via `authenticate.public.checkout()`),
**Then** the endpoint: (1) generates Static QR via Tingee API (200×200px PNG/SVG, amount=order total VND, content=`TINGEE {order_number}`), (2) generates Deeplink via Tingee `/v1/deep-link/generate`, (3) creates a `Payment` record in DB with `status=PENDING`, `expiresAt=now+15min`, (4) returns `{ qrImageUrl, deeplinkUrl, amount, currency:'VND', status:'PENDING', expiresAt, orderId }`

**Given** `authenticate.admin()` is accidentally used on an Extension API route,
**When** caught in code review,
**Then** it must be replaced with `authenticate.public.checkout()` — these two auth paths MUST NOT be confused

**Given** Tingee API is down when generating QR,
**When** the call times out (>4000ms per `TINGEE_SDK_TIMEOUT_MS`),
**Then** the endpoint returns `{ error: "TINGEE_UNAVAILABLE", code: "TINGEE_UNAVAILABLE" }` with HTTP 503 — Extension shows fallback error UI, does NOT crash

**Given** Tingee API returns error when generating Deeplink only,
**When** the error occurs,
**Then** `deeplinkUrl` is `null` in the response — QR is still returned, Extension hides Deeplink button gracefully

**Given** IDOR security test — Extension for order X requests data for order Y belonging to a different merchant,
**When** the request is made,
**Then** HTTP 403 is returned — `shop_domain` is verified against the session on every order query

**Given** Pact consumer test for `GET /api/orders/:orderId/tingee-data`,
**When** the test runs,
**Then** response schema `{ qrImageUrl: string, deeplinkUrl: string|null, amount: number, currency: 'VND', status: PaymentStatus, expiresAt: string, orderId: string }` is pinned and committed to `test/contracts/`

---

### Story 2.2: Payment Status Polling Endpoint

As a buyer,
I want the Order Status page to know my payment has been confirmed without me refreshing,
So that I get instant feedback when my transaction goes through.

**Acceptance Criteria:**

**Given** `GET /api/orders/:orderId/payment-status` is called (authenticated via `authenticate.public.checkout()`),
**When** the order exists and belongs to the correct merchant,
**Then** the endpoint returns `{ status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED', paidAt?: string }` — `paidAt` is ISO 8601 UTC, present only when `COMPLETED`

**Given** the order's `Payment.expiresAt` has passed,
**When** the endpoint is called and status is still `PENDING`,
**Then** status is updated to `EXPIRED` in DB and returned as `{ status: 'EXPIRED' }`

**Given** the endpoint is called after order is marked `COMPLETED` (by Epic 3 webhook handler),
**When** the Extension polls,
**Then** `{ status: 'COMPLETED', paidAt: '<ISO timestamp>' }` is returned — client stops polling on receipt

**Given** the polling endpoint is called at high frequency,
**When** rate limit is exceeded,
**Then** HTTP 429 is returned — Extension treats this as a failure and applies backoff (does not crash)

**Given** Pact consumer test for `GET /api/orders/:orderId/payment-status`,
**When** the test runs,
**Then** response schema `{ status: PaymentStatus, paidAt?: string }` is pinned — Epic 3 MUST run Pact provider verification before merging any change to this endpoint's response shape

---

### Story 2.3: Order Status Extension — Foundation & Loading State

As a buyer,
I want to see the Tingee payment block appear immediately on the Order Status page while my payment info loads,
So that I know a payment action is expected and the experience feels fast.

**Acceptance Criteria:**

**Given** a buyer lands on Order Status page for an order with "Thanh toán qua Tingee QR",
**When** the Extension mounts,
**Then** a Payment Card renders immediately with a loading skeleton: 200×200 gray placeholder for QR + skeleton bar for amount — resolves within 2 seconds

**Given** the Payment Card loads successfully,
**When** data is received from `/tingee-data`,
**Then** Amount Display renders format "1.500.000 đ" (dots for thousands, đ suffix — NOT "VND"), brand red `#e12a41`, 24px bold

**Given** the Payment Card is rendered,
**When** CSS is inspected,
**Then** scoping uses `[data-tng-extension]` + BEM prefix `tng-` — no style leaks into merchant theme; explicit property resets used instead of `all: revert` (Chromium <84 compatibility)

**Given** the order payment method is NOT "Thanh toán qua Tingee QR",
**When** Extension evaluates the order,
**Then** the entire block does NOT render — no empty space, no error shown

**Given** the order is already `COMPLETED` (Paid) when the page loads,
**When** Extension fetches initial data,
**Then** the block renders in success state directly — no loading → pending → success flash

**Given** any interactive element in the Payment Card,
**When** rendered on any device,
**Then** minimum 44×44px touch target and minimum 12px font size are maintained

**Given** dark mode merchant theme,
**When** the card renders,
**Then** Payment Card uses dark variants (`#1a1a1a` bg, `#3a3a3a` border) but QR container background remains white unconditionally

**Given** Extension renders and Shopify `shop.primary_locale` is `vi`,
**When** UI text is displayed,
**Then** all microcopy is in Vietnamese; when locale is not `vi`, all microcopy falls back to English

---

### Story 2.4: QR Display, Deeplink Button & Mobile Detection

As a buyer,
I want to see a QR code on desktop or a "Mở app ngân hàng" button on mobile,
So that I can pay using whichever method suits my device.

**Acceptance Criteria:**

**Given** a desktop viewport (≥768px),
**When** the Payment Card renders,
**Then** QR code image displays at minimum 200×200px (never below 160px), always white container, 1px border, 8px radius — Deeplink button is NOT rendered

**Given** a mobile viewport (<768px),
**When** the Payment Card renders,
**Then** Deeplink button "Mở app ngân hàng" renders prominently ABOVE the QR, brand red `#e12a41`, minimum 44×44px touch target, `aria-label="Mở app ngân hàng để thanh toán [amount] đồng"`

**Given** mobile detection logic in `hooks/useMobileDetect.ts`,
**When** evaluated,
**Then** 2-of-3 signals are required: (1) `(hover: none) and (pointer: coarse)` media query, (2) `window.innerWidth < 768`, (3) UA string `/Mobi|Android/i` — correctly handles Cốc Cốc, UC Browser, iPad Pro, Samsung DeX

**Given** the buyer taps "Mở app ngân hàng" on iOS,
**When** tapped,
**Then** `window.location.href = deeplinkUrl` fires; if app does not open within 3500ms, QR fallback shows (`showQRFallback()`); if tab becomes hidden (app opened), the timer is cancelled via `visibilitychange`

**Given** the buyer taps "Mở app ngân hàng" on Android,
**When** tapped,
**Then** same flow with 2000ms timeout before QR fallback

**Given** the buyer taps the QR image on mobile,
**When** tapped,
**Then** a zoom/lightbox opens showing QR at full screen width (aids scanning in difficult conditions)

**Given** `deeplinkUrl` is `null` (Tingee API failed to generate Deeplink),
**When** rendered on mobile,
**Then** Deeplink button is hidden — only QR is shown, no error message to buyer

**Given** QR `<img>` element,
**When** inspected for accessibility,
**Then** alt text is "Mã QR thanh toán [amount] đồng qua Tingee"

---

### Story 2.5: Real-time Polling, Status Updates & Offline Resilience

As a buyer,
I want the page to automatically show "Đã thanh toán" when my transfer goes through,
So that I don't need to refresh and can confidently leave the page.

**Acceptance Criteria:**

**Given** Extension mounts with order status `PENDING`,
**When** polling starts,
**Then** `GET /api/orders/:orderId/payment-status` is called immediately (0ms initial delay) then every 5000ms

**Given** polling receives `{ status: 'COMPLETED' }`,
**When** UI updates,
**Then** QR and Deeplink button are hidden; Status Badge changes to "Đã thanh toán ✓" (background `#e3f1ec`, foreground `#008060`); message "Đơn hàng của bạn đã được xác nhận. Cảm ơn!" appears — all in-place, no page reload; polling stops

**Given** 3 consecutive polling failures (network error or HTTP 5xx),
**When** 4th poll is due,
**Then** interval backs off: 10s → 20s → 30s (cap)

**Given** 6+ consecutive failures,
**When** count is reached,
**Then** small toast "Đang kiểm tra kết nối..." appears — no alarming error, polling continues with backoff

**Given** HTTP 4xx from polling endpoint (401/403/404),
**When** received,
**Then** polling stops immediately — no retry for client errors

**Given** Extension component unmounts,
**When** unmount occurs,
**Then** `clearInterval` is called and any in-flight `fetch` is cancelled via `AbortController` — no memory leak

**Given** browser tab becomes hidden,
**When** `visibilitychange` fires,
**Then** polling pauses; resumes immediately when tab becomes visible again

**Given** Extension re-mounts after Shopify theme re-render,
**When** `usePaymentStatus` initializes,
**Then** it reads `sessionStorage` key `tng_payment_{orderId}` — if cached status is <30s old, rehydrates immediately (no flash of loading state)

**Given** Status Badge container,
**When** status changes,
**Then** container has `aria-live="polite"` so screen readers announce the update

---

### Story 2.6: Countdown Timer & QR Expiry State

As a buyer,
I want to know how much time I have left to complete payment, and get clear guidance if the QR expires,
So that I never end up stuck on a page with an unusable QR.

**Acceptance Criteria:**

**Given** order status is `PENDING` and `expiresAt` is in the future,
**When** CountdownTimer renders,
**Then** displays `mm:ss` countdown from 15:00 in JetBrains Mono 13px, muted-text `#6b6b6b`, `aria-live="off"` (no announcement every second)

**Given** countdown reaches 0:00 OR polling receives `{ status: 'EXPIRED' }` (whichever is first),
**When** either condition is met,
**Then** QR image and Deeplink button are hidden; Payment Card shows: "Mã QR đã hết hạn sau 15 phút." + button "Quay lại cửa hàng" linking to merchant storefront root; polling stops

**Given** the expired state,
**When** inspected,
**Then** there is NO "Tạo lại QR" or refresh button — buyer must place a new order

**Given** 30 minutes have elapsed since Extension mount with no payment,
**When** this threshold is reached,
**Then** the block shows: "Chưa nhận được xác nhận thanh toán. Nếu bạn đã thanh toán, đơn hàng sẽ được xác nhận trong vài phút." + contact support link; polling has already stopped at the 15-min expiry

**Given** `EXPIRED` status in `sessionStorage` cache,
**When** Extension re-mounts,
**Then** it restores expired UI immediately — no flicker to loading/pending state

**Given** countdown reaches 0,
**When** expiry triggers,
**Then** `aria-live="polite"` fires once on the status container to announce expiry to screen readers

---

### Epic 3: Payment Reconciliation & Automated Order Fulfillment

Hệ thống tự động nhận IPN từ Tingee, xác thực chữ ký HMAC, đối soát số tiền chính xác, và cập nhật đơn hàng Shopify sang Paid — merchant không cần can thiệp thủ công.

**FRs covered:** FR-11, FR-12, FR-13, FR-14

**Ghi chú:** Bao gồm HMAC-SHA512 validation middleware, idempotency (status-based pattern), Exact Amount Match (strict integer VND), Shopify API retry (429/5xx: 3 lần backoff 1s/3s/10s), Sentry + monitoring setup. Story đầu tiên: Pact provider verification (không merge nếu fail). Epic 3 backend có thể bắt đầu song song với Epic 2 frontend nếu team size cho phép.

---

## Epic 3: Payment Reconciliation & Automated Order Fulfillment

Hệ thống tự động nhận IPN từ Tingee, xác thực chữ ký HMAC, đối soát số tiền chính xác, và cập nhật đơn hàng Shopify sang Paid — merchant không cần can thiệp thủ công.

### Story 3.1: Tingee Webhook Endpoint & HMAC Validation

As a system,
I want to securely receive and authenticate payment notifications from Tingee,
So that only legitimate transactions trigger any processing — and we respond within Tingee's 5-second timeout.

**Acceptance Criteria:**

**Given** Pact provider verification setup at the start of Epic 3,
**When** `pact verify` is run against `GET /api/orders/:orderId/payment-status`,
**Then** the provider test passes against the consumer contract pinned in Epic 2 — this MUST complete before any other Epic 3 story merges

**Given** Tingee sends a POST to `/webhooks/tingee`,
**When** the request arrives,
**Then** rate limiting enforces 100 requests per 15 minutes per IP via `lib/rateLimit.server.ts` — requests over the limit receive HTTP 429

**Given** a Tingee webhook with a valid HMAC-SHA512 signature,
**When** `lib/hmac.server.ts` validates header `x-signature` = `HMAC_SHA512(x-request-timestamp + ":" + body, secretToken)`,
**Then** validation passes and processing continues

**Given** a Tingee webhook with an invalid HMAC-SHA512 signature,
**When** validation runs,
**Then** HTTP 400 is returned immediately, no DB writes are made, and a security warning is logged to Sentry via `sanitizeForLog()`

**Given** a Tingee webhook with `x-request-timestamp` older than 5 minutes (replay attack),
**When** timestamp is validated,
**Then** HTTP 400 is returned — replay attack prevention

**Given** a valid webhook that passes HMAC validation,
**When** the full handler completes,
**Then** HTTP 200 is returned in ≤5 seconds total (Tingee hard limit) — verifiable via integration test with mocked 3s Tingee delay

**Given** `verifyWebhookHMAC()` stub in `tingee.server.ts` (created in Story 2.1),
**When** implemented in this story,
**Then** the implementation replaces the stub — file structure is NOT reorganized

---

### Story 3.2: Payment Reconciliation & Idempotency

As a merchant,
I want the system to automatically match incoming payments to the correct order and amount,
So that only exact payments trigger fulfillment — wrong-amount payments are flagged for my review without interrupting other orders.

**Acceptance Criteria:**

**Given** a valid Tingee webhook with `transactionCode`,
**When** processing begins,
**Then** `INSERT INTO processed_webhooks { idempotencyKey: 'tingee:{transactionCode}', status: 'PENDING' }` is attempted — if `P2002` (duplicate key), return HTTP 200 immediately (already processed, no reprocessing)

**Given** idempotency INSERT succeeds (new transaction),
**When** `assertValidTransition(PENDING, PROCESSING)` is called,
**Then** Payment record status transitions to `PROCESSING` — if transition is invalid (e.g., already COMPLETED), log to Sentry and return HTTP 200 (out-of-order webhook)

**Given** `receivedAmount` from webhook equals `expectedAmount` from Payment record (strict integer VND comparison),
**When** amounts match exactly,
**Then** processing continues to Shopify order update (Story 3.3)

**Given** `receivedAmount` does NOT equal `expectedAmount`,
**When** mismatch is detected,
**Then** Payment status → `FAILED`, `ProcessedWebhook` → `status: 'COMPLETED'` (no retry), Shopify Order Note is added: "Tingee received {receivedAmount} VND, expected {expectedAmount} VND — manual review required", HTTP 200 returned

**Given** no `Payment` record found matching the webhook's order reference,
**When** lookup fails,
**Then** webhook is logged to Sentry and HTTP 200 returned — Tingee does not retry

**Given** Tingee retries the same webhook (up to 5 times per Tingee policy),
**When** the same `transactionCode` arrives again,
**Then** the `P2002` idempotency guard returns HTTP 200 immediately on every retry — zero duplicate processing

---

### Story 3.3: Shopify Order Update, Retry Mechanism & Monitoring

As a merchant,
I want the system to reliably mark my order as Paid in Shopify after a successful payment, even if Shopify's API is temporarily unavailable,
So that zero confirmed payments result in orders stuck in pending.

**Acceptance Criteria:**

**Given** Exact Amount Match succeeds (from Story 3.2),
**When** `services/order.server.ts markOrderPaid()` is called,
**Then** Shopify GraphQL Admin API (version ≥ 2025-07) marks the order as Paid with a Manual Payment Method transaction — Shopify triggers confirmation email to buyer automatically

**Given** Shopify API returns HTTP 429 or 5xx,
**When** the call fails,
**Then** retry with exponential backoff: attempt 1 (immediate) → attempt 2 (1s) → attempt 3 (3s) → attempt 4 (10s) — maximum 3 retries (4 total attempts)

**Given** Shopify API returns HTTP 4xx (not 429) — e.g., 404,
**When** the call fails,
**Then** NO retry; `ProcessedWebhook` → `FAILED`; error logged to Sentry with `sanitizeForLog()`; HTTP 200 returned (no Tingee retry storm)

**Given** all 3 retries exhausted and Shopify API still fails,
**When** the final attempt fails,
**Then** `ProcessedWebhook` → `FAILED`; Payment → `FAILED`; error logged to Sentry with full context (shop_domain, orderId, transactionCode, attempt count); HTTP 200 returned — recovery requires manual ops intervention (delete idempotency record + re-fire webhook)

**Given** `markOrderPaid()` succeeds,
**When** the call returns,
**Then** `assertValidTransition(PROCESSING, SUCCESS)` passes; Payment → `SUCCESS`; `ProcessedWebhook` → `COMPLETED`; HTTP 200 returned

**Given** metrics collection configured from Day 1 of pilot,
**When** webhooks are processed,
**Then** `tingee.api.response_time`, `webhook.processing_time`, `webhook.retry_count` are emitted to Sentry/Fly.io logs — P95 of `tingee.api.response_time` used post-pilot to negotiate Tingee SLA

**Given** full webhook happy-path integration test (Testcontainers PostgreSQL + MSW mocking Shopify API),
**When** a valid webhook with matching amount is processed end-to-end,
**Then** Payment record status = `SUCCESS`, ProcessedWebhook status = `COMPLETED`, Shopify mock received exactly 1 `markOrderPaid` call, total processing time < 5s
