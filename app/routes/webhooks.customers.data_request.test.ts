import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionFunctionArgs } from "react-router";

vi.mock("../shopify.server", () => ({ authenticate: { webhook: vi.fn() } }));
vi.mock("../lib/logger.server", () => ({ sanitizeForLog: vi.fn((obj) => obj) }));

import { action } from "./webhooks.customers.data_request";
import { authenticate } from "../shopify.server";

const makeRequest = () =>
  ({
    request: new Request("http://localhost/webhooks/customers/data_request", { method: "POST" }),
    params: {},
    context: {},
  }) as unknown as ActionFunctionArgs;

describe("customers/data_request webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("always returns 200", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      topic: "CUSTOMERS_DATA_REQUEST",
      payload: { customer: { id: 123 } },
    } as any);

    const res = await action(makeRequest());
    expect(res.status).toBe(200);
  });

  it("makes no DB operations", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      topic: "CUSTOMERS_DATA_REQUEST",
      payload: {},
    } as any);

    const res = await action(makeRequest());
    expect(res.status).toBe(200);
  });
});
