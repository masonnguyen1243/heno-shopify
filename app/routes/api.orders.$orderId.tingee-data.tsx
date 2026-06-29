import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { createPaymentData } from "../services/payment.server";
import { sanitizeForLog } from "../lib/logger.server";
import { TingeeConnectionError } from "../services/tingee.server";

function addCorsToThrownResponse(err: unknown): never {
  if (err instanceof Response) {
    try {
      err.headers.set("Access-Control-Allow-Origin", "*");
      err.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    } catch {}
  }
  throw err;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.public.checkout(request).catch(addCorsToThrownResponse);

  // Shop from sessionToken — never from URL params (IDOR prevention)
  const dest = (sessionToken as any)?.dest;
  if (!dest || typeof dest !== "string") {
    return cors(Response.json(
      { error: "Invalid session", code: "UNAUTHORIZED" },
      { status: 401 }
    ));
  }
  const shop = dest.replace("https://", "");

  const { orderId } = params;
  if (!orderId) {
    return cors(Response.json(
      { error: "Missing orderId", code: "INVALID_REQUEST" },
      { status: 400 }
    ));
  }

  // amount and orderNumber come from Extension (which has order context from Shopify)
  const url = new URL(request.url);
  const amountStr = url.searchParams.get("amount");
  const orderNumber = url.searchParams.get("orderNumber");

  // Reject non-integer strings like "15abc" or floats — parseInt alone truncates silently
  if (!amountStr || !/^\d+$/.test(amountStr) || !orderNumber) {
    return cors(Response.json(
      { error: "Missing or invalid amount/orderNumber", code: "INVALID_REQUEST" },
      { status: 400 }
    ));
  }
  const amount = parseInt(amountStr, 10);
  if (amount <= 0) {
    return cors(Response.json(
      { error: "Missing or invalid amount/orderNumber", code: "INVALID_REQUEST" },
      { status: 400 }
    ));
  }

  try {
    const paymentData = await createPaymentData({
      shopDomain: shop,
      orderId,
      orderNumber,
      amount,
    });
    const rawUrl = new URL(request.url);
    const proto = request.headers.get("x-forwarded-proto") ?? rawUrl.protocol.replace(":", "");
    const host = request.headers.get("x-forwarded-host") ?? rawUrl.host;
    const qrImageUrl = `${proto}://${host}/api/orders/${encodeURIComponent(orderId)}/qr-image`;
    return cors(Response.json({ ...paymentData, qrImageUrl }));
  } catch (error) {
    if (error instanceof TingeeConnectionError) {
      console.error(
        "Tingee API unavailable",
        sanitizeForLog({ shop, orderId, error: (error as Error).message })
      );
      return cors(Response.json(
        { error: "TINGEE_UNAVAILABLE", code: "TINGEE_UNAVAILABLE" },
        { status: 503 }
      ));
    }
    console.error(
      "Payment data creation failed",
      sanitizeForLog({ shop, orderId })
    );
    return cors(Response.json(
      { error: "Internal error", code: "INTERNAL_ERROR" },
      { status: 500 }
    ));
  }
};
