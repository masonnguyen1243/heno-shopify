const PAYMENT_METHOD_NAME = "Thanh toán qua Tingee QR";
const SHOPIFY_API_VERSION = "2025-07";


export async function registerPaymentMethod(
  shop: string,
  accessToken: string
): Promise<void> {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/payment_gateways.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payment_gateway: {
        name: PAYMENT_METHOD_NAME,
        type: "manual",
        enabled: true,
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to register payment method: HTTP ${response.status}`
    );
  }

  let json: { payment_gateway?: { id?: number } };
  try {
    json = (await response.json()) as { payment_gateway?: { id?: number } };
  } catch {
    throw new Error("Payment gateway registration: unexpected non-JSON response from Shopify");
  }
  if (!json.payment_gateway?.id) {
    throw new Error("Payment gateway registration returned unexpected response");
  }
}

export async function unregisterPaymentMethod(
  shop: string,
  accessToken: string
): Promise<void> {
  const listUrl = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/payment_gateways.json`;
  const listRes = await fetch(listUrl, {
    headers: { "X-Shopify-Access-Token": accessToken },
    signal: AbortSignal.timeout(10_000),
  });
  if (!listRes.ok) {
    throw new Error(`Failed to list payment gateways: HTTP ${listRes.status}`);
  }
  const { payment_gateways } = (await listRes.json()) as {
    payment_gateways: Array<{ id: number; name: string }>;
  };
  const gateway = payment_gateways.find((g) => g.name === PAYMENT_METHOD_NAME);
  if (!gateway) return;

  const deleteUrl = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/payment_gateways/${gateway.id}.json`;
  const deleteRes = await fetch(deleteUrl, {
    method: "DELETE",
    headers: { "X-Shopify-Access-Token": accessToken },
    signal: AbortSignal.timeout(10_000),
  });
  if (!deleteRes.ok) {
    throw new Error(`Failed to unregister payment method: HTTP ${deleteRes.status}`);
  }
}
