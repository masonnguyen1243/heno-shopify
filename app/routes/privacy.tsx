export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem", fontFamily: "sans-serif", lineHeight: 1.6 }}>
      <h1>Chính sách bảo mật — Tingee Payment App</h1>

      <p><strong>Cập nhật lần cuối:</strong> 22/06/2026</p>

      <h2>1. Thông tin chúng tôi thu thập</h2>
      <p>
        Tingee Payment App chỉ thu thập thông tin cần thiết để cung cấp dịch vụ thanh toán:
      </p>
      <ul>
        <li>Thông tin cửa hàng Shopify (shop domain, access token) để xác thực và xử lý đơn hàng</li>
        <li>Thông tin đơn hàng (order ID, số tiền) để tạo mã QR và xử lý thanh toán</li>
        <li>Credential Tingee (Client ID, Secret Token) được lưu mã hóa AES-256</li>
      </ul>

      <h2>2. Cách chúng tôi sử dụng thông tin</h2>
      <p>Thông tin được sử dụng để:</p>
      <ul>
        <li>Xử lý và xác nhận thanh toán qua Tingee QR</li>
        <li>Cập nhật trạng thái đơn hàng trên Shopify</li>
        <li>Đảm bảo bảo mật và ngăn chặn gian lận</li>
      </ul>

      <h2>3. Chia sẻ thông tin</h2>
      <p>
        Chúng tôi không bán hoặc chia sẻ thông tin cá nhân của khách hàng với bên thứ ba, ngoại trừ
        Tingee (nhà cung cấp dịch vụ thanh toán) để xử lý giao dịch.
      </p>

      <h2>4. Bảo mật dữ liệu</h2>
      <p>
        Secret Token được lưu trữ mã hóa AES-256. Không có thông tin nhạy cảm nào được ghi log
        hoặc trả về phía client.
      </p>

      <h2>5. Yêu cầu GDPR</h2>
      <p>
        Chúng tôi tuân thủ yêu cầu GDPR của Shopify. Khi merchant gỡ cài đặt app, toàn bộ dữ liệu
        sẽ được xóa trong vòng 48 giờ.
      </p>

      <h2>6. Liên hệ</h2>
      <p>
        Mọi câu hỏi về chính sách bảo mật, vui lòng liên hệ:{" "}
        <a href="mailto:support@tingee.vn">support@tingee.vn</a>
      </p>
    </div>
  );
}
