import { useState, useEffect } from "react";
import { useColorScheme } from "@shopify/ui-extensions-react/customer-account";
import { fetchTingeeData } from "../api/client";
import type { TingeeDataResponse } from "../api/client";
import { formatVndAmount } from "../utils/formatters";
import { t } from "../utils/i18n";
import { useMobileDetect } from "../hooks/useMobileDetect";
import { usePaymentStatus } from "../hooks/usePaymentStatus";
import { QRDisplay } from "./QRDisplay";
import { DeeplinkButton } from "./DeeplinkButton";
import { StatusBadge } from "./StatusBadge";
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
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [data, setData] = useState<TingeeDataResponse | null>(null);
  const isMobile = useMobileDetect();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

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

  const containerClass = `tng-payment-container${isDark ? " tng-payment-container--dark" : ""}`;

  // polledStatus available immediately from sessionStorage cache (AC8), even before fetchTingeeData completes
  const effectiveStatus = polledStatus ?? (loadState === "loaded" ? (data?.status ?? null) : null);

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
    return (
      <div data-tng-extension className={containerClass}>
        <div className="tng-payment-card">
          <span className="tng-status-badge tng-status-badge--expired">
            {t("expired", locale)}
          </span>
          <p className="tng-error-fallback">{t("expiredMessage", locale)}</p>
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
        {showConnectionToast && (
          <p className="tng-connection-toast">{t("checkingConnection", locale)}</p>
        )}
      </div>
    </div>
  );
}
