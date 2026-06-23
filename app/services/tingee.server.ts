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

// Stubs — implemented in Story 2.1
export async function generateQR(_params: {
  clientId: string;
  secretToken: string;
  amount: number;
  orderNumber: string;
}): Promise<string> {
  throw new Error("generateQR: not implemented until Story 2.1");
}

export async function generateDeeplink(_params: {
  clientId: string;
  secretToken: string;
  qrCode: string;
}): Promise<string | null> {
  throw new Error("generateDeeplink: not implemented until Story 2.1");
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
