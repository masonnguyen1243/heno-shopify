import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteCredential } from "../services/credential.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // 1. Mark merchant as uninstalled — guard prevents overwriting an active merchant if this fires after re-install
  await db.merchant.updateMany({
    where: { shopDomain: shop, uninstalledAt: null },
    data: { uninstalledAt: new Date() },
  });

  // 2. Delete credential (idempotent — deleteMany won't throw if not found)
  await deleteCredential(shop);

  // 3. Delete Shopify sessions
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
