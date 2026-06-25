import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { pollingRateLimiter } from "../lib/rateLimit.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { sessionToken } = await authenticate.public.checkout(request);

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

  let payment;
  try {
    payment = await db.payment.findFirst({
      where: { orderId, shopDomain: shop },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return Response.json(
      { error: "Internal server error", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }

  if (!payment) {
    return Response.json(
      { error: "Payment not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  // Rate limit checked after ownership is verified to prevent orderId probing
  if (pollingRateLimiter.isRateLimited(`${shop}:${orderId}`)) {
    return Response.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "10" } }
    );
  }

  const isExpired = payment.expiresAt < new Date();
  const isMutableState =
    payment.status === "PENDING" || payment.status === "PROCESSING";

  if (isMutableState && isExpired) {
    try {
      await db.payment.updateMany({
        where: { id: payment.id, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "EXPIRED" },
      });
    } catch {
      // Best-effort write — expiry is already determined; return EXPIRED regardless
    }
    return Response.json({ status: "EXPIRED" });
  }

  switch (payment.status) {
    case "SUCCESS":
      return Response.json({
        status: "COMPLETED",
        paidAt: payment.updatedAt.toISOString(),
      });
    case "FAILED":
      return Response.json({ status: "FAILED" });
    case "EXPIRED":
      return Response.json({ status: "EXPIRED" });
    case "PENDING":
    case "PROCESSING":
      return Response.json({ status: "PENDING" });
    default:
      return Response.json(
        { error: "Unexpected payment status", code: "SERVER_ERROR" },
        { status: 500 }
      );
  }
};
