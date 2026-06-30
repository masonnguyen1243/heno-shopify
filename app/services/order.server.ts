import { unauthenticated } from "../shopify.server";
import { sanitizeForLog } from "../lib/logger.server";

export class ShopifyMarkPaidError extends Error {
  constructor(
    message: string,
    public readonly retryCount: number,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "ShopifyMarkPaidError";
  }
}

const RETRY_DELAYS_MS = [1000, 3000, 10000]; // backoff before attempts 2, 3, 4
const MAX_ATTEMPTS = 4;

export async function markOrderPaid(
  shopDomain: string,
  orderId: string,
): Promise<{ retryCount: number }> {
  const { admin } = await unauthenticated.admin(shopDomain);
  // Ensure GID format — extension strips it to numeric, GraphQL requires full GID
  const orderGid = orderId.startsWith("gid://") ? orderId : `gid://shopify/Order/${orderId}`;
  let retryCount = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
      retryCount++;
    }

    let response: Awaited<ReturnType<typeof admin.graphql>>;
    try {
      response = await admin.graphql(
        `#graphql
        mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
          orderMarkAsPaid(input: $input) {
            order { id }
            userErrors { field message }
          }
        }`,
        { variables: { input: { id: orderGid } } },
      );
    } catch (err) {
      console.error("[markOrderPaid] graphql threw exception", { attempt, orderGid, err: err instanceof Error ? err.message : String(err) });
      // Network error — treat as 5xx, retry if attempts remain
      if (attempt < MAX_ATTEMPTS - 1) continue;
      throw new ShopifyMarkPaidError(
        `Shopify API network error after ${MAX_ATTEMPTS} attempts`,
        retryCount,
      );
    }

    const httpStatus = response.status;

    // 429 or 5xx: retry (if attempts remain)
    if (httpStatus === 429 || httpStatus >= 500) {
      if (attempt < MAX_ATTEMPTS - 1) continue;
      throw new ShopifyMarkPaidError(
        `Shopify API failed after ${MAX_ATTEMPTS} attempts: HTTP ${httpStatus}`,
        retryCount,
        httpStatus,
      );
    }

    // 4xx (not 429): permanent failure, no retry
    if (httpStatus >= 400) {
      throw new ShopifyMarkPaidError(
        `Shopify API permanent failure: HTTP ${httpStatus}`,
        retryCount,
        httpStatus,
      );
    }

    // 2xx: check userErrors
    const data = await response.json();
    const userErrors: Array<{ field: string; message: string }> =
      data?.data?.orderMarkAsPaid?.userErrors ?? [];
    if (userErrors.length > 0) {
      // userErrors are client-side (e.g., order already paid) — no retry
      throw new ShopifyMarkPaidError(
        `orderMarkAsPaid userErrors: ${userErrors.map((e) => e.message).join(", ")}`,
        retryCount,
        httpStatus,
      );
    }

    return { retryCount };
  }

  // Unreachable — TypeScript exhaustiveness
  throw new ShopifyMarkPaidError("Unreachable retry exhaustion", retryCount);
}

export async function addOrderNote(shopDomain: string, orderId: string, note: string): Promise<void> {
  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    const orderGid = orderId.startsWith("gid://") ? orderId : `gid://shopify/Order/${orderId}`;

    // Fetch existing note to avoid overwriting it
    const queryResponse = await admin.graphql(
      `query getOrderNote($id: ID!) { order(id: $id) { note } }`,
      { variables: { id: orderGid } }
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
      { variables: { input: { id: orderGid, note: combinedNote } } }
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

