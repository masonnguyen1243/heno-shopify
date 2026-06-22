---
title: "Product Brief: Tingee Payment App for Shopify"
status: draft
created: 2026-06-22
updated: 2026-06-22
---

# Product Brief: Tingee Payment App for Shopify

## Tóm tắt

Tingee Payment App là ứng dụng Shopify miễn phí cho phép merchant tích hợp thanh toán qua QR Code và Deeplink của nền tảng Tingee vào cửa hàng Shopify của họ. Sau khi cài đặt và cấu hình Client ID và Secret Token, người mua hàng sẽ thấy tùy chọn "Thanh toán qua Tingee" ở trang xác nhận đơn hàng — hiển thị mã QR và Deeplink để hoàn tất thanh toán qua ngân hàng. Khi giao dịch thành công, webhook Tingee tự động cập nhật trạng thái đơn hàng trên Shopify.

App được xây dựng theo lộ trình 2 giai đoạn: Phase 1 ra mắt ngay trên Shopify App Store với flow Order Status page (không yêu cầu Shopify Payments Partner approval); Phase 2 nâng cấp lên checkout modal QR khi Tingee/HENO hoàn tất quá trình đăng ký Shopify Payments Partner chính thức.

## Vấn đề

Hàng ngàn merchant Việt Nam đang vận hành cửa hàng Shopify nhưng không có phương thức thanh toán nội địa phù hợp. Shopify Payments không khả dụng tại Việt Nam. Khách hàng người Việt quen thanh toán qua QR VietQR hoặc app ngân hàng — không phải thẻ tín dụng quốc tế.

Hiện tại, merchant phải chọn một trong hai cách đều có vấn đề:

- **Dùng giải pháp bên thứ ba như SePay:** Phụ thuộc vào ScriptTag injection — một cơ chế Shopify đã chặn từ tháng 2/2025 và sẽ khai tử hoàn toàn tháng 8/2026. Đây là hướng đi không bền vững.
- **Không tích hợp gì:** Merchant hướng dẫn khách chuyển khoản thủ công, xác nhận đơn bằng tay — mất thời gian, dễ sai sót, trải nghiệm tệ.

Với merchant đã sử dụng nền tảng Tingee, họ có sẵn hạ tầng thanh toán nhưng không có cách nào đưa nó vào Shopify một cách dễ dàng và bền vững.

## Giải pháp

Tingee Payment App kết nối nền tảng Tingee với Shopify thông qua các API chính thức — không dùng script injection.

**Luồng Phase 1 (ra mắt ngay):**
1. Merchant cài app từ Shopify App Store → nhập Client ID và Secret Token Tingee
2. App tự động đăng ký phương thức thanh toán thủ công có tên "Thanh toán qua Tingee QR"
3. Người mua chọn phương thức này tại checkout → đặt hàng
4. Trang Order Status hiển thị QR Code Tingee và Deeplink để thanh toán
5. Người mua quét QR hoặc nhấn Deeplink → thanh toán qua app ngân hàng
6. Tingee webhook xác nhận giao dịch → app tự động cập nhật đơn hàng Shopify sang trạng thái "Paid"

**Luồng Phase 2 (sau khi được Shopify Payments Partner approval):**
- QR Code và Deeplink xuất hiện ngay trong bước checkout, không cần chờ đến trang Order Status
- Trải nghiệm liền mạch hơn, tỷ lệ bỏ giỏ hàng thấp hơn

## Phạm vi

**Phase 1 — Trong scope:**
- Cài đặt app từ Shopify App Store
- Màn hình cấu hình: nhập và lưu Client ID + Secret Token
- Đăng ký phương thức thanh toán thủ công trên Shopify
- Trang Order Status: hiển thị QR Code Tingee và Deeplink
- Backend: tạo payment request qua Tingee SDK, nhận và xử lý webhook
- Tự động cập nhật trạng thái đơn hàng Shopify khi thanh toán thành công
- Hỗ trợ cả QR Code và Deeplink

**Phase 1 — Ngoài scope:**
- Onboarding tạo tài khoản Tingee mới (merchant phải có sẵn credential)
- QR trong bước checkout (cần Payments Partner approval — Phase 2)
- Hỗ trợ đa ngôn ngữ ngoài tiếng Việt và tiếng Anh
- Dashboard báo cáo giao dịch (Tingee đã có portal riêng)
- Virtual Account hoặc Direct Debit (xem xét sau)

## Điểm khác biệt

**Xây dựng trên nền tảng bền vững.** SePay và các giải pháp tương tự dùng ScriptTag — một cơ chế Shopify đang khai tử. Tingee Payment App xây dựng trên các API chính thức của Shopify, đảm bảo hoạt động lâu dài.

**Tích hợp sẵn hạ tầng Tingee.** Merchant đã dùng Tingee không cần thiết lập gì thêm ngoài việc nhập credential — không cần tài khoản ngân hàng riêng, không cần tích hợp bên thứ ba.

**Cả QR lẫn Deeplink.** Hỗ trợ cả hai phương thức trong một app — người mua trên mobile dùng Deeplink mở thẳng app ngân hàng; người mua trên desktop quét QR.

**Miễn phí.** Không có phí subscription hay phí giao dịch từ phía app — Tingee đã thu phí từ dịch vụ của mình.

## Đối tượng sử dụng

**Người dùng chính — Merchant Shopify tại Việt Nam:**
- Có tài khoản Tingee (cả mới đăng ký lẫn đã sử dụng lâu dài) và muốn tích hợp vào cửa hàng Shopify
- Vận hành cửa hàng thương mại điện tử trên Shopify
- Khách hàng chủ yếu là người Việt, quen thanh toán qua QR/ngân hàng
- Đang phải xác nhận đơn hàng thủ công hoặc dùng giải pháp tạm

**Người dùng cuối — Người mua hàng:**
- Người mua tại Việt Nam sử dụng app ngân hàng để thanh toán
- Quen với giao diện VietQR, không quen hoặc không có thẻ quốc tế
- Trên mobile: ưu tiên Deeplink (mở thẳng app ngân hàng)
- Trên desktop: quét QR bằng điện thoại

## Tiêu chí thành công

- **Cài đặt và cấu hình dưới 5 phút** — merchant nhập Client ID + Secret Token, xong
- **Tỷ lệ xác nhận tự động ≥ 95%** — đo trên mỗi tháng vận hành; webhook Tingee cập nhật đúng đơn hàng mà không cần can thiệp thủ công
- **Không mất đơn hàng do webhook delay** — hệ thống có cơ chế retry khi webhook thất bại
- **Merchant adoption:** Mục tiêu 100 cài đặt trong 6 tháng đầu
