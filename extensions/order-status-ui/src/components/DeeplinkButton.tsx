import { useRef, useEffect } from "react";
import { t } from "../utils/i18n";
import { openDeeplink } from "../utils/deeplink";

type Props = {
  deeplinkUrl: string | null;
  amount: number;
  locale: string;
  isMobile: boolean;
  onFallback?: () => void;
};

export function DeeplinkButton({ deeplinkUrl, amount, locale, isMobile, onFallback }: Props) {
  const isMountedRef = useRef(true);
  const cleanupRef = useRef<(() => void) | null>(null);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cleanupRef.current?.();
    };
  }, []);

  if (!isMobile || !deeplinkUrl) return null;

  const formattedAmount = new Intl.NumberFormat("vi-VN").format(amount);
  const ariaLabel = locale.startsWith("vi")
    ? `Mở app ngân hàng để thanh toán ${formattedAmount} đồng`
    : `Open bank app to pay ${formattedAmount} đồng`;

  const handleClick = () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    cleanupRef.current?.();
    cleanupRef.current = openDeeplink(deeplinkUrl, () => {
      isProcessingRef.current = false;
      cleanupRef.current = null;
      if (isMountedRef.current) onFallback?.();
    });
  };

  return (
    <button
      className="tng-deeplink-btn"
      onClick={handleClick}
      aria-label={ariaLabel}
    >
      {t("openBankApp", locale)}
    </button>
  );
}
