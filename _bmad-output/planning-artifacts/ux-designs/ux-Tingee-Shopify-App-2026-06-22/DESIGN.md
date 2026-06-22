---
name: Tingee Payment App for Shopify
description: >
  Shopify embedded app (Polaris) for merchant configuration, plus a buyer-facing
  Order Status Extension that renders inside the merchant's storefront theme.
  Two surfaces, one brand layer: Tingee red on a clean, trust-signals-first aesthetic.
status: draft
created: 2026-06-22
updated: 2026-06-22
sources:
  - planning-artifacts/briefs/brief-Tingee-Shopify-App-2026-06-22/brief.md
colors:
  # Brand layer. Admin surface inherits Polaris semantic tokens except where overridden.
  # Buyer surface uses these tokens directly (theme-agnostic component).
  brand: '#e12a41'
  brand-foreground: '#FFFFFF'
  brand-dark: '#ff4d63'
  brand-foreground-dark: '#FFFFFF'

  # Derived from brand for interactive states
  brand-hover: '#c4223a'         # 10% darker
  brand-active: '#a81b30'        # 20% darker
  brand-subtle: '#fdeaec'        # tint for backgrounds, badges
  brand-subtle-foreground: '#a81b30'

  # Buyer surface neutrals (theme-agnostic — must sit cleanly on any Shopify theme)
  surface: '#FFFFFF'
  surface-dark: '#1a1a1a'
  border: '#e0e0e0'
  border-dark: '#3a3a3a'
  muted-text: '#6b6b6b'
  muted-text-dark: '#a0a0a0'

  # Status colors (buyer surface)
  success: '#008060'             # Shopify green — universal trust signal
  success-foreground: '#FFFFFF'
  success-subtle: '#e3f1ec'
  pending: '#f59e0b'
  pending-foreground: '#FFFFFF'
  pending-subtle: '#fef3c7'

typography:
  # [ASSUMPTION] Inter — aligns with Polaris default; widely available; clean at all sizes
  base:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.02em
  heading:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.3'
  display:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  mono:
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace"
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'

rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px

spacing:
  # 4-based scale
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px

components:
  # --- Admin surface (Polaris-hosted) ---
  # Polaris renders most components. Only brand-layer overrides defined here.
  admin-primary-button:
    background: '{colors.brand}'
    foreground: '{colors.brand-foreground}'
    radius: '{rounded.md}'
    hover-background: '{colors.brand-hover}'
    active-background: '{colors.brand-active}'
    # All other Polaris Button props (padding, font, focus ring) inherit from Polaris

  admin-connection-badge-connected:
    background: '{colors.success-subtle}'
    foreground: '{colors.success}'
    radius: '{rounded.full}'
    fontFamily: '{typography.label.fontFamily}'
    fontSize: '{typography.label.fontSize}'

  admin-connection-badge-disconnected:
    background: '{colors.brand-subtle}'
    foreground: '{colors.brand-subtle-foreground}'
    radius: '{rounded.full}'

  # --- Buyer surface (theme-agnostic Order Status Extension) ---
  buyer-payment-card:
    background: '{colors.surface}'
    border: '1px solid {colors.border}'
    radius: '{rounded.lg}'
    padding: '{spacing.lg}'
    # Dark mode
    background-dark: '{colors.surface-dark}'
    border-dark: '1px solid {colors.border-dark}'

  buyer-qr-container:
    background: '#FFFFFF'          # Always white — QR codes require white background
    border: '1px solid {colors.border}'
    radius: '{rounded.md}'
    padding: '{spacing.sm}'
    size: '200px'                  # 200×200 minimum for reliable scanning

  buyer-deeplink-button:
    background: '{colors.brand}'
    foreground: '{colors.brand-foreground}'
    radius: '{rounded.md}'
    padding: '{spacing.sm} {spacing.lg}'
    fontWeight: '600'
    fontSize: '{typography.base.fontSize}'
    hover-background: '{colors.brand-hover}'

  buyer-status-badge-paid:
    background: '{colors.success-subtle}'
    foreground: '{colors.success}'
    radius: '{rounded.full}'

  buyer-status-badge-pending:
    background: '{colors.pending-subtle}'
    foreground: '{colors.pending}'
    radius: '{rounded.full}'

  buyer-countdown-timer:
    fontFamily: '{typography.mono.fontFamily}'
    fontSize: '{typography.label.fontSize}'
    foreground: '{colors.muted-text}'

  buyer-amount-display:
    fontSize: '{typography.display.fontSize}'
    fontWeight: '{typography.display.fontWeight}'
    foreground: '{colors.brand}'
---

## Brand & Style

Tingee Payment App phục vụ hai nhóm người dùng với ngữ cảnh tâm lý hoàn toàn khác nhau:

**Merchant (Admin):** Đang trong môi trường Shopify Admin — quen với Polaris. Họ cần cấu hình nhanh, tự tin rằng mọi thứ đang hoạt động, và không muốn bị phân tâm. Ngôn ngữ thị giác: gọn gàng, chuyên nghiệp, tin cậy. Màu brand chỉ xuất hiện ở primary action và badge trạng thái kết nối.

**Buyer (Storefront):** Đang trong bước cuối của quá trình mua hàng — có thể lo lắng về tiền. Họ cần thấy ngay: bao nhiêu tiền, thanh toán bằng cách nào, và xác nhận rằng thanh toán đã thành công. Ngôn ngữ thị giác: QR code to và rõ, action button nổi bật, feedback trạng thái tức thì. Không có yếu tố thị giác nào gây phân tán.

Màu `#e12a41` (Tingee Red) là màu brand duy nhất — dùng cho primary action và highlights. Không dùng decoratively. Mọi thứ còn lại là neutral để không xung đột với theme của merchant.

## Colors

**Tingee Red (`#e12a41`)** là màu brand chủ đạo. Xuất hiện tại:
- Admin: Primary button "Lưu cài đặt", liên kết badge connected/disconnected
- Buyer: Số tiền cần thanh toán, Deeplink CTA button, accent toàn bộ payment card

**Success Green (`#008060`)** — màu Shopify standard — dùng cho trạng thái "Đã thanh toán". Người dùng Việt quen với màu xanh = thành công, đỏ = lỗi.

**Buyer neutrals** phải work trên nền trắng, xám, hoặc bất kỳ màu nền nào của Shopify theme (Dawn, Refresh, v.v.). Không dùng màu nền có màu sắc cho buyer card — chỉ dùng trắng với border.

Dark mode: Admin inherits Polaris dark mode. Buyer surface cung cấp dark variant nhưng `buyer-qr-container` luôn giữ nền trắng để QR scan được.

## Typography

Inter cho toàn bộ — aligns với Polaris default, clean, legible ở mọi kích thước. Không cần display font riêng cho sản phẩm này; hierarchy được tạo bởi weight và size, không phải font.

`mono` (JetBrains Mono) chỉ dùng cho countdown timer — phân biệt rõ với text thông thường và đọc dễ khi đếm ngược.

## Layout & Spacing

**Admin surface:** Inherits Polaris layout system (Page, Card, Layout, Stack). Content width: Polaris default (không override). Responsive handled by Polaris.

**Buyer surface (Order Status Extension):** Single column, max-width `480px`, centered trong container của Shopify. Không dùng multi-column — payment là tác vụ tập trung. Padding `{spacing.lg}` (24px) trong card.

QR code luôn xuất hiện ở phần trên fold — người dùng không nên phải scroll để thấy QR.

## Elevation & Depth

**Admin:** Polaris elevation tokens. Không thêm custom shadow.

**Buyer card:** `box-shadow: 0 1px 3px rgba(0,0,0,0.08)` — đủ để tách card khỏi nền theme mà không quá nặng. Trên nền trắng thuần, box-shadow tự giảm đến không thấy — border đủ để phân cách.

## Shapes

Rounded corners nhất quán: `md` (8px) cho cards và buttons, `full` cho status badges, `sm` (4px) cho inner elements. QR container dùng `md` để QR không bị che khuất bởi border-radius.

## Components

Xem YAML frontmatter phía trên. Polaris components trong Admin surface không được override về hình dạng — chỉ override màu brand layer. Buyer surface components là standalone CSS classes, không phụ thuộc framework.

## Do's and Don'ts

**Do:**
- Dùng `#e12a41` cho primary CTA và thông tin quan trọng nhất (số tiền)
- Giữ buyer card đơn giản: QR → số tiền → deeplink button → status
- Hiển thị trạng thái loading/pending ngay khi buyer đến trang (polling bắt đầu ngay)
- Dùng `#008060` cho confirmation — tín hiệu trust phổ biến nhất với người Việt
- Đảm bảo QR container luôn có nền trắng dù theme tối hay sáng

**Don't:**
- Đừng dùng `#e12a41` làm màu nền cho buyer card — quá nặng, che khuất QR
- Đừng đặt bất kỳ element nào giữa QR và deeplink button — user cần thấy hai lựa chọn cạnh nhau
- Đừng override Polaris component shapes trong Admin — breaks Shopify UX consistency
- Đừng thêm animation trên buyer surface — payment context không phải chỗ cho flourish
- Đừng dùng font size dưới 12px cho bất kỳ text nào — nhiều người dùng Việt truy cập qua mobile
