import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionFunctionArgs } from "react-router";

vi.mock("../shopify.server", () => ({ authenticate: { webhook: vi.fn() } }));
vi.mock("../db.server", () => ({
  default: {
    merchant: { updateMany: vi.fn() },
    session: { deleteMany: vi.fn() },
  },
}));
vi.mock("../services/credential.server", () => ({ deleteCredential: vi.fn() }));
vi.mock("../services/order.server", () => ({ unregisterPaymentMethod: vi.fn() }));
vi.mock("../lib/logger.server", () => ({ sanitizeForLog: vi.fn((obj) => obj) }));

import { action } from "./webhooks.app.uninstalled";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteCredential } from "../services/credential.server";
import { unregisterPaymentMethod } from "../services/order.server";

const makeRequest = () =>
  ({
    request: new Request("http://localhost/webhooks/app/uninstalled", { method: "POST" }),
    params: {},
    context: {},
  }) as unknown as ActionFunctionArgs;

describe("APP_UNINSTALLED webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("full cleanup when session exists", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      session: { accessToken: "tok_123" } as any,
      topic: "APP_UNINSTALLED",
      payload: {},
    } as any);
    vi.mocked(db.merchant.updateMany).mockResolvedValueOnce({ count: 1 } as any);
    vi.mocked(db.session.deleteMany).mockResolvedValueOnce({ count: 1 } as any);

    const res = await action(makeRequest());
    expect(res.status).toBe(200);
    expect(db.merchant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ uninstalledAt: expect.any(Date) }) })
    );
    expect(unregisterPaymentMethod).toHaveBeenCalledWith("test.myshopify.com", "tok_123");
    expect(deleteCredential).toHaveBeenCalledWith("test.myshopify.com");
    expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { shop: "test.myshopify.com" } });
  });

  it("skips unregisterPaymentMethod when session is null", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      session: null,
      topic: "APP_UNINSTALLED",
      payload: {},
    } as any);
    vi.mocked(db.merchant.updateMany).mockResolvedValueOnce({ count: 0 } as any);
    vi.mocked(db.session.deleteMany).mockResolvedValueOnce({ count: 0 } as any);

    const res = await action(makeRequest());
    expect(res.status).toBe(200);
    expect(unregisterPaymentMethod).not.toHaveBeenCalled();
    expect(deleteCredential).toHaveBeenCalled();
  });

  it("continues to deleteCredential if unregisterPaymentMethod throws", async () => {
    vi.mocked(authenticate.webhook).mockResolvedValueOnce({
      shop: "test.myshopify.com",
      session: { accessToken: "tok_123" } as any,
      topic: "APP_UNINSTALLED",
      payload: {},
    } as any);
    vi.mocked(db.merchant.updateMany).mockResolvedValueOnce({ count: 1 } as any);
    vi.mocked(unregisterPaymentMethod).mockRejectedValueOnce(new Error("Shopify 401"));
    vi.mocked(db.session.deleteMany).mockResolvedValueOnce({ count: 1 } as any);

    const res = await action(makeRequest());
    expect(res.status).toBe(200);
    expect(deleteCredential).toHaveBeenCalled();
  });
});
