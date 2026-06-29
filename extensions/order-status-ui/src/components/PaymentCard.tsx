import { useState, useEffect, useRef, useCallback } from "react";
import { fetchTingeeData } from "../api/client";
import type { TingeeDataResponse } from "../api/client";
import type { PaymentStatus } from "../utils/constants";
import { formatVndAmount } from "../utils/formatters";
import { t } from "../utils/i18n";
import { useMobileDetect } from "../hooks/useMobileDetect";
import { usePaymentStatus } from "../hooks/usePaymentStatus";
import { QRDisplay } from "./QRDisplay";
import { DeeplinkButton } from "./DeeplinkButton";
import { StatusBadge } from "./StatusBadge";
import { CountdownTimer } from "./CountdownTimer";
import "./PaymentCard.css";

type Props = {
  orderId: string;
  amount: number;
  orderNumber: string;
  locale: string;
  financialStatus?: string;
};

type LoadState = "loading" | "loaded" | "error";

export function PaymentCard({ orderId, amount, orderNumber, locale, financialStatus }: Props) {
  const mountTimeRef = useRef(Date.now());
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [data, setData] = useState<TingeeDataResponse | null>(null);
  const [localExpired, setLocalExpired] = useState(false);
  const isMobile = useMobileDetect();
  const handleLocalExpiry = useCallback(() => setLocalExpired(true), []);

  // Must call hooks before conditional returns (React rules of hooks)
  const { status: polledStatus, paidAt, showConnectionToast } = usePaymentStatus(
    orderId,
    loadState === "loaded" ? (data?.status ?? null) : null
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchTingeeData(orderId, amount, orderNumber)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setLoadState("loaded");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadState("error");
        }
      });
    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const containerClass = "tng-payment-container";

  // polledStatus available immediately from sessionStorage cache (AC8), even before fetchTingeeData completes
  const baseStatus = polledStatus ?? (loadState === "loaded" ? (data?.status ?? null) : null);
  const effectiveStatus: PaymentStatus | null =
    localExpired && baseStatus !== "COMPLETED" ? "EXPIRED" : baseStatus;

  if (loadState === "loading") {
    // Bypass skeleton if order is already paid per financialStatus from useOrder()
    if (financialStatus === "PAID") {
      return (
        <div data-tng-extension className={containerClass}>
          <div className="tng-payment-card">
            <StatusBadge status="COMPLETED" locale={locale} />
          </div>
        </div>
      );
    }
    return (
      <div data-tng-extension className={containerClass}>
        <div className="tng-payment-card">
          <div className="tng-skeleton tng-skeleton--qr" />
          <div className="tng-skeleton tng-skeleton--amount" />
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div data-tng-extension className={containerClass}>
        <div className="tng-payment-card">
          <p className="tng-error-fallback">{t("checkingConnection", locale)}</p>
        </div>
      </div>
    );
  }

  if (effectiveStatus === "COMPLETED") {
    return (
      <div data-tng-extension className={containerClass}>
        <div className="tng-payment-card">
          <StatusBadge status="COMPLETED" locale={locale} />
          <p className="tng-paid-message">{t("paidConfirmMessage", locale)}</p>
        </div>
      </div>
    );
  }

  if (effectiveStatus === "EXPIRED") {
    const elapsed = Date.now() - mountTimeRef.current;
    const showTimeout = elapsed > 30 * 60 * 1000;
    return (
      <div data-tng-extension className={containerClass}>
        <div className="tng-payment-card">
          <StatusBadge status="EXPIRED" locale={locale} />
          {showTimeout ? (
            <>
              <p className="tng-timeout-message">{t("timeoutMessage", locale)}</p>
              <a href="/pages/contact" className="tng-support-link">
                {t("contactSupport", locale)}
              </a>
            </>
          ) : (
            <>
              <p className="tng-error-fallback">{t("expiredMessage", locale)}</p>
              <a href="/" className="tng-back-to-store">
                {t("backToStore", locale)}
              </a>
            </>
          )}
        </div>
      </div>
    );
  }

  if (effectiveStatus === "FAILED") {
    return (
      <div data-tng-extension className={containerClass}>
        <div className="tng-payment-card">
          <p className="tng-error-fallback">{t("checkingConnection", locale)}</p>
        </div>
      </div>
    );
  }

  // PENDING (or null while polling hasn't resolved yet)
  return (
    <div data-tng-extension className={containerClass}>
      <div className="tng-payment-card">
        <p>{t("payWith", locale)}</p>
        <DeeplinkButton
          deeplinkUrl={data?.deeplinkUrl ?? null}
          amount={amount}
          locale={locale}
          isMobile={isMobile}
        />
        <QRDisplay
          qrImageUrl={data?.qrImageUrl}
          amount={amount}
          locale={locale}
          isMobile={isMobile}
        />
        <p className="tng-amount">{formatVndAmount(amount)}</p>
        <StatusBadge status="PENDING" locale={locale} />
        {data?.expiresAt && (
          <CountdownTimer
            expiresAt={data.expiresAt}
            onExpire={handleLocalExpiry}
            locale={locale}
          />
        )}
        {showConnectionToast && (
          <p className="tng-connection-toast">{t("checkingConnection", locale)}</p>
        )}
      </div>
    </div>
  );
}
