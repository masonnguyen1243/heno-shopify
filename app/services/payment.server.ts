import db from "../db.server";
import { sanitizeForLog } from "../lib/logger.server";
import { env } from "../lib/env.server";
import { getDecryptedCredential } from "./credential.server";
import { generateQR, generateDeeplink, TingeeConnectionError } from "./tingee.server";
import { TingeeClient, isSuccessResponse } from "@tingee/sdk-node";
import { insertIdempotencyRecord, updateIdempotencyStatus } from "../lib/idempotency.server";
import { assertValidTransition } from "../lib/paymentStateMachine";
import { addOrderNote } from "./order.server";

interface MerchantAccountInfo {
  accountNumber: string;
  bankBin: string;
  accountName: string;
}

async function getMerchantAccountInfo(
  clientId: string,
  secretToken: string
): Promise<MerchantAccountInfo> {
  const client = new TingeeClient({
    clientId,
    secretKey: secretToken,
    environment: "production",
    timeout: env.TINGEE_SDK_TIMEOUT_MS,
  });

  try {
    // Get merchant info to obtain numeric merchantId
    const merchantResult = await (client as any).merchant.getPaging({
      skipCount: 0,
      maxResultCount: 1,
    });

    if (!isSuccessResponse(merchantResult) || !merchantResult.data?.items?.length) {
      throw new TingeeConnectionError("Cannot retrieve merchant info from Tingee");
    }

    const merchantId: number = merchantResult.data.items[0].id;

    // Get VA list for this merchant
    const vaResult = await (client as any).bank.getVaPaging({
      merchantId,
      skipCount: 0,
      maxResultCount: 10,
      accountType: "personal-account",
      dataAccess: "referral-only",
    });

    if (!isSuccessResponse(vaResult) || !vaResult.data?.items?.length) {
      throw new TingeeConnectionError("No virtual accounts found for merchant");
    }

    const activeVA = vaResult.data.items.find(
      (va: any) => va.status === "active"
    ) ?? vaResult.data.items[0];

    if (!activeVA.bankBin) {
      throw new TingeeConnectionError("Merchant VA has no bankBin configured in Tingee");
    }
    return {
      accountNumber: activeVA.accountNumber,
      bankBin: activeVA.bankBin,
      accountName: activeVA.accountName ?? "",
    };
  } catch (error) {
    if (error instanceof TingeeConnectionError) throw error;
    throw new TingeeConnectionError(
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function createPaymentData(params: {
  shopDomain: string;
  orderId: string;
  orderNumber: string;
  amount: number;
}): Promise<{
  qrImageUrl: string;
  deeplinkUrl: string | null;
  amount: number;
  currency: "VND";
  status: string;
  expiresAt: string;
  orderId: string;
  orderNumber: string;
}> {
  const { shopDomain, orderId, orderNumber, amount } = params;

  // Idempotency: return existing payment if found.
  // TOCTOU note: without @@unique([orderId, shopDomain]) on Payment, two concurrent
  // requests can both pass this check and create duplicate records. A schema migration
  // adding that unique constraint is the proper long-term fix.
  const existing = await db.payment.findFirst({
    where: { orderId, shopDomain },
  });

  if (existing) {
    return {
      qrImageUrl: existing.qrImageUrl!,
      deeplinkUrl: existing.deeplinkUrl ?? null,
      amount: existing.amount,
      currency: "VND",
      status: existing.status,
      expiresAt: existing.expiresAt.toISOString(),
      orderId: existing.orderId,
      orderNumber: existing.orderNumber,
    };
  }

  // Decrypt merchant credentials
  const credential = await getDecryptedCredential(shopDomain);
  if (!credential) {
    // Config error — not a Tingee API connectivity issue. Use generic Error so the route
    // maps this to 500 INTERNAL_ERROR rather than 503 TINGEE_UNAVAILABLE.
    throw new Error(`Merchant has no Tingee credentials configured: ${sanitizeForLog({ shopDomain }).shopDomain}`);
  }

  const { clientId, secretToken } = credential;

  // Fetch merchant bank account info from Tingee
  const accountInfo = await getMerchantAccountInfo(clientId, secretToken);

  // Generate QR (fatal if fails)
  const { qrCode, qrImageUrl } = await generateQR({
    clientId,
    secretToken,
    amount,
    orderNumber,
    accountNumber: accountInfo.accountNumber,
    bankBin: accountInfo.bankBin,
  });

  // Generate Deeplink (non-fatal)
  const deeplinkUrl = await generateDeeplink({
    clientId,
    secretToken,
    qrCode,
    bankBin: accountInfo.bankBin,
    destinationBankBin: accountInfo.bankBin,
    accountName: accountInfo.accountName,
    accountNumber: accountInfo.accountNumber,
    amount,
    content: `TINGEE ${orderNumber}`,
    billNumber: orderNumber,
  });

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const payment = await db.payment.create({
    data: {
      orderId,
      orderNumber,
      shopDomain,
      status: "PENDING",
      qrImageUrl,
      deeplinkUrl,
      amount,
      expiresAt,
    },
  });

  return {
    qrImageUrl: payment.qrImageUrl!,
    deeplinkUrl: payment.deeplinkUrl ?? null,
    amount: payment.amount,
    currency: "VND",
    status: payment.status,
    expiresAt: payment.expiresAt.toISOString(),
    orderId: payment.orderId,
    orderNumber: payment.orderNumber,
  };
}

export interface TingeeWebhookPayload {
  transactionCode: string;
  amount: number;
  content: string;
  transactionDate?: string;
}

export type ReconciliationResult =
  | { type: "skip" }
  | { type: "no_payment_found" }
  | { type: "invalid_transition" }
  | { type: "amount_mismatch" }
  | { type: "amount_matched"; payment: { id: string; orderId: string; amount: number }; idempotencyKey: string };

export function extractOrderNumber(content: string): string | null {
  if (!content.startsWith("TINGEE ")) return null;
  const afterPrefix = content.slice(7).trim();
  const orderNumber = afterPrefix.split(/\s+/)[0];
  return orderNumber || null;
}

export async function reconcileWebhookPayment(params: {
  shopDomain: string;
  payload: TingeeWebhookPayload;
}): Promise<ReconciliationResult> {
  const { shopDomain, payload } = params;
  const idempotencyKey = `tingee:${payload.transactionCode}`;

  // Step 1: Idempotency check — P2002 = already seen, return skip immediately
  const insertResult = await insertIdempotencyRecord({
    idempotencyKey,
    topic: "payment.confirmed",
    shopDomain,
  });
  if (insertResult === "duplicate") {
    return { type: "skip" };
  }

  try {
    // Step 2: Parse order number from content
    const orderNumber = extractOrderNumber(payload.content);
    if (!orderNumber) {
      // TODO: replace with Sentry.captureMessage once Sentry is installed (AC #5)
      console.error("[WEBHOOK] No Payment found for webhook", sanitizeForLog({ shopDomain, transactionCode: payload.transactionCode }));
      try { await updateIdempotencyStatus(idempotencyKey, "FAILED"); } catch { /* best-effort */ }
      return { type: "no_payment_found" };
    }

    // Step 3: Find payment record
    const payment = await db.payment.findFirst({ where: { shopDomain, orderNumber } });
    if (!payment) {
      // TODO: replace with Sentry.captureMessage once Sentry is installed (AC #5)
      console.error("[WEBHOOK] No Payment found for webhook", sanitizeForLog({ shopDomain, transactionCode: payload.transactionCode }));
      try { await updateIdempotencyStatus(idempotencyKey, "FAILED"); } catch { /* best-effort */ }
      return { type: "no_payment_found" };
    }

    // Step 4: Validate that payment can be processed (AC #2)
    try {
      assertValidTransition(payment.status, "PROCESSING");
    } catch {
      // TODO: replace with Sentry.captureException once Sentry is installed (AC #2)
      console.warn("[WEBHOOK] Invalid payment transition", sanitizeForLog({ shopDomain, transactionCode: payload.transactionCode }));
      try { await updateIdempotencyStatus(idempotencyKey, "COMPLETED"); } catch { /* best-effort */ }
      return { type: "invalid_transition" };
    }

    // Step 5: Amount check (before any state transition — avoids PROCESSING→FAILED two-write pattern)
    if (payload.amount !== payment.amount) {
      await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      try { await updateIdempotencyStatus(idempotencyKey, "COMPLETED"); } catch { /* best-effort */ }
      try {
        await addOrderNote(
          shopDomain,
          payment.orderId,
          `Tingee received ${payload.amount} VND, expected ${payment.amount} VND — manual review required`
        );
      } catch { /* non-fatal */ }
      return { type: "amount_mismatch" };
    }

    // Step 6: Amount confirmed — transition to PROCESSING
    await db.payment.update({ where: { id: payment.id }, data: { status: "PROCESSING" } });
    // Mark idempotency as awaiting Story 3.3's markOrderPaid() call
    try { await updateIdempotencyStatus(idempotencyKey, "AWAITING_MARK_PAID"); } catch { /* best-effort */ }

    // Step 7: Amount matched — Story 3.3 calls markOrderPaid() and updates to COMPLETED
    return {
      type: "amount_matched",
      payment: { id: payment.id, orderId: payment.orderId, amount: payment.amount },
      idempotencyKey,
    };
  } catch (error) {
    console.error("[WEBHOOK] Unexpected error in reconcileWebhookPayment", sanitizeForLog({ shopDomain, transactionCode: payload.transactionCode }));
    try { await updateIdempotencyStatus(idempotencyKey, "FAILED"); } catch { /* best-effort cleanup */ }
    throw error;
  }
}
