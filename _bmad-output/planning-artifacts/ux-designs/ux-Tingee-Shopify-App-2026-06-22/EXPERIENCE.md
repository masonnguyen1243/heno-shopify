---
name: Tingee Payment App for Shopify
status: draft
created: 2026-06-22
updated: 2026-06-22
sources:
  - planning-artifacts/briefs/brief-Tingee-Shopify-App-2026-06-22/brief.md
  - DESIGN.md
---

# Tingee Payment App — Experience Spine

## Foundation

**Hai bề mặt độc lập, một sản phẩm:**

| Bề mặt | Môi trường | UI System | Người dùng |
|---|---|---|---|
| **Admin** | Shopify Admin (embedded app) | Shopify Polaris | Merchant |
| **Buyer** | Shopify Storefront (Order Status Extension) | Standalone CSS — theme-agnostic | Người mua |

Admin surface là Shopify embedded app chạy trong iframe của Shopify Admin. Mọi layout, navigation, và component pattern phải tuân thủ Polaris — Shopify review team kiểm tra điều này. Không dùng custom nav bar, không dùng custom modal bên ngoài Polaris Modal.

Buyer surface là Shopify Order Status Page Extension — một block được inject vào trang `/orders/[token]` sau khi người mua đặt hàng thành công với phương thức "Thanh toán qua Tingee QR". Extension này render bên trong merchant's Shopify theme; không thể kiểm soát màu nền, font chữ hay layout toàn trang. Component phải tự chứa và không xung đột.

Form-factor: **Web, responsive.** Admin: desktop-first (merchants thường quản lý qua desktop). Buyer: mobile-first (người Việt mua hàng qua điện thoại là chủ yếu, và deeplink chỉ có nghĩa trên mobile).

Visual identity: xem `DESIGN.md`.

## Information Architecture

### Admin Surface

| Screen | URL / entry point | Mục đích |
|---|---|---|
| App Index / Settings | `/apps/tingee-payment` | Màn hình duy nhất của admin: cấu hình credential và xem trạng thái kết nối |

App chỉ có một màn hình — đủ cho Phase 1. Không có navigation nội bộ. Sau khi install từ App Store, Shopify redirect thẳng vào đây.

### Buyer Surface

| Screen | Entry point | Mục đích |
|---|---|---|
| Order Status Extension | `/orders/[token]` — injected block | Hiển thị QR, deeplink, số tiền, và theo dõi trạng thái thanh toán |

Extension xuất hiện như một block nổi bật trong trang Order Status của Shopify, bên trên thông tin đơn hàng tiêu chuẩn.

## Voice and Tone

Microcopy. Brand voice và aesthetic posture trong `DESIGN.md`.

**Merchant (Admin):**

| Dùng | Không dùng |
|---|---|
| "Kết nối thành công" | "Tích hợp đã được thiết lập!" |
| "Client ID không hợp lệ" | "Có lỗi xảy ra. Vui lòng thử lại." |
| "Lưu cài đặt" | "Áp dụng thay đổi" |
| "Chưa kết nối — nhập credential để bắt đầu" | "Bạn chưa cấu hình ứng dụng" |
| Ngắn, trực tiếp, không hoa mỹ | Dấu chấm than, emoji, ngôn ngữ marketing |

**Buyer (Storefront):**

| Dùng | Không dùng |
|---|---|
| "Quét QR để thanh toán" | "Vui lòng sử dụng ứng dụng ngân hàng của bạn để quét mã QR này" |
| "Mở app ngân hàng" | "Nhấn vào đây để mở ứng dụng ngân hàng của bạn" |
| "Đang chờ xác nhận..." | "Hệ thống đang xử lý giao dịch của bạn" |
| "Thanh toán thành công ✓" | "Giao dịch của bạn đã được xác nhận thành công!" |
| Ngắn, rõ, không để người dùng phải đoán | Câu dài, bị động, jargon kỹ thuật |

Ngôn ngữ mặc định: **Tiếng Việt**. Phát hiện locale từ Shopify `shop.primary_locale`; fallback sang tiếng Anh nếu không phải `vi`.

## Component Patterns

Behavioral. Visual specs trong `DESIGN.md.Components`.

### Admin Surface

| Component | Dùng khi | Behavioral rules |
|---|---|---|
| Polaris `Page` | Toàn bộ admin screen | Title: "Cài đặt Tingee Payment". Không có secondary actions ở Phase 1. |
| Polaris `Card` (x2) | Credential section + Connection status section | Card 1: nhập Client ID, Secret Token. Card 2: trạng thái kết nối realtime. |
| Polaris `TextField` | Client ID, Secret Token | Secret Token field: `type="password"`, toggle reveal. Không autofill. Label rõ ràng, không placeholder-as-label. |
| Polaris `Button` primary | "Lưu cài đặt" | Disabled khi fields trống. Loading state khi đang gọi API. |
| Polaris `Badge` | Connection status | "Đã kết nối" (success) / "Chưa kết nối" (critical) — màu theo `DESIGN.md.admin-connection-badge-*`. |
| Polaris `Banner` | Lỗi lưu, lỗi kết nối | `status="critical"` cho lỗi, `status="success"` cho lưu thành công. Auto-dismiss sau 5s trên success. |
| Polaris `Spinner` | Đang kiểm tra kết nối | Xuất hiện khi save đang gọi Tingee API để verify credential. |

### Buyer Surface

| Component | Dùng khi | Behavioral rules |
|---|---|---|
| Payment Card | Luôn hiển thị | Container chính, `DESIGN.md.buyer-payment-card`. Chứa toàn bộ UI thanh toán. |
| QR Code Image | Trạng thái Pending | `<img>` từ Tingee API. Alt text: "Mã QR thanh toán Tingee". Width/height cố định 200px. Không scale xuống dưới 160px trên mobile. |
| Amount Display | Luôn hiển thị | Số tiền từ order. Format: `1.500.000 đ` (không dùng VND, dùng đ — quen thuộc hơn với người Việt). Style: `DESIGN.md.buyer-amount-display`. |
| Deeplink Button | Mobile viewport (`max-width: 767px`) | Hiển thị nổi bật trên mobile thay thế cho QR. Label: "Mở app ngân hàng". `href`: deeplink URL từ Tingee. Opens in same tab (deeplink protocol). |
| Countdown Timer | Trạng thái Pending, nếu QR có expiry | `mm:ss` format. Mono font. Khi hết giờ: auto-refresh QR, không cần user action. |
| Status Badge | Luôn hiển thị | States: Pending / Đã thanh toán / Hết hạn / Lỗi. |
| Refresh Button | Trạng thái Pending | Secondary — người dùng muốn check thủ công. Hiển thị nhỏ bên cạnh status badge. |

## State Patterns

### Admin Surface

| State | Trigger | Treatment |
|---|---|---|
| Empty / Fresh install | Lần đầu vào app | Fields trống, Badge "Chưa kết nối", Banner hướng dẫn ngắn: "Nhập Client ID và Secret Token từ portal Tingee để bắt đầu." |
| Saving | User nhấn "Lưu cài đặt" | Button → loading spinner, fields disabled. Polaris Spinner trong Connection Status card. |
| Save success + Connected | Tingee API verify OK | Banner success (auto-dismiss 5s), Badge → "Đã kết nối". Fields giữ nguyên giá trị (không clear). |
| Save error — invalid credential | Tingee API trả lỗi auth | Banner critical: "Client ID hoặc Secret Token không đúng. Kiểm tra lại trong portal Tingee." Fields không clear. |
| Save error — network | Timeout hoặc network fail | Banner critical: "Không thể kết nối đến Tingee. Kiểm tra kết nối mạng và thử lại." |
| Already configured | Quay lại settings sau khi đã lưu | Fields hiển thị giá trị đã lưu (Secret Token masked). Badge "Đã kết nối". |

### Buyer Surface

| State | Trigger | Treatment |
|---|---|---|
| Loading | Extension mount | Skeleton: QR area (200×200 gray box), amount skeleton bar. Resolve trong <2s. |
| Pending | Sau khi load, chưa có payment | QR code hiển thị. Amount hiển thị. Deeplink button (mobile). Countdown 15:00 đếm ngược. Polling mỗi 5s. |
| Paid — confirmed | Webhook received / Polling detect | QR ẩn đi. Status badge → "Đã thanh toán ✓" (green). Message: "Đơn hàng của bạn đã được xác nhận. Cảm ơn!" Không reload trang — update in-place. |
| Expired — QR hết hạn | Countdown về 0:00 | QR ẩn. Message: "Mã QR đã hết hạn sau 15 phút." Button: "Lấy mã mới" — gọi API refresh, countdown reset về 15:00, QR mới hiển thị. |
| Deeplink — in-app browser | Instagram, Facebook, Zalo WebView có thể chặn redirect sang banking app | Luôn hiển thị QR song song với deeplink button — người dùng tự chọn cách nào phù hợp. Không cần hướng dẫn thêm trừ khi Tingee xác nhận redirect bị chặn trong WebView. |
| Error — load fail | API call fail | Message: "Không thể tải thông tin thanh toán." Button: "Thử lại". Không hiển thị error code cho user. |
| Error — webhook never arrived | Timeout sau 30 phút | Message: "Chưa nhận được xác nhận thanh toán. Nếu bạn đã thanh toán, đơn hàng sẽ được xác nhận trong vài phút." Contact support link. |

## Interaction Primitives

**Admin:** Polaris handles focus management, tab order, và keyboard navigation. Không có custom keybindings.

**Buyer:** Touch-first trên mobile.
- QR Code: Tap để phóng to (lightbox đơn giản) — hữu ích khi camera khó scan
- Deeplink Button: Tap ngay → `window.location = 'tingee://payment/process?id=...'`. Tingee backend xử lý redirect sang app ngân hàng của người mua — không cần detect hay fallback. QR luôn hiển thị song song là fallback tự nhiên.
- Refresh Button: Tap — loading spinner trong 1-2s, QR refresh
- Countdown: Không interactive. Timer bắt đầu từ 15:00 khi QR load. Về 0:00 → trigger expired state tự động.

**Polling behavior:**
- Bắt đầu ngay khi extension mount
- Interval: 5 giây
- Stop khi: status = Paid, hoặc user rời trang
- Không hiển thị "đang kiểm tra..." — polling là silent; chỉ thay đổi khi có kết quả

**Desktop vs Mobile differentiation:**
- `>= 768px`: QR code chiếm phần lớn card. Deeplink button ẩn.
- `< 768px`: QR code hiển thị nhỏ hơn (optional — user có thể mở lớn). Deeplink button xuất hiện nổi bật phía trên QR.

## Accessibility Floor

**Admin (Polaris):** Polaris xử lý phần lớn a11y — focus trap trong Modal, aria-labels, keyboard navigation. Obligation của app:
- Mọi `TextField` phải có `label` prop (không dùng `placeholder` thay `label`)
- Error messages link đến field bị lỗi qua `aria-describedby`
- Badge không chỉ dùng màu để convey trạng thái — phải có text label

**Buyer (standalone):**
- QR Image: `alt="Mã QR thanh toán [amount] đồng qua Tingee"` — screen reader user hiểu được context
- Deeplink Button: `aria-label="Mở app ngân hàng để thanh toán [amount] đồng"` 
- Status changes: `aria-live="polite"` trên status badge container — screen reader announce khi status thay đổi
- Countdown: `aria-live="off"` — không announce mỗi giây (quá ồn); announce chỉ khi expire
- Contrast: Tingee Red `#e12a41` trên trắng = 4.56:1 — pass AA cho large text (18px+ hoặc 14px bold). Dùng cho amount display và button — đúng use case.
- Touch targets: Minimum 44×44px cho tất cả interactive elements

## Key Flows

### Flow 1: Merchant Setup — "Lan cài app lần đầu"

Lan là chủ cửa hàng thời trang Shopify, đang dùng Tingee cho các giao dịch offline. Cô ấy muốn khách online cũng được thanh toán qua Tingee.

1. Lan vào Shopify App Store, tìm "Tingee Payment", nhấn "Add app"
2. Shopify OAuth consent screen → Lan nhấn "Install app"
3. Redirect vào app: thấy màn hình Settings với trạng thái "Chưa kết nối" và banner hướng dẫn
4. Lan mở tab khác vào portal Tingee → copy Client ID
5. Paste vào field "Client ID" trong app
6. Làm tương tự với Secret Token — field có toggle để xem text
7. Nhấn "Lưu cài đặt" → button vào loading state
8. App verify credential với Tingee API (~1-2s)

**Climax:** Badge chuyển sang "Đã kết nối ✓" — màu xanh, rõ ràng. Banner success xuất hiện rồi tự mờ dần. Lan không cần làm thêm gì — phương thức thanh toán "Thanh toán qua Tingee QR" đã tự động xuất hiện trong checkout của cửa hàng.

---

### Flow 2: Buyer Payment — "Minh mua áo, thanh toán QR trên desktop"

Minh đang mua áo trên cửa hàng của Lan từ laptop. Anh không có thẻ quốc tế nhưng có app ngân hàng.

1. Minh chọn size, thêm vào giỏ, vào checkout
2. Ở bước payment, thấy "Thanh toán qua Tingee QR" — chọn phương thức này
3. Nhấn "Complete order" → Shopify chuyển sang trang Order Status
4. Trên trang Order Status: Extension của Tingee xuất hiện nổi bật với QR code và số tiền `450.000 đ`
5. Minh lấy điện thoại, mở app VCB, quét QR
6. App ngân hàng tự điền số tiền → Minh xác nhận thanh toán
7. Tingee nhận thanh toán, gửi webhook → app cập nhật đơn hàng Shopify

**Climax:** Trang Order Status — extension tự động cập nhật (không reload): QR ẩn đi, status badge chuyển sang "Đã thanh toán ✓" màu xanh, message "Đơn hàng của bạn đã được xác nhận." Minh thấy ngay, không cần F5.

---

### Flow 3: Buyer Payment — "Hoa mua áo, thanh toán Deeplink trên mobile"

Hoa xem Instagram shop của Lan, nhấn link, vào cửa hàng trên điện thoại.

1. Hoa chọn sản phẩm, checkout, chọn "Thanh toán qua Tingee QR"
2. Trang Order Status: Extension hiển thị với **Deeplink button nổi bật** phía trên QR
3. Hoa nhấn "Mở app ngân hàng" → điện thoại mở thẳng app Techcombank với transaction đã điền sẵn
4. Hoa xác nhận → thanh toán xong trong app ngân hàng, quay lại browser

**Climax:** Trang Order Status đã tự cập nhật (polling) — Hoa thấy "Đã thanh toán ✓" mà không cần reload. Trải nghiệm liền mạch như thanh toán native.

## Responsive & Platform

| Breakpoint | Admin | Buyer |
|---|---|---|
| `< 768px` (mobile) | Polaris handles — thường ít dùng admin trên mobile | Deeplink button nổi bật, QR optional (có thể mở lớn bằng tap) |
| `768px – 1024px` (tablet) | Polaris single-column layout | QR hiển thị đầy đủ, Deeplink button ẩn |
| `>= 1024px` (desktop) | Polaris two-column layout (nếu có nhiều hơn 1 card) | QR nổi bật, Deeplink ẩn |

**Browser support:** Shopify-supported browsers (Chrome, Safari, Firefox, Edge — last 2 versions). IE không support.

**Offline (Buyer):** Nếu mất kết nối sau khi QR đã load, QR vẫn hiển thị (đã render thành `<img>`). Polling fail silently — không báo lỗi mỗi 5s. Khi có lại kết nối, polling resume tự động.
