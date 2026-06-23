import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionFunctionArgs } from "react-router";

vi.mock("../shopify.server", () => ({ authenticate: { webhook: vi.fn() } }));
vi.mock("../db.server", () => ({
  default: {
    payment: { deleteMany: vi.fn() },
  },
}));
vi.mock("../lib/logger.server", () => ({ sanitizeForLog: vi.fn((obj) => obj) }));

import { action } from "./webhooks.customers.redact";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const makeRequest = () =>
  ({
    request: new Request("http://localhost/webhooks/customers/redact", { method: "POST" }),
    params: {},
    context: {},
  }) as unknown as ActionFunctionArgs;

describe("customers/redact webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes payment records for orders_to_redact", async () => {
    const orders = ["gid://shopify/Order/1", "gid://shopify/Order/2"];
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      topic: "CUSTOMERS_REDACT",
      payload: { orders_to_redact: orders },
    } as any);
    vi.mocked(db.payment.deleteMany).mockResolvedValueOnce({ count: 2 } as any);

    const res = await action(makeRequest());
    expect(res.status).toBe(200);
    expect(db.payment.deleteMany).toHaveBeenCalledWith({
      where: { shopDomain: "test.myshopify.com", orderId: { in: orders } },
    });
  });

  it("does not call deleteMany when orders_to_redact is empty", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      topic: "CUSTOMERS_REDACT",
      payload: { orders_to_redact: [] },
    } as any);

    const res = await action(makeRequest());
    expect(res.status).toBe(200);
    expect(db.payment.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 200 even if deleteMany throws", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      topic: "CUSTOMERS_REDACT",
      payload: { orders_to_redact: ["gid://shopify/Order/1"] },
    } as any);
    vi.mocked(db.payment.deleteMany).mockRejectedValueOnce(new Error("DB error"));

    const res = await action(makeRequest());
    expect(res.status).toBe(200);
  });
});
