---
stepsCompleted: ["step-01-document-discovery", "step-02-prd-analysis", "step-03-epic-coverage-validation", "step-04-ux-alignment", "step-05-epic-quality-review", "step-06-final-assessment"]
documentsSelected:
  prd: "_bmad-output/planning-artifacts/prds/prd-Tingee-Shopify-App-2026-06-22/prd.md"
  architecture: "_bmad-output/planning-artifacts/architecture.md"
  epics: "_bmad-output/planning-artifacts/epics.md"
  ux_design: "_bmad-output/planning-artifacts/ux-designs/ux-Tingee-Shopify-App-2026-06-22/DESIGN.md"
  ux_experience: "_bmad-output/planning-artifacts/ux-designs/ux-Tingee-Shopify-App-2026-06-22/EXPERIENCE.md"
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-22
**Project:** Tingee-Shopify-App

---

## PRD Analysis

### Functional Requirements

FR-1: Merchant có thể cài đặt App từ Shopify App Store thông qua OAuth standard flow. App request đúng scopes: `write_orders`, `read_orders`, `write_payment_gateways`, `read_payment_gateways`. Sau OAuth, redirect đến Admin Surface.

FR-2: Khi Merchant gỡ app, hệ thống xóa Credential và hủy đăng ký Manual Payment Method. Dữ liệu xóa trong 48 giờ (GDPR).

FR-3: Merchant nhập Client ID + Secret Token, hệ thống kiểm tra với Tingee API trước khi lưu. Nếu valid: lưu mã hóa, hiển thị badge "Kết nối thành công". Nếu invalid: badge lỗi, không lưu. Secret Token không bao giờ trả về client.

FR-4: Sau khi Credential hợp lệ lưu lần đầu, tự động đăng ký Manual Payment Method "Thanh toán qua Tingee QR" trên Shopify.

FR-5: Merchant có thể cập nhật hoặc xóa Credential. Khi xóa, Manual Payment Method bị hủy đăng ký.

FR-6: Order Status Extension hiển thị block thanh toán (QR, số tiền, mã đơn, nội dung CK) khi và chỉ khi đơn hàng dùng phương thức "Thanh toán qua Tingee QR" và chưa Paid.

FR-7: Nút Deeplink "Mở app ngân hàng" chỉ render trên mobile (viewport < 768px). Desktop chỉ hiển thị QR.

FR-8: Backend tạo Static QR theo chuẩn VietQR, điền sẵn số tiền đúng đơn hàng, nội dung `TINGEE {order_number}`. Kích thước tối thiểu 200×200px.

FR-9: Backend tạo Deeplink qua Tingee API `/v1/deep-link/generate`. Nếu API lỗi: ẩn Deeplink button, vẫn hiển thị QR.

FR-10: Order Status Extension polling backend mỗi 5 giây. Khi Paid: hiển thị "Thanh toán thành công ✓" (màu xanh), dừng polling. Khi hết 15 phút: hiển thị thông báo hết hạn, dừng polling.

FR-10b: QR hết hạn sau 15 phút. Countdown timer hiển thị. Khi hết hạn: block expired, nút "Quay lại cửa hàng". Không có nút tạo lại QR — phải tạo đơn mới.

FR-11: Backend xác thực HMAC-SHA512 mọi Webhook từ Tingee trước khi xử lý. Chữ ký không hợp lệ → HTTP 400, ghi log. Hợp lệ → HTTP 200 trong 5 giây.

FR-12: So khớp số tiền Webhook với đơn hàng Shopify. Khớp chính xác: cập nhật đơn sang Paid. Không khớp: đơn pending, thêm Order Note đầy đủ thông tin. Không tìm thấy đơn: ghi log, bỏ qua.

FR-13: Retry Shopify API khi thất bại. ⚠️ CORRECTION từ addendum: Tingee retry 5 lần (PRD gốc ghi sai là 3 lần). App backend phải handle idempotency cho 5 lần retry. Key idempotency: `tingee:{transactionCode}`.

FR-14: Sau Exact Amount Match thành công, gọi Shopify Order API với transaction type `capture`/`sale`. Đơn hiển thị "Paid" trong Shopify Admin; Shopify tự trigger email xác nhận.

**Tổng FRs: 15 (FR-1 đến FR-14, bao gồm FR-10b)**

---

### Non-Functional Requirements

NFR-SEC-1: Secret Token được lưu mã hóa AES-256 (hoặc tương đương) tại backend; không log, không trả về client.

NFR-SEC-2: Mọi Webhook từ Tingee xác thực HMAC-SHA512 trước khi xử lý (liên quan FR-11).

NFR-SEC-3: Backend endpoint nhận Webhook phải rate-limit: ≥ 1000 request/phút từ cùng IP → throttle.

NFR-SEC-4: HTTPS only, CSP headers — tuân thủ Shopify App Security Requirements.

NFR-REL-1: Webhook handler trả response trong vòng 5 giây (Tingee IPN timeout).

NFR-REL-2: Retry mechanism đảm bảo không mất giao dịch đã được Tingee xác nhận (FR-13).

NFR-REL-3: Order Status Extension tiếp tục hoạt động khi Tingee API chậm — QR và Deeplink tạo một lần lúc đặt hàng, không re-fetch khi render.

NFR-PERF-1: Admin Surface load < 2 giây trên kết nối 4G.

NFR-PERF-2: Order Status Extension không làm chậm trang Order Status > 500ms (render non-blocking).

NFR-PERF-3: Polling interval 5 giây; không dùng WebSocket trong Phase 1.

NFR-COMP-1: Pass Shopify App Review trước khi list công khai.

NFR-COMP-2: Tuân thủ Shopify API versioning policy; sử dụng API version 2025-07 trở lên.

NFR-COMP-3: GDPR webhooks được xử lý: `customers/data_request`, `customers/redact`, `shop/redact`.

**Tổng NFRs: 13**

---

### Additional Requirements & Constraints

- **Idempotency:** Dùng `transactionCode` làm key idempotency (`tingee:{transactionCode}`) để detect duplicate webhook.
- **Static QR trade-off:** Một số ngân hàng (MBBank) cho phép user chỉnh số tiền → risk pending orders do amount mismatch. PM đã chấp nhận trade-off này.
- **Locale:** Chỉ hỗ trợ `vi` và fallback `en`.
- **Node.js:** ≥ 18 (Tingee SDK requirement); dự án dùng 22.12+.
- **Shopify API:** version 2025-07+.
- **Phase scope:** PRD này chỉ bao gồm Phase 1. Phase 2 (checkout modal) trong addendum, không thuộc scope.

---

### PRD Completeness Assessment

PRD được viết rất kỹ lưỡng với các yêu cầu có testable consequences rõ ràng. Mỗi FR đều có hệ quả kiểm tra được. Có một correction quan trọng từ addendum (FR-13: retry 5 lần thay vì 3). Tất cả assumptions đã được đánh dấu rõ ràng. PRD hoàn chỉnh và sẵn sàng cho validation coverage.

---

## Epic Coverage Validation

### Coverage Matrix

| FR | Yêu cầu PRD | Epic Coverage | Trạng thái |
|---|---|---|---|
| FR-1 | OAuth install, scopes, redirect | Epic 1 / Story 1.2 | ✅ Covered |
| FR-2 | Uninstall cleanup, GDPR 48h | Epic 1 / Story 1.6 | ✅ Covered |
| FR-3 | Nhập/lưu Credential, badge kết quả | Epic 1 / Story 1.3, 1.4 | ✅ Covered |
| FR-4 | Tự động đăng ký Manual Payment Method | Epic 1 / Story 1.4 | ✅ Covered |
| FR-5 | Cập nhật/xóa Credential | Epic 1 / Story 1.5 | ✅ Covered |
| FR-6 | Block QR trên Order Status page | Epic 2 / Story 2.3 | ✅ Covered |
| FR-7 | Deeplink button mobile-only | Epic 2 / Story 2.4 | ✅ Covered |
| FR-8 | Tạo Static QR VietQR | Epic 2 / Story 2.1 | ✅ Covered |
| FR-9 | Tạo Deeplink qua Tingee API | Epic 2 / Story 2.1 | ✅ Covered |
| FR-10 | Polling 5s real-time | Epic 2 / Story 2.5 | ✅ Covered |
| FR-10b | QR expiry 15 phút, countdown | Epic 2 / Story 2.6 | ✅ Covered |
| FR-11 | HMAC-SHA512 Webhook validation | Epic 3 / Story 3.1 | ✅ Covered |
| FR-12 | Exact Amount Match, Order Note | Epic 3 / Story 3.2 | ✅ Covered |
| FR-13 | Retry mechanism idempotency | Epic 3 / Story 3.2, 3.3 | ✅ Covered |
| FR-14 | Cập nhật đơn hàng Shopify → Paid | Epic 3 / Story 3.3 | ✅ Covered |

### Missing Requirements

✅ **Không có FR nào bị thiếu trong epics** — tất cả 15 FRs đều có coverage.

### ⚠️ Discrepancies Phát Hiện

**DISC-1 (CRITICAL — NFR-3):** PRD §8 quy định rate-limit "≥ 1000 request/phút từ cùng IP → throttle". Epics NFR-3 thực thi "100 req/15 phút per IP" (~6.7 req/phút). Epics chặt hơn PRD **150 lần** — cần align hoặc xác nhận con số nào đúng.

**DISC-2 (MINOR — FR-13 backoff):** PRD quy định backoff "1s/5s/30s". Epics và Story 3.3 thực hiện "0s/1s/3s/10s" (4 attempts). Khác nhau nhưng đều hợp lý — cần confirm con số chính thức.

**DISC-3 (NOTED — FR-13 Tingee retry):** Addendum correction: Tingee retry 5 lần (PRD ghi sai là 3). Epics xử lý đúng qua idempotency `P2002` guard trong Story 3.2.

### Coverage Statistics

- Tổng PRD FRs: **15** (FR-1 đến FR-14, bao gồm FR-10b)
- FRs covered trong epics: **15**
- Tỷ lệ bao phủ: **100%**
- NFRs bao phủ: 13 PRD NFRs → 15 epics NFRs (epics thêm NFR-14 multi-tenancy và NFR-15 idempotency)

---

## UX Alignment Assessment

### UX Document Status

✅ Tìm thấy — 2 files: `DESIGN.md` (visual tokens, components) và `EXPERIENCE.md` (behavioral patterns, flows, states). Cả hai được đọc đầy đủ.

### Alignment Issues

#### 🚨 CRITICAL — UX ↔ PRD Conflict (FR-10b / Expired State)

**EXPERIENCE.md** định nghĩa trạng thái Expired:
> "Button: 'Lấy mã mới' — gọi API refresh, countdown reset về 15:00, QR mới hiển thị."

**EXPERIENCE.md** mô tả Countdown Timer:
> "Khi hết giờ: auto-refresh QR, không cần user action."

**PRD FR-10b** (và Epics Story 2.6) quy định rõ:
> "Không có nút 'Tạo lại QR' trên Order Status page — Người mua phải tạo đơn hàng mới."

**Kết luận:** UX document chưa được cập nhật để phản ánh quyết định PM về việc không cho refresh QR. Epics đã đi theo PRD (đúng). Developer phải theo PRD + Epics, **không theo EXPERIENCE.md** cho trạng thái này. Cần cập nhật EXPERIENCE.md.

---

#### ⚠️ MINOR — UX ↔ Epics Inconsistency (Deeplink Timeout/Fallback)

**EXPERIENCE.md** Interaction Primitives:
> "Deeplink Button: Tap ngay → `window.location = 'tingee://...'`. Tingee backend xử lý redirect sang app ngân hàng — không cần detect hay fallback. QR luôn hiển thị song song là fallback tự nhiên."

**Epics Story 2.4** thực thi chi tiết hơn:
> iOS timeout 3500ms, Android timeout 2000ms → `showQRFallback()` sau timeout.

UX document đơn giản hóa thành "không cần fallback logic". Epics đã quyết định implement timeout + explicit fallback. UX cần được cập nhật để reflect behavior thực tế.

---

#### ⚠️ MINOR — Admin URL mismatch

**EXPERIENCE.md** Information Architecture: Admin URL = `/apps/tingee-payment`
**Epics Story 1.2** Acceptance Criteria: Merchant redirect đến `/app/settings`

Cần xác nhận URL chính thức và đồng bộ giữa hai tài liệu.

---

### Architecture ↔ UX Alignment

✅ Architecture và Epics hỗ trợ đầy đủ các UX requirements chính:
- Two-endpoint API pattern (`/tingee-data` + `/payment-status`) → hỗ trợ loading skeleton + polling
- `sessionStorage` persistence → hỗ trợ theme re-render resilience
- `authenticate.public.checkout()` → đúng auth cho Buyer surface
- CSS isolation với BEM prefix `tng-` + `[data-tng-extension]` → theme-agnostic
- Dark mode variants trong DESIGN.md → được implement trong Story 2.3
- UX-DR20 (webhook timeout 30 phút) → được implement trong Story 2.6

### Warnings

⚠️ **EXPERIENCE.md cần được cập nhật** tại 3 điểm:
1. Expired state: xóa "Lấy mã mới" button, thay bằng "Quay lại cửa hàng"
2. Countdown Timer: xóa mô tả "auto-refresh QR" — thay bằng "expired state kích hoạt"
3. Deeplink fallback: thêm mô tả iOS/Android timeout logic

---

## Epic Quality Review

### Epic 1: Merchant Onboarding & App Foundation

**Best Practices Compliance:**
- [x] Epic delivers user value — Merchant cài app và có payment method tại checkout ✅
- [x] Epic có thể function độc lập ✅
- [x] Stories appropriately sized ✅
- [x] Acceptance Criteria dùng Given/When/Then ✅
- [x] Traceability to FRs maintained ✅

**Issues Found:**

🔴 **CRITICAL — Story 1.1 Scope AC sai (lỗi nhỏ nhưng blocking)**

Story 1.1 AC: `"only read_orders, write_orders, read_payment_gateways are present"` — **thiếu `write_payment_gateways`**

Story 1.2 AC: `"write_orders, read_orders, write_payment_gateways, read_payment_gateways"` — đúng, đầy đủ 4 scopes

PRD FR-1: `write_orders, read_orders, write_payment_gateways, read_payment_gateways` — đúng

**Tác động:** Developer thực hiện Story 1.1 sẽ config sai toml scopes, không có `write_payment_gateways` → Manual Payment Method registration (FR-4) sẽ thất bại. Story 1.4 phụ thuộc vào scope này.

**Khắc phục:** Cập nhật Story 1.1 AC: thêm `write_payment_gateways` vào danh sách scopes trong `shopify.app.toml`.

---

🟠 **MAJOR — Story 1.1 tạo toàn bộ DB schema upfront (4 models)**

Story 1.1 tạo cả 4 models: `Merchant`, `MerchantCredential`, `Payment`, `ProcessedWebhook` — nhưng `Payment` và `ProcessedWebhook` chỉ được dùng ở Epic 2 và Epic 3.

**Best practice:** Mỗi story chỉ tạo models nó cần.

**Tuy nhiên:** Epics document đã ghi nhận trade-off này: "DB schema phải complete ở story cuối Epic 1 — tránh migration drift ở Epic 2 và 3." Đây là quyết định có chủ đích. **Chấp nhận được** với lý do đã nêu, nhưng cần ghi nhận.

---

### Epic 2: Buyer Payment Experience

**Best Practices Compliance:**
- [x] Epic delivers user value — Buyer thấy QR/Deeplink và nhận feedback real-time ✅
- [x] Epic chỉ phụ thuộc Epic 1 (sequential, đúng) ✅
- [x] Stories có BDD ACs đầy đủ ✅
- [x] Traceability to FRs maintained ✅

**Issues Found:**

🟠 **MAJOR — Story 2.1 có forward dependency sang Epic 3**

Story 2.1 AC: `"it exposes stubs for ALL methods used across Epic 2 and Epic 3: generateQR(), generateDeeplink(), and verifyWebhookHMAC() — Epic 3 only implements, never restructures this file"`

`verifyWebhookHMAC()` là concern của Epic 3, nhưng được define stub trong Epic 2.

**Nhận xét:** Đây là intentional "interface-first" design pattern để tránh restructuring file giữa các epics. Không phải runtime forward dependency. **Chấp nhận được** nhưng cần developer hiểu: Epic 3 implements stub, không tạo file mới.

---

🟡 **MINOR — Story 2.2: COMPLETED state phụ thuộc runtime Epic 3**

Story 2.2 AC: `"After order is marked COMPLETED (by Epic 3 webhook handler)"`

Full buyer experience (QR → Paid) chỉ hoạt động khi cả Epic 3 đã deployed. Trong testing isolated Epic 2, cần mock `COMPLETED` status.

**Khắc phục:** Thêm AC hoặc note: "Integration test cho COMPLETED state phải mock Epic 3 webhook response via MSW."

---

🟡 **MINOR — Story 2.4: Deeplink `href` inconsistency với EXPERIENCE.md**

Story 2.4: `window.location.href = deeplinkUrl` với iOS 3500ms / Android 2000ms timeout

EXPERIENCE.md: `window.location = 'tingee://payment/process?id=...'` — hardcoded URL format, không đề cập timeout

Epics định nghĩa behavior chính xác hơn. UX document cần update (đã noted ở UX Alignment).

---

### Epic 3: Payment Reconciliation & Automated Order Fulfillment

**Best Practices Compliance:**
- [x] Epic delivers user value — Merchant không cần xác nhận thủ công ✅
- [x] Epic phụ thuộc Epic 1 + 2 (sequential, đúng) ✅
- [x] Pact contract testing gate giữa Epic 2 và 3 ✅
- [x] Idempotency, retry, monitoring đều có ACs ✅
- [x] Traceability to FRs maintained ✅

**Issues Found:**

🟡 **MINOR — Story 3.3: HTTP 202 response semantics cần clarify**

Story 3.3 AC: `"After 3 retries exhausted and Shopify API still fails: ProcessedWebhook → FAILED; Payment → FAILED; HTTP 202 returned (signals Tingee to retry — giving another chance when Shopify recovers)"`

**Vấn đề:** Nếu trả HTTP 202 để Tingee retry, nhưng `ProcessedWebhook` đã có idempotency key với status `PENDING` hoặc đã `FAILED` — Tingee retry sẽ bị block bởi idempotency guard (P2002) trong Story 3.2 và return HTTP 200 immediately mà không xử lý lại.

**Conflict:** Story 3.2 idempotency và Story 3.3 "Tingee retry để recover" không tương thích với nhau như hiện tại. Nếu muốn Tingee retry và xử lý lại, cần xóa hoặc reset idempotency record — nhưng Story 3.2 không có logic này.

**Khuyến nghị:** Làm rõ behavior: Hoặc (A) trả HTTP 200, mark FAILED, và có separate recovery mechanism; hoặc (B) xóa idempotency record khi muốn cho retry, nhưng cần thêm AC cho Story 3.2 về partial failure recovery.

---

### Overall Epic Quality Summary

| Epic | User Value | Independence | Story Sizing | ACs Quality | Issues |
|------|-----------|--------------|-------------|------------|--------|
| Epic 1 | ✅ | ✅ | ✅ | ✅ | 1 Critical, 1 Major |
| Epic 2 | ✅ | ✅ | ✅ | ✅ | 1 Major, 2 Minor |
| Epic 3 | ✅ | ✅ | ✅ | ✅ | 1 Minor |

**Tổng cộng:** 1 Critical, 2 Major, 3 Minor

---

## Summary and Recommendations

### Overall Readiness Status

## 🟡 NEEDS WORK — Sẵn sàng implement sau khi fix 3 issues ưu tiên cao

Dự án được chuẩn bị tốt với coverage 100% FRs, epics có chất lượng cao, và ACs chi tiết. Tuy nhiên có **1 lỗi critical** phải sửa trước khi bắt đầu coding, và **2 conflicts quan trọng** cần được PM/Tech Lead quyết định.

---

### Critical Issues Requiring Immediate Action

#### 🔴 CRITICAL-1: Story 1.1 — OAuth Scopes thiếu `write_payment_gateways`

**File:** `epics.md` → Epic 1 → Story 1.1, Acceptance Criteria dòng scopes
**Vấn đề:** AC chỉ list `read_orders, write_orders, read_payment_gateways` — thiếu `write_payment_gateways`
**Tác động:** Nếu developer dùng AC này để config `shopify.app.toml`, Manual Payment Method registration sẽ thất bại ở Story 1.4
**Sửa ngay:** Thêm `write_payment_gateways` vào AC của Story 1.1

---

### High Priority Issues (Cần quyết định trước khi implement)

#### 🟠 HIGH-1: NFR Rate Limit không khớp (PRD vs Epics)

**PRD §8:** Rate limit = "≥ 1000 request/phút từ cùng IP → throttle"
**Epics NFR-3:** Rate limit = "100 req/15 phút per IP" (~6.7/phút)
**Epics chặt hơn PRD 150 lần**

**Cần quyết định:** Con số nào đúng? Nếu 100/15 phút quá chặt → Tingee webhook retry có thể bị throttle; nếu 1000/phút quá lỏng → không bảo vệ được. Đề xuất: 300 req/15 phút (20/phút) — cân bằng giữa bảo vệ và không block Tingee retry.

#### 🟠 HIGH-2: Story 3.3 — HTTP 202 + Idempotency conflict

**Vấn đề:** Story 3.3 trả HTTP 202 khi Shopify API hết retry (để Tingee retry lại), nhưng Story 3.2 đã insert idempotency key — Tingee retry sẽ bị block bởi P2002 và không được xử lý lại.

**Cần quyết định:** Chọn một trong hai:
- **Option A (đơn giản hơn):** Trả HTTP 200, mark FAILED, manual recovery bởi ops team (remove idempotency record và trigger lại). Không cần HTTP 202.
- **Option B (tự động hơn):** Update idempotency record status sang `RETRIABLE_FAILED` (thay vì COMPLETED/FAILED), cho phép retry qua separate job. Cần thêm story mới.

---

### Recommended Next Steps

1. **Ngay lập tức:** Sửa Story 1.1 AC — thêm `write_payment_gateways` vào danh sách scopes. Không cần PM approval — đây là lỗi typo rõ ràng so với PRD FR-1 và Story 1.2.

2. **Trước Sprint 1:** PM + Tech Lead quyết định con số rate limit chính xác (CRITICAL-NFR). Cập nhật NFR-3 trong epics và `lib/rateLimit.server.ts` spec.

3. **Trước Story 3.3:** Tech Lead quyết định HTTP 202 vs HTTP 200 approach cho Shopify retry failure. Cập nhật Story 3.3 AC và nếu cần thêm story 3.4 cho recovery mechanism.

4. **Trước khi bắt đầu Epic 2 coding:** Cập nhật EXPERIENCE.md tại 3 điểm đã noted trong UX Alignment — đặc biệt là expired state (xóa "Lấy mã mới", thêm "Quay lại cửa hàng") để không gây nhầm lẫn cho developer.

5. **Trước Story 1.4:** Xác nhận URL Admin Surface — `/apps/tingee-payment` (EXPERIENCE.md) hay `/app/settings` (Story 1.2). Cập nhật tài liệu không nhất quán.

---

### Final Note

Assessment này xác định **7 issues tổng cộng** (1 Critical, 2 Major, 4 Minor/Warning) trên 4 danh mục (Requirements, Discrepancy, UX Alignment, Epic Quality).

**Điểm mạnh của dự án:**
- PRD được viết rất kỹ với testable consequences rõ ràng
- 100% FR coverage trong epics
- ACs BDD chất lượng cao, bao gồm đầy đủ error cases
- Epics đã incorporate architecture decisions (idempotency, contract testing, monitoring)
- Security được xử lý tốt: HMAC, AES-256, multi-tenancy, GDPR, rate-limit

**Kết luận:** Sửa CRITICAL-1 và quyết định 2 HIGH issues là đủ để bắt đầu Sprint 1 an toàn.

---

*Báo cáo được tạo: 2026-06-22 | Assessor: BMad Check Implementation Readiness*
