import {
  TingeeClient,
  isSuccessResponse,
  TingeeHttpError,
} from "@tingee/sdk-node";
import { env } from "../lib/env.server";

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
      .filter((va) => va.accountNumber && va.bankBin)
      .map((va) => ({
        accountNumber: va.accountNumber as string,
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
    const qrImageUrl = `data:image/png;base64,${result.data.qrCodeImage}`;
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

// Stub — implemented in Story 3.1
export function verifyWebhookHMAC(_params: {
  secretToken: string;
  signature: string;
  timestamp: string;
  body: object | string;
}): boolean {
  throw new Error("verifyWebhookHMAC: not implemented until Story 3.1");
}
