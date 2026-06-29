import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "7200" } });
  }

  const { orderId } = params;
  if (!orderId) {
    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  }

  const payment = await db.payment.findFirst({ where: { orderId } }).catch(() => null);
  console.log("[qr-image] orderId:", orderId, "found:", !!payment, "hasQr:", !!payment?.qrImageUrl, "qrLen:", payment?.qrImageUrl?.length);

  if (!payment?.qrImageUrl) {
    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  }

  // Strip data URL prefix — strip twice to handle legacy double-prefixed records
  let base64Data = payment.qrImageUrl.replace(/^data:image\/\w+;base64,/, "");
  base64Data = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const imageBuffer = Buffer.from(base64Data, "base64");
  console.log("[qr-image] serving buffer size:", imageBuffer.byteLength);

  return new Response(imageBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=900",
      ...CORS_HEADERS,
    },
  });
};
