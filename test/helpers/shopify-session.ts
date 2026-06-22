export interface MockShopifySession {
  shop: string;
  accessToken: string;
  scope: string;
  id?: string;
  state?: string;
  isOnline?: boolean;
}

export function createMockShopifySession(
  overrides: Partial<MockShopifySession> = {}
): MockShopifySession {
  return {
    id: "test-session-id",
    shop: "test-store.myshopify.com",
    accessToken: "shpat_test_token",
    scope:
      "read_orders,write_orders,read_payment_gateways,write_payment_gateways",
    state: "test-state",
    isOnline: false,
    ...overrides,
  };
}
