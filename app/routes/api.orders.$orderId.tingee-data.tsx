import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { createPaymentData } from "../services/payment.server";
import { sanitizeForLog } from "../lib/logger.server";
import { TingeeConnectionError } from "../services/tingee.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { sessionToken } = await authenticate.public.checkout(request);

  // Shop from sessionToken — never from URL params (IDOR prevention)
  const dest = (sessionToken as any)?.dest;
  if (!dest || typeof dest !== "string") {
    return Response.json(
      { error: "Invalid session", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  const shop = dest.replace("https://", "");

  const { orderId } = params;
  if (!orderId) {
    return Response.json(
      { error: "Missing orderId", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  // amount and orderNumber come from Extension (which has order context from Shopify)
  const url = new URL(request.url);
  const amountStr = url.searchParams.get("amount");
  const orderNumber = url.searchParams.get("orderNumber");

  // Reject non-integer strings like "15abc" or floats — parseInt alone truncates silently
  if (!amountStr || !/^\d+$/.test(amountStr) || !orderNumber) {
    return Response.json(
      { error: "Missing or invalid amount/orderNumber", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }
  const amount = parseInt(amountStr, 10);
  if (amount <= 0) {
    return Response.json(
      { error: "Missing or invalid amount/orderNumber", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  try {
    const paymentData = await createPaymentData({
      shopDomain: shop,
      orderId,
      orderNumber,
      amount,
    });
    return Response.json(paymentData);
  } catch (error) {
    if (error instanceof TingeeConnectionError) {
      console.error(
        "Tingee API unavailable",
        sanitizeForLog({ shop, orderId, error: (error as Error).message })
      );
      return Response.json(
        { error: "TINGEE_UNAVAILABLE", code: "TINGEE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    console.error(
      "Payment data creation failed",
      sanitizeForLog({ shop, orderId })
    );
    return Response.json(
      { error: "Internal error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
};
