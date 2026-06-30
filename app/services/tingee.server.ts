import {
  TingeeClient,
  isSuccessResponse,
  TingeeHttpError,
} from "@tingee/sdk-node";
import { env } from "../lib/env.server";
import { verifyHMAC } from "../lib/hmac.server";

export class InvalidCredentialsError extends Error {
  constructor(message = "Invalid Tingee credentials") {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

export class TingeeConnectionError extends Error {
  constructor(message = "Cannot connect to Tingee") {
    super(message);
    this.name = "TingeeConnectionError";
  }
}

export type TingeeBankAccount = {
  accountNumber: string;
  vaAccountNumber: string;
  bankBin: string;
  bankName: string;
  accountName: string;
};

export async function fetchTingeeAccounts(
  clientId: string,
  secretToken: string
): Promise<TingeeBankAccount[]> {
  const client = new TingeeClient({
    clientId,
    secretKey: secretToken,
    environment: "production",
    timeout: env.TINGEE_SDK_TIMEOUT_MS,
  });

  try {
    // merchantId is only needed for Master Merchant access — regular merchants omit it
    const vaResult = await (client as any).bank.getVaPaging({
      skipCount: 0,
      maxResultCount: 50,
    });
    const vaItems = vaResult?.data?.items;
    if (!isSuccessResponse(vaResult) || !vaItems?.length) {
      return [];
    }

    return (vaItems as any[])
      .filter((va) => va.vaAccountNumber && va.bankBin)
      .map((va) => ({
        accountNumber: va.accountNumber as string,
        vaAccountNumber: va.vaAccountNumber as string,
        bankBin: va.bankBin as string,
        bankName: va.bankName ?? "",
        accountName: va.accountName ?? "",
      }));
  } catch (err) {
    console.warn("[Tingee] fetchTingeeAccounts error", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function verifyCredentials(
  clientId: string,
  secretToken: string
): Promise<void> {
  const client = new TingeeClient({
    clientId,
    secretKey: secretToken,
    environment: "production",
    timeout: env.TINGEE_SDK_TIMEOUT_MS,
  });

  try {
    const result = await (client as any).bank.getBanks();
    if (!isSuccessResponse(result)) {
      throw new InvalidCredentialsError(result?.message ?? "Non-success response from Tingee");
    }
  } catch (error) {
    if (error instanceof InvalidCredentialsError) throw error;
    if (error instanceof TingeeHttpError) {
      if (error.status === 401 || error.status === 403) {
        throw new InvalidCredentialsError(`HTTP ${error.status}: auth rejected`);
      }
      throw new TingeeConnectionError(`HTTP ${error.status}: ${error.message}`);
    }
    throw new TingeeConnectionError(
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function generateQR(params: {
  clientId: string;
  secretToken: string;
  amount: number;
  orderNumber: string;
  accountNumber: string;
  bankBin: string;
}): Promise<{ qrCode: string; qrImageUrl: string }> {
  const client = new TingeeClient({
    clientId: params.clientId,
    secretKey: params.secretToken,
    environment: "production",
    timeout: env.TINGEE_SDK_TIMEOUT_MS,
  });
  try {
    const result = await (client as any).bank.generateVietQr({
      accountNumber: params.accountNumber,
      bankBin: params.bankBin,
      amount: params.amount,
      content: `TINGEE ${params.orderNumber}`,
    });
    if (!isSuccessResponse(result) || !result.data?.qrCode || !result.data?.qrCodeImage) {
      throw new TingeeConnectionError(`QR generation failed: ${result?.message}`);
    }
    const raw = result.data.qrCodeImage as string;
    const qrImageUrl = raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
    return { qrCode: result.data.qrCode, qrImageUrl };
  } catch (error) {
    if (error instanceof TingeeConnectionError) throw error;
    throw new TingeeConnectionError(
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function generateDeeplink(params: {
  clientId: string;
  secretToken: string;
  qrCode: string;
  bankBin: string;
  destinationBankBin: string;
  accountName: string;
  accountNumber: string;
  amount: number;
  content: string;
  billNumber: string;
}): Promise<string | null> {
  try {
    const client = new TingeeClient({
      clientId: params.clientId,
      secretKey: params.secretToken,
      environment: "production",
      timeout: env.TINGEE_SDK_TIMEOUT_MS,
    });
    const result = await (client as any).deepLink.generate({
      type: "bank-transfer",
      qrCode: params.qrCode,
      bankBin: params.bankBin,
      destinationBankBin: params.destinationBankBin,
      accountName: params.accountName,
      accountNumber: params.accountNumber,
      amount: params.amount,
      content: params.content,
      billNumber: params.billNumber,
    });
    if (!isSuccessResponse(result) || !result.data) return null;
    return result.data as string;
  } catch (error) {
    console.warn(
      "Deeplink generation failed (non-fatal)",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

function parseTimestampUTC(ts: string): number {
  if (!ts || ts.length !== 17) return 0;
  const y = parseInt(ts.slice(0, 4));
  const mo = parseInt(ts.slice(4, 6)) - 1;
  const d = parseInt(ts.slice(6, 8));
  const h = parseInt(ts.slice(8, 10));
  const mi = parseInt(ts.slice(10, 12));
  const s = parseInt(ts.slice(12, 14));
  const ms = parseInt(ts.slice(14, 17));
  // Tingee sends UTC+7, subtract 7h to convert to UTC epoch
  const utcMs = Date.UTC(y, mo, d, h - 7, mi, s, ms);
  return isNaN(utcMs) ? 0 : utcMs;
}

export function verifyWebhookHMAC(params: {
  secretToken: string;
  signature: string;
  timestamp: string;
  body: string | object;
}): boolean {
  const bodyStr = typeof params.body === "string" ? params.body : JSON.stringify(params.body);
  const tsMs = parseTimestampUTC(params.timestamp);
  if (tsMs === 0) return false;
  if (tsMs > Date.now() || Date.now() - tsMs > 5 * 60 * 1000) return false;
  return verifyHMAC({ signature: params.signature, timestamp: params.timestamp, body: bodyStr, secretToken: params.secretToken });
}
