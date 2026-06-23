import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sanitizeForLog } from "../lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    const { orders_to_redact } = payload as { orders_to_redact?: unknown };
    if (Array.isArray(orders_to_redact) && orders_to_redact.length > 0) {
      await db.payment.deleteMany({
        where: { shopDomain: shop, orderId: { in: orders_to_redact } },
      });
    }
  } catch (error) {
    console.error(
      "GDPR customers/redact error",
      sanitizeForLog({ shop, errorMessage: error instanceof Error ? error.message : String(error) })
    );
  }

  return new Response();
};
