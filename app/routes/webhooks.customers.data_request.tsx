import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // Phase 1: No customer PII stored.
  // Payment records contain orderId (Shopify GID) and amount only — no name, email, or address.
  return new Response();
};
