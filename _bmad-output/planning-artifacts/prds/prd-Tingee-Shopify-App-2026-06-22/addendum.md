---
title: "Addendum — PRD Tingee Payment App for Shopify"
prd: "prd.md"
created: 2026-06-22
updated: 2026-06-22
corrections:
  - "FR-13: Retry từ Tingee là 5 lần (không phải 3 như PRD §4.4 mô tả)"
---

# Addendum: Tingee Payment App — Technical & Contextual Depth

## Cơ chế xác thực Tingee SDK

HMAC-SHA512 tự động qua SDK. Headers required:
- `x-client-id` — Client ID của merchant
- `x-signature` — HMAC-SHA512(payload, secret_token)
- `x-request-timestamp` — Unix timestamp (ms) tại thời điểm request

## Tingee Webhook — Payload & Idempotency (confirmed từ docs 2026-06-22)

**Payload fields:**

| Field | Type | Mô tả |
|---|---|---|
| `clientId` | string | Client ID của merchant |
| `transactionCode` | string | **Unique transaction ID — idempotency key chính thức** |
| `amount` | number | Số tiền thực tế thanh toán |
| `content` | string | Nội dung chuyển khoản |
| `bank` | string | Tên ngân hàng |
| `accountNumber` | string | Số tài khoản nhận |
| `vaAccountNumber` | string | Virtual account (nếu có) |
| `transactionDate` | string | Timestamp `yyyyMMddHHmmss` |
| `additionalData` | array | Dữ liệu bổ sung (có `billId` cho dynamic QR) |

**Headers quan trọng:**

| Header | Mô tả |
|---|---|
| `x-signature` | `HMAC_SHA512(x-request-timestamp + ":" + json_body, secretToken)` |
| `x-request-timestamp` | Timestamp gửi (`yyyyMMddHHmmssSSS`, UTC+7) |
| `x-request-id` | UUID duy nhất của từng webhook request |

**Idempotency:** Tingee khuyến nghị dùng `transactionCode` để detect duplicate. Dùng làm key: `tingee:{transactionCode}`.

**Retry behavior:** Tingee retry tối đa **5 lần** (PRD FR-13 ghi sai là 3 lần — đã correction trong frontmatter).

**CORRECTION — FR-13:** PRD §4.4 mô tả retry 3 lần (1s/5s/30s). Thực tế Tingee retry 5 lần. App backend phải handle idempotency cho đủ 5 lần retry, không phải 3.

SDK Node.js: `@tingee/sdk-node`, yêu cầu Node.js ≥ 18. Dự án dùng Node.js 22.12+ (theo Shopify CLI requirement) — tương thích.

## Tingee QR: Static vs Dynamic

| Loại | Phù hợp | Reconciliation |
|------|---------|---------------|
| Static QR | Small retailers, in-store | Theo số tiền thực nhận + nội dung + timestamp |
| Dynamic QR | E-commerce, POS | Theo `billId`/`orderId` — 100% chính xác |

**Quyết định của dự án:** Static QR (DL-001). Reconciliation rule: exact amount match (DL-002).

Một số ngân hàng (MBBank và tương tự) cho phép user chỉnh số tiền khi quét Static QR — đây là trade-off đã được PM chấp nhận.

## Tingee Deeplink

- Endpoint: `/v1/deep-link/generate`
- Chỉ hỗ trợ mobile (mở app ngân hàng trực tiếp)
- **Không thể tự xác nhận giao dịch** — deeplink chỉ redirect, kết quả transaction phải verify qua Webhook
- Desktop fallback: ẩn nút Deeplink, chỉ hiện QR

## SePay — Bối cảnh cạnh tranh

- SePay dùng ScriptTag injection — Shopify đã ngừng hỗ trợ từ 10/02/2025 cho integration mới
- ScriptTag bị khai tử hoàn toàn tháng 8/2026 → SePay phải rebuild toàn bộ
- Đây là cửa sổ cơ hội để Tingee Payment App chiếm thị phần từ merchant SePay
- Fundiin (BNPL) là minh chứng provider Việt Nam có thể hoàn tất Shopify Payments Partner approval

## Lộ trình Shopify Payments Partner (Phase 2)

1. Đăng ký Shopify Partner tại partners.shopify.com
2. Liên hệ Shopify Partnerships team trực tiếp (không có form công khai)
3. Ký revenue share: 0% cho $1M đầu tiên/năm, 15% sau đó
4. Yêu cầu kỹ thuật: PCI DSS compliance, uptime SLA 99.95%, mutual TLS, HMAC verification
5. Submit app qua 2 vòng review
6. Timeline dự kiến: 4–12 tuần
7. Sau approve: app ở trạng thái "Hidden" — share install link trực tiếp cho merchant

## Phase 2 Technical Reference

- `paymentSessionModal` GraphQL mutation (Shopify API 2025-07+) để hiển thị QR trong checkout modal
- Yêu cầu Shopify Payments Partner status

## Tầm nhìn dài hạn

Nếu Phase 1 thành công → mở rộng sang Phase 2 (checkout modal) → tiếp tục với Virtual Account, Direct Debit, Subscription → phục vụ merchant Shopify tại Việt Nam và Đông Nam Á nơi Tingee hoạt động.
