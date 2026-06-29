import type { ActionFunctionArgs } from "react-router";
import { webhookRateLimiter } from "../lib/rateLimit.server";
import { sanitizeForLog } from "../lib/logger.server";
import { verifyWebhookHMAC } from "../services/tingee.server";
import { getDecryptedCredential } from "../services/credential.server";

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

  // Step 8 — Return 200 (Story 3.2 adds idempotency + reconciliation here)
  return new Response(null, { status: 200 });
}
