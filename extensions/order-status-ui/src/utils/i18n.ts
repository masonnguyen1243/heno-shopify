const translations = {
  vi: {
    loading: "Đang tải...",
    payWith: "Thanh toán qua Tingee QR",
    openBankApp: "Mở app ngân hàng",
    paid: "Đã thanh toán ✓",
    pending: "Chờ thanh toán",
    expired: "Mã QR đã hết hạn",
    expiredMessage: "Mã QR đã hết hạn sau 15 phút.",
    backToStore: "Quay lại cửa hàng",
    qrAltText: (amount: string) => `Mã QR thanh toán ${amount} đồng qua Tingee`,
    checkingConnection: "Đang kiểm tra kết nối...",
    paidConfirmMessage: "Đơn hàng của bạn đã được xác nhận. Cảm ơn!",
    timeoutMessage: "Chưa nhận được xác nhận thanh toán. Nếu bạn đã thanh toán, đơn hàng sẽ được xác nhận trong vài phút.",
    contactSupport: "Liên hệ hỗ trợ",
    paymentUnavailableTitle: "Không thể tải mã thanh toán",
    paymentUnavailableMessage: "Đơn hàng của bạn đã được ghi nhận. Chúng tôi đang gặp sự cố kết nối tạm thời với cổng thanh toán Tingee và chưa thể hiển thị mã QR. Vui lòng thử lại.",
    retry: "Thử lại",
  },
  en: {
    loading: "Loading...",
    payWith: "Pay with Tingee QR",
    openBankApp: "Open bank app",
    paid: "Paid ✓",
    pending: "Awaiting payment",
    expired: "QR code expired",
    expiredMessage: "QR code expired after 15 minutes.",
    backToStore: "Back to store",
    qrAltText: (amount: string) => `QR code to pay ${amount} đ via Tingee`,
    checkingConnection: "Checking connection...",
    paidConfirmMessage: "Your order has been confirmed. Thank you!",
    timeoutMessage: "Payment confirmation not yet received. If you've already paid, your order will be confirmed in a few minutes.",
    contactSupport: "Contact support",
    paymentUnavailableTitle: "We couldn't load your payment code",
    paymentUnavailableMessage: "Your order has been placed successfully. We're having a temporary issue connecting to the Tingee payment gateway, so we can't show your QR code right now. Please try again.",
    retry: "Try again",
  },
};

type TranslationKey = keyof typeof translations.en;

export function t(key: TranslationKey, locale: string): string {
  const lang = locale.startsWith("vi") ? "vi" : "en";
  const value = translations[lang][key];
  if (typeof value === "function") {
    return value("");
  }
  return value;
}

export function tWithArgs(
  key: "qrAltText",
  locale: string,
  amount: string
): string {
  const lang = locale.startsWith("vi") ? "vi" : "en";
  return translations[lang].qrAltText(amount);
}
