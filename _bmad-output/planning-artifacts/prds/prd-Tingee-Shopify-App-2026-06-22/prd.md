---
title: "PRD: Tingee Payment App for Shopify"
status: draft
created: 2026-06-22
updated: 2026-06-22
sources:
  - planning-artifacts/briefs/brief-Tingee-Shopify-App-2026-06-22/brief.md
  - planning-artifacts/ux-designs/ux-Tingee-Shopify-App-2026-06-22/DESIGN.md
  - planning-artifacts/ux-designs/ux-Tingee-Shopify-App-2026-06-22/EXPERIENCE.md
  - https://developers.tingee.vn/docs/banking/
  - https://developers.tingee.vn/sdk/
  - https://developers.tingee.vn/docs/qr/
  - https://developers.tingee.vn/docs/deeplink/
---

# PRD: Tingee Payment App for Shopify

## 0. Mục đích tài liệu

PRD này dành cho Product Manager, developer, và các bên liên quan tham gia xây dựng **Tingee Payment App** — ứng dụng Shopify kết nối nền tảng thanh toán Tingee với cửa hàng Shopify của merchant Việt Nam. Tài liệu sử dụng từ vựng chuẩn hóa trong Glossary (§3); mọi FR và UJ sử dụng các thuật ngữ đó nhất quán.

PRD này bao gồm **Phase 1** — luồng Order Status page. Phase 2 (checkout modal, Shopify Payments Partner) là roadmap item được mô tả trong `addendum.md`, không thuộc phạm vi spec này.

UX Design chi tiết (layout, component, design token) đã có trong DESIGN.md và EXPERIENCE.md — PRD này không duplicate mà dẫn chiếu theo UJ ID.

---

## 1. Tầm nhìn

Tingee Payment App là ứng dụng Shopify miễn phí, cho phép merchant Việt Nam đã sử dụng nền tảng Tingee tích hợp thanh toán QR và Deeplink vào cửa hàng Shopify của họ — không cần viết code, không cần giải pháp bên thứ ba, xây dựng trên API chính thức của Shopify.

Người mua hàng chọn *"Thanh toán qua Tingee QR"* tại checkout, đặt hàng, rồi nhìn thấy QR và Deeplink trên trang Order Status để hoàn tất thanh toán qua app ngân hàng. Khi giao dịch thành công với số tiền khớp chính xác, hệ thống tự động cập nhật đơn hàng Shopify sang trạng thái *Paid* — merchant không cần can thiệp thủ công.

App ra đời đúng thời điểm: ScriptTag injection — cơ chế của các đối thủ như SePay — đã bị Shopify khai tử từ tháng 2/2025 và biến mất hoàn toàn tháng 8/2026. Với merchant đang phụ thuộc vào SePay, đây là cơ hội chuyển sang giải pháp bền vững trước khi bị buộc phải làm vậy.

---

## 2. Người dùng mục tiêu

### 2.1 Jobs To Be Done

**Merchant:**
- Nhận thanh toán nội địa từ khách hàng Việt Nam mà không cần xác nhận thủ công
- Tích hợp phương thức thanh toán quen thuộc với người mua Việt (QR/ngân hàng) vào cửa hàng Shopify
- Thay thế SePay hoặc giải pháp cũ bằng tích hợp bền vững, không phụ thuộc công nghệ sắp bị khai tử
- Giảm số lượng đơn hàng bị bỏ dở do thiếu phương thức thanh toán phù hợp

**Người mua hàng:**
- Thanh toán đơn hàng Shopify bằng app ngân hàng mà không cần nhập số tài khoản thủ công
- Trên mobile: mở thẳng app ngân hàng qua Deeplink, không cần quét QR
- Trên desktop: quét QR bằng điện thoại, quy trình quen thuộc như VietQR

### 2.2 Người dùng ngoài phạm vi (Phase 1)
- Merchant chưa có tài khoản Tingee (onboarding tạo tài khoản không thuộc scope)
- Người mua ở thị trường ngoài Việt Nam
- Merchant cần dashboard báo cáo giao dịch (Tingee portal đã có sẵn)

### 2.3 Hành trình người dùng

**UJ-1. Merchant cài đặt và cấu hình app lần đầu.**
- **Persona + context:** Lê Văn An, chủ cửa hàng thời trang online tại TP.HCM, đang dùng SePay và lo ngại việc tích hợp sắp hỏng vào tháng 8/2026.
- **Entry state:** Chưa cài app. Có sẵn Client ID và Secret Token Tingee.
- **Path:** Vào Shopify App Store → tìm "Tingee" → click Install → OAuth với Shopify → được redirect vào Admin Settings → nhập Client ID + Secret Token → nhấn Lưu → thấy badge "Kết nối thành công".
- **Climax:** Badge "Kết nối thành công" hiển thị, phương thức thanh toán "Thanh toán qua Tingee QR" tự động xuất hiện ở checkout của cửa hàng.
- **Resolution:** Merchant có thể test luồng mua hàng ngay. Không cần thao tác thêm.
- **Edge case:** Nhập sai Secret Token → badge "Kết nối thất bại" + hướng dẫn kiểm tra lại credential.

**UJ-2. Người mua thanh toán qua QR trên desktop.**
- **Persona + context:** Mai, mua áo trên điện thoại nhưng đang dùng laptop. Không có thẻ quốc tế.
- **Entry state:** Đã đặt hàng, chọn "Thanh toán qua Tingee QR", đang ở trang Order Status.
- **Path:** Thấy block Tingee hiển thị QR + số tiền + mã đơn hàng → lấy điện thoại quét QR → app ngân hàng mở → xác nhận chuyển khoản → quay lại trang → thấy "Thanh toán thành công ✓".
- **Climax:** Status block chuyển sang trạng thái xanh "Thanh toán thành công" trong vòng vài giây sau khi webhook Tingee xác nhận.
- **Resolution:** Người mua biết đơn đã được xác nhận. Email xác nhận đơn hàng từ Shopify được gửi (do Shopify trigger khi order paid).
- **Edge case:** QR hết hạn (nếu có timeout) → nút "Làm mới QR" để tạo lại.

**UJ-3. Người mua thanh toán qua Deeplink trên mobile.**
- **Persona + context:** Tuấn, mua đồ trên điện thoại, quen dùng app MBBank.
- **Entry state:** Đã đặt hàng, chọn "Thanh toán qua Tingee QR", đang ở trang Order Status trên mobile.
- **Path:** Thấy block Tingee hiển thị nút "Mở app ngân hàng" (Deeplink) nổi bật + QR ở dưới → nhấn Deeplink → app ngân hàng mở với thông tin chuyển khoản điền sẵn → xác nhận → quay lại trình duyệt → thấy "Thanh toán thành công ✓".
- **Climax:** Không cần nhập tay bất kỳ thông tin nào — Deeplink đã điền sẵn số tài khoản, số tiền, nội dung.
- **Resolution:** Tương tự UJ-2.
- **Edge case:** App ngân hàng không hỗ trợ Deeplink → fallback hiển thị QR để quét thủ công.

**UJ-4. Xử lý thanh toán lệch số tiền.**
- **Persona + context:** Người mua vô tình sửa số tiền khi quét Static QR trên MBBank.
- **Entry state:** Webhook Tingee gửi tín hiệu giao dịch với số tiền ≠ giá trị đơn hàng.
- **Path:** Hệ thống so sánh amount → không khớp → đơn giữ trạng thái `pending` → [ASSUMPTION: merchant nhận thông báo email hoặc thấy flag trong Shopify Admin] → merchant xem xét và xử lý thủ công.
- **Climax:** Merchant có đủ thông tin (số tiền thực nhận, số tiền đơn hàng, thời gian giao dịch) để quyết định confirm hay từ chối.
- **Resolution:** Merchant confirm thủ công → đơn chuyển sang Paid. Hoặc merchant liên hệ người mua để xử lý.

---

## 3. Glossary

- **Merchant** — Chủ cửa hàng Shopify đã có tài khoản Tingee, cài đặt và cấu hình app.
- **Người mua** — Khách hàng cuối đặt hàng trên cửa hàng Shopify của Merchant.
- **Credential** — Cặp Client ID + Secret Token do nền tảng Tingee cấp cho Merchant.
- **Client ID** — Định danh duy nhất của Merchant trên hệ thống Tingee; public.
- **Secret Token** — Khóa bí mật dùng để ký HMAC-SHA512; không được expose ra client.
- **Static QR** — Mã QR VietQR tĩnh được tạo từ thông tin tài khoản Tingee của Merchant. Số tiền được điền sẵn nhưng một số ngân hàng cho phép người dùng chỉnh sửa.
- **Deeplink** — URL đặc biệt mở trực tiếp app ngân hàng trên mobile với thông tin chuyển khoản điền sẵn. Được tạo qua Tingee API `/v1/deep-link/generate`.
- **Webhook** — HTTP callback từ Tingee gửi tới backend của app khi có giao dịch phát sinh.
- **IPN** — Internet Payment Notification; cách Tingee gửi thông báo real-time qua Webhook.
- **Exact Amount Match** — Rule đối soát: giao dịch chỉ được auto-confirm khi số tiền trong Webhook bằng chính xác giá trị đơn hàng Shopify.
- **Order Status Extension** — Shopify Checkout UI Extension hiển thị block tùy chỉnh trên trang `/orders/[token]` sau khi đặt hàng.
- **Manual Payment Method** — Phương thức thanh toán Shopify không xử lý qua Shopify Payments; merchant tự xử lý tiền và xác nhận đơn. Sử dụng trong Phase 1.
- **Admin Surface** — Giao diện quản lý embedded trong Shopify Admin, dùng Shopify Polaris.
- **Buyer Surface** — Order Status Extension; hiển thị trong theme của cửa hàng Shopify.
- **Pending** — Trạng thái đơn hàng khi Webhook nhận được nhưng Exact Amount Match thất bại; cần Merchant xử lý thủ công.
- **Paid** — Trạng thái đơn hàng sau khi Exact Amount Match thành công và Shopify được cập nhật.
- **HMAC-SHA512** — Thuật toán ký request dùng để xác thực Webhook từ Tingee và request tới Tingee API.

---

## 4. Tính năng

### 4.1 Cài đặt App & OAuth

**Mô tả:** Merchant tìm và cài app từ Shopify App Store. Sau khi click Install, Shopify thực hiện OAuth flow để cấp quyền truy cập cần thiết. App yêu cầu tối thiểu các scope cần thiết để đăng ký Manual Payment Method và cập nhật đơn hàng. Sau OAuth thành công, Merchant được redirect vào Admin Surface. [ASSUMPTION: App được list công khai trên Shopify App Store từ ngày launch.]

**Functional Requirements:**

#### FR-1: Shopify OAuth installation flow

Merchant có thể cài đặt App từ Shopify App Store thông qua OAuth standard flow của Shopify.

**Hệ quả (testable):**
- App request đúng và đủ OAuth scopes: `write_orders`, `read_orders`, `write_payment_gateways`, `read_payment_gateways`.
- Sau OAuth thành công, Merchant được redirect đến Admin Surface (`/apps/tingee-payment`).
- App store và quản lý `access_token` Shopify một cách bảo mật (không log, không expose ra client).

**Out of Scope:**
- Custom onboarding wizard nhiều bước sau install.

#### FR-2: Uninstallation cleanup

Khi Merchant gỡ cài đặt app, hệ thống xóa sạch dữ liệu liên quan của shop đó.

**Hệ quả (testable):**
- Shopify gửi `app/uninstalled` webhook → backend xóa Credential đã lưu và hủy đăng ký Manual Payment Method.
- Dữ liệu merchant bị xóa trong vòng 48 giờ (Shopify GDPR requirement).

---

### 4.2 Cấu hình Credential

**Mô tả:** Admin Surface cung cấp một màn hình duy nhất để Merchant nhập, kiểm tra và lưu Credential Tingee. Sau khi lưu thành công, hệ thống tự động đăng ký Manual Payment Method "Thanh toán qua Tingee QR" trên Shopify. Trạng thái kết nối được hiển thị rõ ràng. Realizes UJ-1.

**Functional Requirements:**

#### FR-3: Nhập và lưu Credential

Merchant có thể nhập Client ID và Secret Token, kiểm tra kết nối với Tingee API, và lưu Credential.

**Hệ quả (testable):**
- Form có hai trường: Client ID (text) và Secret Token (password, ẩn mặc định).
- Khi nhấn "Lưu", hệ thống gọi Tingee API để kiểm tra tính hợp lệ của Credential trước khi lưu.
- Nếu valid: Credential được lưu mã hóa tại backend; badge "Kết nối thành công" hiển thị.
- Nếu invalid: Badge "Kết nối thất bại" hiển thị cùng thông báo lỗi cụ thể; Credential không được lưu.
- Secret Token không bao giờ được trả về trong response API để hiển thị lại trên form (chỉ hiển thị dạng masked).

#### FR-4: Tự động đăng ký Manual Payment Method

Sau khi Credential hợp lệ được lưu lần đầu, hệ thống tự động đăng ký Manual Payment Method trên Shopify.

**Hệ quả (testable):**
- Tên phương thức thanh toán hiển thị tại checkout: "Thanh toán qua Tingee QR".
- Đăng ký thực hiện tự động — Merchant không cần thao tác bổ sung trong Shopify Admin.
- Nếu đăng ký thất bại: Admin Surface hiển thị cảnh báo và hướng dẫn thử lại.

#### FR-5: Cập nhật và xóa Credential

Merchant có thể cập nhật Credential khi cần thiết (ví dụ: rotate Secret Token).

**Hệ quả (testable):**
- Khi Merchant nhập Credential mới và lưu, hệ thống kiểm tra lại với Tingee API trước khi ghi đè.
- Merchant có thể xóa Credential; khi xóa, Manual Payment Method bị hủy đăng ký trên Shopify.

---

### 4.3 Order Status Extension — Hiển thị QR và Deeplink

**Mô tả:** Sau khi Người mua đặt hàng với phương thức "Thanh toán qua Tingee QR", trang Order Status hiển thị một block nổi bật chứa Static QR, Deeplink (chỉ trên mobile), số tiền cần thanh toán, countdown 15 phút, và trạng thái giao dịch real-time. Block này là Order Status Extension chạy trong theme của cửa hàng Shopify — theme-agnostic, không xung đột style. Realizes UJ-2, UJ-3.

**Functional Requirements:**

#### FR-6: Hiển thị block thanh toán trên Order Status page

Order Status Extension hiển thị block thanh toán Tingee khi và chỉ khi đơn hàng có phương thức thanh toán là "Thanh toán qua Tingee QR" và chưa ở trạng thái Paid.

**Hệ quả (testable):**
- Block hiển thị: Static QR, số tiền đơn hàng (VNĐ), mã đơn hàng, nội dung chuyển khoản gợi ý.
- Block không hiển thị nếu đơn đã ở trạng thái Paid.
- Block không hiển thị với các phương thức thanh toán khác.

#### FR-7: Deeplink chỉ hiển thị trên mobile

Nút "Mở app ngân hàng" (Deeplink) chỉ render trên thiết bị mobile.

**Hệ quả (testable):**
- Trên viewport mobile (< 768px): nút Deeplink hiển thị nổi bật phía trên QR.
- Trên desktop: nút Deeplink không render; chỉ hiển thị QR.
- [ASSUMPTION: User-agent detection đủ để phân biệt mobile/desktop cho usecase này.]

#### FR-8: Tạo Static QR từ thông tin tài khoản Tingee

Backend tạo Static QR theo chuẩn VietQR từ thông tin tài khoản Tingee của Merchant, điền sẵn số tiền đơn hàng và nội dung chuyển khoản.

**Hệ quả (testable):**
- QR được render dưới dạng ảnh hoặc SVG, kích thước tối thiểu 200×200px.
- QR chứa số tiền đúng bằng giá trị đơn hàng tại thời điểm tạo.
- Nội dung chuyển khoản theo format `TINGEE {order_number}` (ví dụ: `TINGEE 1001`) — ngắn gọn, hiển thị được trong app ngân hàng, chứa mã đơn hàng để đối soát thủ công.

#### FR-9: Tạo Deeplink qua Tingee API

Backend tạo Deeplink qua Tingee API (`/v1/deep-link/generate`) với thông tin đơn hàng.

**Hệ quả (testable):**
- Deeplink URL hợp lệ, khi mở trên mobile → app ngân hàng khởi động với thông tin điền sẵn.
- Nếu Tingee API trả lỗi khi tạo Deeplink: block vẫn hiển thị QR, Deeplink button bị ẩn thay vì hiển thị lỗi.

#### FR-10: Polling trạng thái thanh toán real-time

Order Status Extension polling trạng thái đơn hàng và cập nhật UI khi thanh toán thành công.

**Hệ quả (testable):**
- Extension polling backend mỗi 5 giây kể từ khi trang load, cho đến khi đơn chuyển sang Paid hoặc QR hết hạn (15 phút).
- Khi nhận được trạng thái Paid: block chuyển sang trạng thái "Thanh toán thành công ✓" (màu xanh), dừng polling.
- Khi QR hết hạn: block hiển thị thông báo "QR đã hết hạn. Vui lòng quay lại cửa hàng và đặt lại đơn hàng." Dừng polling.

#### FR-10b: Xử lý QR hết hạn

Static QR có thời hạn sử dụng. Sau khi hết hạn, Người mua phải thực hiện lại toàn bộ quy trình đặt hàng để nhận QR mới.

**Hệ quả (testable):**
- QR hết hạn sau 15 phút kể từ khi đặt hàng. Countdown timer hiển thị trên block trong suốt thời gian chờ.
- Khi hết 15 phút: block chuyển sang trạng thái expired, hiển thị nút "Quay lại cửa hàng" dẫn về trang sản phẩm hoặc cart.
- Không có nút "Tạo lại QR" trên Order Status page — Người mua phải tạo đơn hàng mới.
- Đơn hàng cũ (chưa thanh toán trước khi hết hạn) giữ nguyên trạng thái; Merchant tự xử lý (hủy hoặc giữ) theo quy trình của cửa hàng.

---

### 4.4 Webhook Handler & Reconciliation

**Mô tả:** Backend nhận IPN từ Tingee khi có giao dịch phát sinh, xác thực chữ ký HMAC, so khớp với đơn hàng Shopify tương ứng, và áp dụng Exact Amount Match rule trước khi cập nhật trạng thái. Realizes UJ-2, UJ-3, UJ-4.

**Functional Requirements:**

#### FR-11: Xác thực Webhook từ Tingee

Backend xác thực HMAC-SHA512 của mọi Webhook nhận được từ Tingee trước khi xử lý.

**Hệ quả (testable):**
- Webhook có chữ ký không hợp lệ → trả HTTP 400, không xử lý, ghi log cảnh báo bảo mật.
- Webhook hợp lệ → trả HTTP 200 trong vòng 5 giây (Tingee timeout requirement).

#### FR-12: Đối soát đơn hàng theo Exact Amount Match

Khi nhận Webhook hợp lệ, hệ thống so khớp số tiền giao dịch với số tiền đơn hàng Shopify.

**Hệ quả (testable):**
- Số tiền khớp chính xác: gọi Shopify Order API để cập nhật đơn hàng sang trạng thái Paid.
- Số tiền không khớp: đơn giữ trạng thái `pending`; hệ thống thêm Order Note vào đơn hàng trong Shopify Admin với đầy đủ thông tin (số tiền thực nhận, số tiền đơn hàng, thời gian giao dịch, mã giao dịch Tingee) để Merchant xem xét và xử lý thủ công.
- Nếu không tìm thấy đơn hàng tương ứng với Webhook: ghi log và bỏ qua (không raise error).

#### FR-13: Retry mechanism cho Webhook xử lý thất bại

Nếu Shopify Order API call thất bại sau khi đối soát thành công, hệ thống retry với backoff.

**Hệ quả (testable):**
- Retry tối thiểu 3 lần với exponential backoff (1s, 5s, 30s).
- Sau 3 lần thất bại: đơn được đánh dấu cần xử lý thủ công; ghi log đầy đủ.
- Không mất thông tin Webhook trong quá trình retry.

#### FR-14: Cập nhật trạng thái đơn hàng trên Shopify

Sau khi Exact Amount Match thành công, hệ thống cập nhật đơn hàng Shopify sang Paid.

**Hệ quả (testable):**
- Shopify Order API được gọi với transaction type `capture` hoặc `sale` phù hợp với Manual Payment Method.
- Đơn hàng hiển thị trạng thái "Paid" trong Shopify Admin của Merchant.
- Shopify trigger email xác nhận đơn hàng cho Người mua (hành vi mặc định của Shopify, không cần xử lý từ app).

---

## 5. Non-Goals (Phase 1)

- **Onboarding tạo tài khoản Tingee** — Merchant phải có Credential trước khi cài app.
- **QR trong checkout step** — Yêu cầu Shopify Payments Partner approval; đây là Phase 2.
- **Dashboard báo cáo giao dịch** — Tingee portal đã cung cấp tính năng này.
- **Hỗ trợ đa ngôn ngữ ngoài tiếng Việt và tiếng Anh** — Locale detection chỉ xử lý `vi` và fallback `en`.
- **Virtual Account, Direct Debit, Subscription** — Xem xét sau Phase 1.
- **Thông báo riêng cho Merchant khi có giao dịch pending** — Merchant nhận thông tin qua Order Note trong Shopify Admin (FR-12); thông báo proactive qua email/push là v1.1.
- **Shopify POS** — Chỉ hỗ trợ online storefront.
- **Multi-store configuration** — Mỗi lần install là một store độc lập.

---

## 6. Phạm vi MVP

### 6.1 Trong scope
- Cài đặt app từ Shopify App Store (OAuth)
- Admin Surface: một màn hình cấu hình Credential, hiển thị trạng thái kết nối
- Tự động đăng ký Manual Payment Method "Thanh toán qua Tingee QR"
- Order Status Extension: Static QR + Deeplink (mobile) + polling trạng thái
- Backend: tạo Static QR, tạo Deeplink qua Tingee API
- Webhook handler: xác thực HMAC, Exact Amount Match, retry
- Tự động cập nhật đơn hàng Shopify sang Paid
- Xử lý uninstall và cleanup dữ liệu

### 6.2 Ngoài scope cho MVP
- QR trong checkout modal (Phase 2 — cần Shopify Payments Partner)
- Merchant notification cho pending orders (v1.1)
- Dashboard giao dịch trong app (đã có Tingee portal)
- Onboarding tạo tài khoản Tingee mới
- Shopify POS support
- Dynamic QR (quyết định dùng Static QR cho Phase 1)

---

## 7. Success Metrics

**Primary**

- **SM-1: Thời gian setup** — Từ click Install đến phương thức thanh toán hiển thị tại checkout ≤ 5 phút. Validates FR-1, FR-3, FR-4.

- **SM-2: Tỷ lệ auto-confirm** — ≥ 95% giao dịch Webhook hợp lệ được tự động cập nhật Paid trong vòng 60 giây kể từ khi webhook nhận. Validates FR-12, FR-13, FR-14.

- **SM-3: Zero lost orders** — 0 đơn hàng bị mất do webhook failure sau khi retry đầy đủ. Validates FR-13.

**Secondary**

- **SM-4: Merchant adoption** — 100 lượt cài đặt active trong 6 tháng đầu sau launch.

- **SM-5: Tỷ lệ lỗi Deeplink** — < 5% lần nhấn Deeplink dẫn đến lỗi (app không mở được); fallback QR phải kích hoạt đúng. Validates FR-9.

**Counter-metrics (không tối ưu)**

- **SM-C1: Pending rate không được tối ưu bằng cách nới lỏng Exact Amount Match** — Tỷ lệ pending orders do amount mismatch là dữ liệu để cải thiện UX (hướng dẫn người dùng không sửa số tiền), không phải lý do để bỏ rule. Counterbalances SM-2.

---

## 8. NFR Cross-cutting

### Bảo mật
- Secret Token được lưu mã hóa (AES-256 hoặc tương đương) tại backend; không bao giờ log hay trả về client.
- Mọi Webhook từ Tingee được xác thực HMAC-SHA512 trước khi xử lý (FR-11).
- Backend endpoint nhận Webhook phải rate-limit để chống flood (≥ 1000 request/phút từ cùng IP → throttle).
- App tuân thủ Shopify App Security Requirements: HTTPS only, CSP headers.

### Độ tin cậy
- Webhook handler phải trả response trong vòng 5 giây (Tingee IPN timeout).
- Retry mechanism đảm bảo không mất giao dịch đã được Tingee xác nhận (FR-13).
- Order Status Extension tiếp tục hoạt động khi Tingee API chậm — QR và Deeplink được tạo một lần tại thời điểm đặt hàng, không re-fetch khi render.

### Performance
- Admin Surface load < 2 giây trên kết nối 4G thông thường.
- Order Status Extension không làm chậm trang Order Status > 500ms (render non-blocking).
- Polling interval: 5 giây; không dùng websocket trong Phase 1.

### Shopify App Store Compliance
- App phải pass Shopify App Review trước khi list công khai.
- Tuân thủ Shopify API versioning policy; sử dụng API version 2025-07 trở lên.
- GDPR webhooks được xử lý: `customers/data_request`, `customers/redact`, `shop/redact`.

---

## 9. Tích hợp & Dependencies

| Dependency | Vai trò | Constraint |
|---|---|---|
| Tingee SDK (`@tingee/sdk-node`) | Tạo QR, Deeplink, xác thực Webhook | Node.js ≥ 18; project dùng 22.12+ |
| Tingee IPN / Webhook | Nhận thông báo giao dịch real-time | Response trong 5 giây |
| Shopify Admin API | Đăng ký payment method, cập nhật order | API version ≥ 2025-07 |
| Shopify Checkout UI Extension | Order Status Extension (Buyer Surface) | Phải pass Shopify Extension review |
| Shopify App Store | Distribution channel | App Review: 1–7 ngày làm việc |

---

## 10. Open Questions

*Không còn open question nào — tất cả đã được quyết định.*

---

## 11. Assumptions Index

- **[ASSUMPTION] FR-6 / UJ-1** — App được list công khai trên Shopify App Store từ ngày launch. *Nếu launch theo invite-only link trước, FR-1 install flow vẫn giữ nguyên nhưng discovery story thay đổi.*
- **[ASSUMPTION] FR-7** — User-agent detection đủ để phân biệt mobile/desktop cho việc hiển thị Deeplink button. *Nếu không đủ chính xác, cần viewport detection thay thế.*
- **[ASSUMPTION] FR-9** — Tingee Deeplink API khả dụng và stable đủ để dùng production. *Cần confirm với Tingee team về SLA của endpoint này.*
