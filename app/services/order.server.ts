// Story 3.3 will implement markOrderPaid() and add retry logic.
import { unauthenticated } from "../shopify.server";
import { sanitizeForLog } from "../lib/logger.server";

export async function addOrderNote(shopDomain: string, orderId: string, note: string): Promise<void> {
  try {
    const { admin } = await unauthenticated.admin(shopDomain);

    // Fetch existing note to avoid overwriting it
    const queryResponse = await admin.graphql(
      `query getOrderNote($id: ID!) { order(id: $id) { note } }`,
      { variables: { id: orderId } }
    );
    const queryData = await queryResponse.json();
    const existingNote: string = queryData?.data?.order?.note ?? "";
    const combinedNote = existingNote ? `${existingNote}\n${note}` : note;

    const response = await admin.graphql(
      `mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id }
          userErrors { field message }
        }
      }`,
      { variables: { input: { id: orderId, note: combinedNote } } }
    );
    const data = await response.json();
    const userErrors = data?.data?.orderUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      console.warn("[WEBHOOK] addOrderNote userErrors", sanitizeForLog({ shopDomain, orderId, userErrors: userErrors.length }));
    }
  } catch (error) {
    console.warn("[WEBHOOK] addOrderNote failed (non-fatal)", sanitizeForLog({ shopDomain, orderId }));
  }
}

export async function markOrderPaid(_shopDomain: string, _orderId: string): Promise<void> {
  throw new Error("markOrderPaid not implemented — implement in Story 3.3");
}
