---
title: "Addendum — Tingee Payment App for Shopify"
brief: "brief.md"
created: 2026-06-22
---

# Addendum: Tingee Payment App for Shopify

## Tầm nhìn dài hạn

Nếu Phase 1 thành công, Tingee Payment App trở thành cầu nối chuẩn giữa nền tảng Tingee và hệ sinh thái Shopify tại Việt Nam và Đông Nam Á. Phase 2 đưa QR vào ngay trong checkout flow sau khi có Shopify Payments Partner approval. Dài hạn, app có thể mở rộng sang các phương thức khác của Tingee (Virtual Account, Direct Debit, Subscription) và phục vụ merchant Shopify trên toàn khu vực nơi Tingee có hoạt động.

## Lộ trình đăng ký Shopify Payments Partner

Để thực hiện Phase 2, HENO cần:
1. Đăng ký Shopify Partner tại partners.shopify.com (miễn phí)
2. Liên hệ trực tiếp Shopify Partnerships team để xin tham gia chương trình Payments Partner (không có form công khai)
3. Ký revenue share agreement (0% cho $1M đầu tiên/năm; 15% sau đó)
4. Đáp ứng yêu cầu kỹ thuật: PCI DSS compliance, uptime SLA 99.95%, mutual TLS, HMAC verification
5. Submit app cho 2 vòng review (Partner approval + App review)
6. Timeline dự kiến: 4–12 tuần

Sau khi được approve, app Payments Extension ở trạng thái "Hidden" — không được list công khai trên App Store, phải chia sẻ install link trực tiếp cho merchant.

## Giải pháp kỹ thuật tham khảo

- Tingee SDK dùng HMAC-SHA512 với headers: `x-client-id`, `x-signature`, `x-request-timestamp`
- Shopify Order Status page: dùng Checkout UI Extensions (thay thế ScriptTag đã deprecated)
- Webhook: Tingee IPN → backend xác thực chữ ký → gọi Shopify Order API cập nhật trạng thái
- Phase 2: `paymentSessionModal` GraphQL mutation (Shopify API 2025-07+) để hiển thị QR trong checkout modal

## Đối thủ cạnh tranh

- **SePay:** Tích hợp Shopify dùng ScriptTag — sẽ hết hiệu lực tháng 8/2026. Đây là cơ hội để Tingee chiếm thị phần khi SePay phải rebuild.
- **Fundiin:** BNPL provider đầu tiên tại Việt Nam được Shopify Payments Partner chính thức — minh chứng cho thấy provider Việt Nam có thể vượt qua quá trình approval.
