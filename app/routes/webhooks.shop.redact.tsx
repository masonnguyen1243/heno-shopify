import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { sanitizeForLog } from "../lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // FK-safe deletion order — each step isolated so one failure does not block the rest
  const redactStep = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (error) {
      console.error(
        `GDPR shop/redact error at ${label}`,
        sanitizeForLog({ shop, errorMessage: error instanceof Error ? error.message : String(error) })
      );
    }
  };

  await redactStep("processedWebhook", () => db.processedWebhook.deleteMany({ where: { shopDomain: shop } }));
  await redactStep("payment", () => db.payment.deleteMany({ where: { shopDomain: shop } }));
  // MerchantCredential has onDelete:Cascade on Merchant FK, but delete explicitly for test auditability
  await redactStep("merchantCredential", () => db.merchantCredential.deleteMany({ where: { merchant: { shopDomain: shop } } }));
  await redactStep("merchant", () => db.merchant.deleteMany({ where: { shopDomain: shop } }));
  await redactStep("session", () => db.session.deleteMany({ where: { shop } }));

  return new Response();
};
