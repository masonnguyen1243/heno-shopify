import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionFunctionArgs } from "react-router";

vi.mock("../shopify.server", () => ({ authenticate: { webhook: vi.fn() } }));
vi.mock("../db.server", () => ({
  default: {
    processedWebhook: { deleteMany: vi.fn() },
    payment: { deleteMany: vi.fn() },
    merchantCredential: { deleteMany: vi.fn() },
    merchant: { deleteMany: vi.fn() },
    session: { deleteMany: vi.fn() },
  },
}));
vi.mock("../lib/logger.server", () => ({ sanitizeForLog: vi.fn((obj) => obj) }));

import { action } from "./webhooks.shop.redact";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const makeRequest = () =>
  ({
    request: new Request("http://localhost/webhooks/shop/redact", { method: "POST" }),
    params: {},
    context: {},
  }) as unknown as ActionFunctionArgs;

describe("shop/redact webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls all 5 deleteMany in FK-safe order and returns 200", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      topic: "SHOP_REDACT",
      payload: {},
    } as any);
    vi.mocked(db.processedWebhook.deleteMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.payment.deleteMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.merchantCredential.deleteMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.merchant.deleteMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.session.deleteMany).mockResolvedValueOnce({ count: 0 } as any);

    const res = await action(makeRequest());
    expect(res.status).toBe(200);
    expect(db.processedWebhook.deleteMany).toHaveBeenCalledWith({ where: { shopDomain: "test.myshopify.com" } });
    expect(db.payment.deleteMany).toHaveBeenCalledWith({ where: { shopDomain: "test.myshopify.com" } });
    expect(db.merchantCredential.deleteMany).toHaveBeenCalledWith({ where: { merchant: { shopDomain: "test.myshopify.com" } } });
    expect(db.merchant.deleteMany).toHaveBeenCalledWith({ where: { shopDomain: "test.myshopify.com" } });
    expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { shop: "test.myshopify.com" } });
  });

  it("processedWebhook.deleteMany is called before payment.deleteMany", async () => {
    const callOrder: string[] = [];
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      topic: "SHOP_REDACT",
      payload: {},
    } as any);
    vi.mocked(db.processedWebhook.deleteMany).mockImplementationOnce(async () => {
      callOrder.push("processedWebhook");
      return { count: 0 };
    });
    vi.mocked(db.payment.deleteMany).mockImplementationOnce(async () => {
      callOrder.push("payment");
      return { count: 0 };
    });
    vi.mocked(db.merchantCredential.deleteMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.merchant.deleteMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.session.deleteMany).mockResolvedValueOnce({ count: 0 } as any);

    await action(makeRequest());
    expect(callOrder.indexOf("processedWebhook")).toBeLessThan(callOrder.indexOf("payment"));
  });

  it("returns 200 and continues remaining deletions even if merchant.deleteMany throws", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      topic: "SHOP_REDACT",
      payload: {},
    } as any);
    vi.mocked(db.processedWebhook.deleteMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.payment.deleteMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.merchantCredential.deleteMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.merchant.deleteMany).mockRejectedValueOnce(new Error("DB error"));
    vi.mocked(db.session.deleteMany).mockResolvedValueOnce({ count: 0 } as any);

    const res = await action(makeRequest());
    expect(res.status).toBe(200);
    // session.deleteMany must still run even though merchant.deleteMany threw
    expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { shop: "test.myshopify.com" } });
  });

  it("each model deleteMany called with explicit shop filter", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      topic: "SHOP_REDACT",
      payload: {},
    } as any);
    vi.mocked(db.processedWebhook.deleteMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.payment.deleteMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.merchantCredential.deleteMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.merchant.deleteMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.session.deleteMany).mockResolvedValueOnce({ count: 0 } as any);

    await action(makeRequest());

    // All calls must have explicit filter — no undefined or empty where clause
    expect(db.processedWebhook.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ shopDomain: "test.myshopify.com" }) })
    );
    expect(db.payment.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ shopDomain: "test.myshopify.com" }) })
    );
    expect(db.merchantCredential.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchant: { shopDomain: "test.myshopify.com" } } })
    );
    expect(db.merchant.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopDomain: "test.myshopify.com" } })
    );
  });
});
