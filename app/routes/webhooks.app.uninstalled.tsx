import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteCredential } from "../services/credential.server";
import { unregisterPaymentMethod } from "../services/order.server";
import { sanitizeForLog } from "../lib/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // 1. Mark merchant as uninstalled — guard prevents overwriting an active merchant if this fires after re-install
  await db.merchant.updateMany({
    where: { shopDomain: shop, uninstalledAt: null },
    data: { uninstalledAt: new Date() },
  });

  // 2. Unregister payment method — requires accessToken from live session
  // session may be null if already uninstalled; Shopify may have revoked token
  if (session?.accessToken) {
    try {
      await unregisterPaymentMethod(shop, session.accessToken);
    } catch (error) {
      console.error(
        "Failed to unregister payment method during uninstall",
        sanitizeForLog({
          shop,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  // 3. Delete credential (idempotent — deleteMany won't throw if not found)
  await deleteCredential(shop);

  // 4. Delete Shopify sessions
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
