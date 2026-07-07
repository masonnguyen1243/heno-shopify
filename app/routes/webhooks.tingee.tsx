import type { ActionFunctionArgs } from "react-router";
import { webhookRateLimiter } from "../lib/rateLimit.server";
import { sanitizeForLog } from "../lib/logger.server";
import { verifyWebhookHMAC } from "../services/tingee.server";
import { getDecryptedCredential } from "../services/credential.server";
import { reconcileWebhookPayment, type TingeeWebhookPayload } from "../services/payment.server";
import { markOrderPaid, ShopifyMarkPaidError } from "../services/order.server";
import { assertValidTransition } from "../lib/paymentStateMachine";
import { updateIdempotencyStatus } from "../lib/idempotency.server";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  // Step 1 — Rate limit
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (webhookRateLimiter.isRateLimited(ip)) {
    return new Response(null, { status: 429 });
  }

  // Step 2 — Read raw body (must be text for HMAC)
  const body = await request.text();

  // Step 3 — Parse JSON
  let _payload: unknown;
  try {
    _payload = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }

  // Step 4 — Extract headers
  const signature = request.headers.get("x-signature") ?? "";
  const timestamp = request.headers.get("x-request-timestamp") ?? "";

  // Step 5 — Identify merchant
  const shopDomain = new URL(request.url).searchParams.get("shop");
  if (!shopDomain) {
    return new Response(null, { status: 400 });
  }

  // Step 6 — Look up credential
  let credential: { clientId: string; secretToken: string } | null;
  try {
    credential = await getDecryptedCredential(shopDomain);
  } catch {
    console.error("[SECURITY] Tingee webhook credential lookup failed", sanitizeForLog({ shopDomain, ip }));
    return new Response(null, { status: 500 });
  }
  if (!credential) {
    console.warn("[SECURITY] Tingee webhook for unknown shop", sanitizeForLog({ shopDomain, ip }));
    return new Response(null, { status: 400 });
  }

  // Step 7 — Verify HMAC + timestamp
  const valid = verifyWebhookHMAC({ secretToken: credential.secretToken, signature, timestamp, body });
  if (!valid) {
    console.error("[SECURITY] Invalid Tingee webhook", sanitizeForLog({ shopDomain, ip, timestamp }));
    return new Response(null, { status: 400 });
  }

  // Step 8 — Parse payload as typed Tingee webhook
  const payload = _payload as TingeeWebhookPayload;
  if (
    !payload.transactionCode ||
    !payload.transactionCode.trim() ||
    typeof payload.amount !== "number" ||
    typeof payload.content !== "string"
  ) {
    return new Response(null, { status: 400 });
  }

  // Step 9 — Reconcile payment (idempotency + amount match)
  const reconResult = await reconcileWebhookPayment({ shopDomain, payload });

  switch (reconResult.type) {
    case "skip":
    case "no_payment_found":
    case "invalid_transition":
    case "amount_mismatch":
      return new Response(null, { status: 200 });
    case "amount_matched": {
      const startTime = Date.now();
      const { payment, idempotencyKey } = reconResult;

      try {
        const { retryCount } = await markOrderPaid(shopDomain, payment.orderId);

        // AC #5: Success — transition PROCESSING → SUCCESS
        assertValidTransition("PROCESSING", "SUCCESS");
        await db.payment.update({ where: { id: payment.id }, data: { status: "SUCCESS" } });
        try { await updateIdempotencyStatus(idempotencyKey, "COMPLETED"); } catch { /* best-effort */ }

        // AC #6: Emit metrics to platform logs
        console.info("[METRIC] webhook.processing_time", sanitizeForLog({ processingTimeMs: Date.now() - startTime }));
        console.info("[METRIC] webhook.retry_count", sanitizeForLog({ retryCount }));
        // TODO: tingee.api.response_time metric belongs in services/tingee.server.ts — not in scope for Story 3.3

        return new Response(null, { status: 200 });

      } catch (error) {
        // AC #4: Permanent failure — transition to FAILED
        const retryCount = error instanceof ShopifyMarkPaidError ? error.retryCount : 0;
        const httpStatus = error instanceof ShopifyMarkPaidError ? error.httpStatus : undefined;

        // Update DB — best-effort; do not throw even if these fail
        await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } }).catch(() => {});
        try { await updateIdempotencyStatus(idempotencyKey, "FAILED"); } catch { /* best-effort */ }

        // AC #4: Log full context for manual recovery
        console.error(
          "[WEBHOOK] markOrderPaid permanent failure",
          sanitizeForLog({
            shopDomain,
            orderId: payment.orderId,
            transactionCode: payload.transactionCode,
            retryCount,
            httpStatus,
            errorMessage: error instanceof Error ? error.message : String(error),
          }),
        );
        // Recovery: manually DELETE FROM processed_webhooks WHERE idempotency_key='tingee:{transactionCode}'
        // then re-fire the webhook from Tingee dashboard to retry.

        // AC #6: Emit metrics even on failure
        console.info("[METRIC] webhook.processing_time", sanitizeForLog({ processingTimeMs: Date.now() - startTime }));
        console.info("[METRIC] webhook.retry_count", sanitizeForLog({ retryCount }));

        // AC #3/#4: Always return 200 — prevents Tingee from retrying a permanently failed order
        return new Response(null, { status: 200 });
      }
    }
  }
}
