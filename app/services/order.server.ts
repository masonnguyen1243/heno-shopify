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
