import { useState, useEffect } from "react";
import { tWithArgs } from "../utils/i18n";

type Props = {
  qrImageUrl: string | undefined;
  amount: number;
  locale: string;
  isMobile: boolean;
};

export function QRDisplay({ qrImageUrl, amount, locale, isMobile }: Props) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsLightboxOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen]);

  if (!qrImageUrl) return null;

  const formattedAmount = new Intl.NumberFormat("vi-VN").format(amount);
  const altText = tWithArgs("qrAltText", locale, formattedAmount);
  const zoomLabel = locale.startsWith("vi") ? "Phóng to mã QR" : "Zoom QR code";

  const qrImage = (
    <img src={qrImageUrl} alt={altText} width={200} height={200} />
  );

  return (
    <>
      {isMobile ? (
        <button
          className="tng-qr-tap-trigger"
          onClick={() => setIsLightboxOpen(true)}
          aria-label={zoomLabel}
        >
          <div className="tng-qr-container">{qrImage}</div>
        </button>
      ) : (
        <div className="tng-qr-container">{qrImage}</div>
      )}

      {isLightboxOpen && (
        <div
          className="tng-lightbox"
          onClick={() => setIsLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={zoomLabel}
        >
          <div
            className="tng-lightbox__qr-container"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={qrImageUrl} alt={altText} />
          </div>
        </div>
      )}
    </>
  );
}
