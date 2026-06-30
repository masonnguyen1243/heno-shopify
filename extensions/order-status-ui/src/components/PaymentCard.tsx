import { useState, useEffect, useRef, useCallback } from "react";
import {
  useSessionToken,
  useSettings,
  BlockStack,
  Text,
  TextBlock,
  Banner,
  SkeletonImage,
  SkeletonText,
} from "@shopify/ui-extensions-react/checkout";
import { fetchTingeeData } from "../api/client";
import type { TingeeDataResponse } from "../api/client";
import type { PaymentStatus } from "../utils/constants";
import { formatVndAmount } from "../utils/formatters";
import { t } from "../utils/i18n";
import { usePaymentStatus } from "../hooks/usePaymentStatus";
import { QRDisplay } from "./QRDisplay";
import { DeeplinkButton } from "./DeeplinkButton";
import { StatusBadge } from "./StatusBadge";
import { CountdownTimer } from "./CountdownTimer";

type Props = {
  orderId: string;
  amount: number;
  orderNumber: string;
  locale: string;
};

type LoadState = "loading" | "loaded" | "error";
type FetchError = { message: string; status?: number; code?: string };

export function PaymentCard({ orderId, amount, orderNumber, locale }: Props) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [fetchError, setFetchError] = useState<FetchError | null>(null);
  const [data, setData] = useState<TingeeDataResponse | null>(null);
  const [localExpired, setLocalExpired] = useState(false);
  const handleLocalExpiry = useCallback(() => setLocalExpired(true), []);

  const sessionToken = useSessionToken();
  const settings = useSettings();
  const appUrl = (settings.app_url as string | undefined) ?? "";
  const getToken = useCallback(() => sessionToken.get(), [sessionToken]);

  const { status: polledStatus, showConnectionToast } = usePaymentStatus(
    loadState === "loaded" ? orderId : null,
    loadState === "loaded" ? (data?.status ?? null) : null,
    getToken,
    appUrl
  );

  useEffect(() => {
    if (!appUrl) {
      console.error("[Tingee] appUrl is empty — check App URL in Checkout Editor settings");
      return;
    }
    const controller = new AbortController();
    console.log("[Tingee] Fetching payment data from:", appUrl, "orderId:", orderId);
    sessionToken.get()
      .then((token) => {
        if (controller.signal.aborted) return null;
        return fetchTingeeData(orderId, amount, orderNumber, token, appUrl);
      })
      .then((result) => {
        if (result && !controller.signal.aborted) {
          console.log("[Tingee] Payment data loaded:", result.status);
          setData(result);
          setLoadState("loaded");
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          const fe: FetchError = { message: err?.message ?? "Unknown", status: err?.status, code: err?.code };
          console.error("[Tingee] fetchTingeeData failed:", fe.message, "status:", fe.status, "code:", fe.code);
          setFetchError(fe);
          setLoadState("error");
        }
      });
    return () => controller.abort();
  }, [appUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseStatus = polledStatus ?? (loadState === "loaded" ? (data?.status ?? null) : null);
  const effectiveStatus: PaymentStatus | null =
    localExpired && baseStatus !== "COMPLETED" ? "EXPIRED" : baseStatus;

  if (loadState === "loading") {
    return (
      <BlockStack spacing="base">
        <SkeletonImage aspectRatio={1} />
        <SkeletonText size="base" />
      </BlockStack>
    );
  }

  if (loadState === "error") {
    const detail = fetchError
      ? `[${fetchError.status ?? "net"}] ${fetchError.code ?? fetchError.message}`
      : "unknown";
    return (
      <Banner status="critical">
        <TextBlock>Debug: {detail}</TextBlock>
      </Banner>
    );
  }

  if (effectiveStatus === "COMPLETED") {
    return (
      <BlockStack spacing="base" inlineAlignment="center">
        <StatusBadge status="COMPLETED" locale={locale} />
        <TextBlock>{t("paidConfirmMessage", locale)}</TextBlock>
      </BlockStack>
    );
  }

  if (effectiveStatus === "EXPIRED" || effectiveStatus === "FAILED") {
    return (
      <BlockStack spacing="base" inlineAlignment="center">
        <StatusBadge status={effectiveStatus} locale={locale} />
        <TextBlock>{t("expiredMessage", locale)}</TextBlock>
      </BlockStack>
    );
  }

  return (
    <BlockStack spacing="base" inlineAlignment="center">
      <TextBlock>{t("payWith", locale)}</TextBlock>
      <DeeplinkButton deeplinkUrl={data?.deeplinkUrl ?? null} locale={locale} />
      <QRDisplay qrImageUrl={data?.qrImageUrl} amount={amount} locale={locale} />
      <Text size="large" emphasis="bold">{formatVndAmount(amount)}</Text>
      <StatusBadge status="PENDING" locale={locale} />
      {data?.expiresAt && (
        <CountdownTimer expiresAt={data.expiresAt} onExpire={handleLocalExpiry} locale={locale} />
      )}
      {showConnectionToast && (
        <TextBlock>{t("checkingConnection", locale)}</TextBlock>
      )}
    </BlockStack>
  );
}
