import { useState, useEffect } from "react";
import { fetchTingeeData } from "../api/client";
import type { TingeeDataResponse } from "../api/client";
import { formatVndAmount } from "../utils/formatters";
import { t, tWithArgs } from "../utils/i18n";
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

  if (loadState === "loading") {
    // AC5: bypass skeleton if order is already paid per financialStatus from useOrder()
    if (financialStatus === "PAID") {
      return (
        <div data-tng-extension className={containerClass}>
          <div className="tng-payment-card">
            <span className="tng-status-badge tng-status-badge--paid">
              {t("paid", locale)}
            </span>
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

  if (data?.status === "COMPLETED") {
    return (
      <div data-tng-extension className={containerClass}>
        <div className="tng-payment-card">
          <span className="tng-status-badge tng-status-badge--paid">
            {t("paid", locale)}
          </span>
        </div>
      </div>
    );
  }

  if (data?.status === "EXPIRED") {
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

  if (data?.status === "FAILED") {
    return (
      <div data-tng-extension className={containerClass}>
        <div className="tng-payment-card">
          <p className="tng-error-fallback">{t("checkingConnection", locale)}</p>
        </div>
      </div>
    );
  }

  return (
    <div data-tng-extension className={containerClass}>
      <div className="tng-payment-card">
        <p>{t("payWith", locale)}</p>
        {data?.qrImageUrl && (
          <div className="tng-qr-container">
            <img
              src={data.qrImageUrl}
              alt={tWithArgs("qrAltText", locale, formatVndAmount(amount))}
              width={200}
              height={200}
            />
          </div>
        )}
        <p className="tng-amount">{formatVndAmount(amount)}</p>
        <p>{t("pending", locale)}</p>
      </div>
    </div>
  );
}
