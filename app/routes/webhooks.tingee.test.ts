import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionFunctionArgs } from "react-router";

vi.mock("../lib/rateLimit.server", () => ({
  webhookRateLimiter: { isRateLimited: vi.fn().mockReturnValue(false) },
}));
vi.mock("../services/credential.server", () => ({
  getDecryptedCredential: vi.fn(),
}));
vi.mock("../services/tingee.server", () => ({
  verifyWebhookHMAC: vi.fn(),
}));
vi.mock("../lib/logger.server", () => ({
  sanitizeForLog: vi.fn((obj) => obj),
}));
vi.mock("../services/payment.server", () => ({
  reconcileWebhookPayment: vi.fn(),
}));
vi.mock("../services/order.server", () => ({
  markOrderPaid: vi.fn(),
  ShopifyMarkPaidError: class ShopifyMarkPaidError extends Error {
    retryCount: number;
    httpStatus?: number;
    constructor(message: string, retryCount: number, httpStatus?: number) {
      super(message);
      this.name = "ShopifyMarkPaidError";
      this.retryCount = retryCount;
      this.httpStatus = httpStatus;
    }
  },
}));
vi.mock("../lib/paymentStateMachine", () => ({
  assertValidTransition: vi.fn(),
}));
vi.mock("../lib/idempotency.server", () => ({
  insertIdempotencyRecord: vi.fn(),
  updateIdempotencyStatus: vi.fn(),
}));
vi.mock("../db.server", () => ({
  default: {
    payment: { update: vi.fn().mockResolvedValue({}) },
  },
}));

import { action } from "./webhooks.tingee";
import { webhookRateLimiter } from "../lib/rateLimit.server";
import { getDecryptedCredential } from "../services/credential.server";
import { verifyWebhookHMAC } from "../services/tingee.server";
import { sanitizeForLog } from "../lib/logger.server";
import { reconcileWebhookPayment } from "../services/payment.server";
import { markOrderPaid, ShopifyMarkPaidError } from "../services/order.server";
import { assertValidTransition } from "../lib/paymentStateMachine";
import { updateIdempotencyStatus } from "../lib/idempotency.server";
import db from "../db.server";

const SHOP = "test.myshopify.com";
const VALID_BODY = JSON.stringify({ transactionCode: "TX123", amount: 1500000, content: "TINGEE 1001" });
const DEFAULT_HEADERS = {
  "x-signature": "valid-sig",
  "x-request-timestamp": "20260629143052123",
  "content-type": "application/json",
};

const AMOUNT_MATCHED_RESULT = {
  type: "amount_matched" as const,
  payment: { id: "pay_123", orderId: "gid://shopify/Order/12345", amount: 1500000 },
  idempotencyKey: "tingee:TX_TEST_123",
};

function makeRequest(
  shopDomain: string | null = SHOP,
  headers: Record<string, string> = DEFAULT_HEADERS,
  body: string = VALID_BODY
): ActionFunctionArgs {
  const url = shopDomain
    ? `http://localhost/webhooks/tingee?shop=${shopDomain}`
    : "http://localhost/webhooks/tingee";
  return {
    request: new Request(url, { method: "POST", headers, body }),
    params: {},
    context: {},
  } as unknown as ActionFunctionArgs;
}

describe("webhooks.tingee action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(webhookRateLimiter.isRateLimited).mockReturnValue(false);
    vi.mocked(getDecryptedCredential).mockResolvedValue({ clientId: "cid", secretToken: "secret" });
    vi.mocked(verifyWebhookHMAC).mockReturnValue(true);
    vi.mocked(reconcileWebhookPayment).mockResolvedValue({ type: "skip" });
    vi.mocked(markOrderPaid).mockResolvedValue({ retryCount: 0 });
    vi.mocked(updateIdempotencyStatus).mockResolvedValue(undefined);
    vi.mocked(db.payment.update).mockResolvedValue({} as any);
  });

  it("returns 200 for valid HMAC and credential found", async () => {
    const res = await action(makeRequest());
    expect(res.status).toBe(200);
  });

  it("returns 400 when shop query param is missing", async () => {
    const res = await action(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it("returns 400 when credential not found", async () => {
    vi.mocked(getDecryptedCredential).mockResolvedValue(null);
    const res = await action(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 400 when verifyWebhookHMAC returns false", async () => {
    vi.mocked(verifyWebhookHMAC).mockReturnValue(false);
    const res = await action(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await action(makeRequest(SHOP, DEFAULT_HEADERS, "not-json"));
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(webhookRateLimiter.isRateLimited).mockReturnValue(true);
    const res = await action(makeRequest());
    expect(res.status).toBe(429);
  });

  it("does not call getDecryptedCredential on invalid HMAC path after rate limit check", async () => {
    vi.mocked(webhookRateLimiter.isRateLimited).mockReturnValue(true);
    await action(makeRequest());
    expect(getDecryptedCredential).not.toHaveBeenCalled();
  });

  it("calls sanitizeForLog when HMAC is invalid (security audit logging)", async () => {
    vi.mocked(verifyWebhookHMAC).mockReturnValue(false);
    await action(makeRequest());
    expect(sanitizeForLog).toHaveBeenCalled();
  });

  it("returns 400 when x-signature header is missing (empty string → verifyWebhookHMAC false)", async () => {
    vi.mocked(verifyWebhookHMAC).mockReturnValue(false);
    const headersWithoutSig = { "x-request-timestamp": "20260629143052123", "content-type": "application/json" };
    const res = await action(makeRequest(SHOP, headersWithoutSig));
    expect(res.status).toBe(400);
  });

  it("returns 400 when x-request-timestamp header is missing (empty string → verifyWebhookHMAC false)", async () => {
    vi.mocked(verifyWebhookHMAC).mockReturnValue(false);
    const headersWithoutTs = { "x-signature": "sig", "content-type": "application/json" };
    const res = await action(makeRequest(SHOP, headersWithoutTs));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed payload — no transactionCode", async () => {
    const res = await action(makeRequest(SHOP, DEFAULT_HEADERS, JSON.stringify({ amount: 1500000 })));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed payload — non-numeric amount", async () => {
    const res = await action(makeRequest(SHOP, DEFAULT_HEADERS, JSON.stringify({ transactionCode: "TX1", amount: "not-a-number" })));
    expect(res.status).toBe(400);
  });

  it("returns 200 when reconcile returns { type: 'skip' }", async () => {
    vi.mocked(reconcileWebhookPayment).mockResolvedValue({ type: "skip" });
    const res = await action(makeRequest());
    expect(res.status).toBe(200);
  });

  it("returns 200 when reconcile returns { type: 'no_payment_found' }", async () => {
    vi.mocked(reconcileWebhookPayment).mockResolvedValue({ type: "no_payment_found" });
    const res = await action(makeRequest());
    expect(res.status).toBe(200);
  });

  it("returns 200 when reconcile returns { type: 'invalid_transition' }", async () => {
    vi.mocked(reconcileWebhookPayment).mockResolvedValue({ type: "invalid_transition" });
    const res = await action(makeRequest());
    expect(res.status).toBe(200);
  });

  it("returns 200 when reconcile returns { type: 'amount_mismatch' }", async () => {
    vi.mocked(reconcileWebhookPayment).mockResolvedValue({ type: "amount_mismatch" });
    const res = await action(makeRequest());
    expect(res.status).toBe(200);
  });

  // AC #5: amount_matched success path
  it("amount_matched + markOrderPaid success → 200, payment updated to SUCCESS, idempotency COMPLETED", async () => {
    vi.mocked(reconcileWebhookPayment).mockResolvedValue(AMOUNT_MATCHED_RESULT);
    vi.mocked(markOrderPaid).mockResolvedValue({ retryCount: 0 });

    const res = await action(makeRequest());

    expect(res.status).toBe(200);
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_123" },
      data: { status: "SUCCESS" },
    });
    expect(updateIdempotencyStatus).toHaveBeenCalledWith("tingee:TX_TEST_123", "COMPLETED");
  });

  it("amount_matched + markOrderPaid success → assertValidTransition called with PROCESSING → SUCCESS", async () => {
    vi.mocked(reconcileWebhookPayment).mockResolvedValue(AMOUNT_MATCHED_RESULT);
    vi.mocked(markOrderPaid).mockResolvedValue({ retryCount: 0 });

    await action(makeRequest());

    expect(assertValidTransition).toHaveBeenCalledWith("PROCESSING", "SUCCESS");
  });

  // AC #4: amount_matched failure path
  it("amount_matched + markOrderPaid throws ShopifyMarkPaidError → 200, payment updated to FAILED, idempotency FAILED", async () => {
    vi.mocked(reconcileWebhookPayment).mockResolvedValue(AMOUNT_MATCHED_RESULT);
    const err = new (ShopifyMarkPaidError as any)("Shopify failed", 3, 500);
    vi.mocked(markOrderPaid).mockRejectedValue(err);

    const res = await action(makeRequest());

    expect(res.status).toBe(200);
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_123" },
      data: { status: "FAILED" },
    });
    expect(updateIdempotencyStatus).toHaveBeenCalledWith("tingee:TX_TEST_123", "FAILED");
  });

  it("amount_matched + markOrderPaid throws → sanitizeForLog called with shopDomain, orderId, retryCount", async () => {
    vi.mocked(reconcileWebhookPayment).mockResolvedValue(AMOUNT_MATCHED_RESULT);
    const err = new (ShopifyMarkPaidError as any)("Shopify failed", 2, 500);
    vi.mocked(markOrderPaid).mockRejectedValue(err);

    await action(makeRequest());

    expect(sanitizeForLog).toHaveBeenCalledWith(
      expect.objectContaining({
        shopDomain: SHOP,
        orderId: "gid://shopify/Order/12345",
        retryCount: 2,
      }),
    );
  });

  it("amount_matched + markOrderPaid throws ShopifyMarkPaidError(retryCount: 2) → metrics logged with retryCount: 2", async () => {
    vi.mocked(reconcileWebhookPayment).mockResolvedValue(AMOUNT_MATCHED_RESULT);
    const err = new (ShopifyMarkPaidError as any)("Shopify failed", 2, 500);
    vi.mocked(markOrderPaid).mockRejectedValue(err);

    const consoleSpy = vi.spyOn(console, "info");
    await action(makeRequest());

    expect(consoleSpy).toHaveBeenCalledWith(
      "[METRIC] webhook.retry_count",
      expect.objectContaining({ retryCount: 2 }),
    );
    consoleSpy.mockRestore();
  });

  it("amount_matched + db.payment.update throws on failure path → route still returns 200 and still calls updateIdempotencyStatus", async () => {
    vi.mocked(reconcileWebhookPayment).mockResolvedValue(AMOUNT_MATCHED_RESULT);
    const err = new (ShopifyMarkPaidError as any)("Shopify failed", 0, 404);
    vi.mocked(markOrderPaid).mockRejectedValue(err);
    vi.mocked(db.payment.update).mockRejectedValue(new Error("DB error"));

    const res = await action(makeRequest());

    expect(res.status).toBe(200);
    expect(updateIdempotencyStatus).toHaveBeenCalledWith("tingee:TX_TEST_123", "FAILED");
  });

  it("amount_matched + markOrderPaid success → webhook.processing_time metric emitted", async () => {
    vi.mocked(reconcileWebhookPayment).mockResolvedValue(AMOUNT_MATCHED_RESULT);
    vi.mocked(markOrderPaid).mockResolvedValue({ retryCount: 0 });

    const consoleSpy = vi.spyOn(console, "info");
    await action(makeRequest());

    expect(consoleSpy).toHaveBeenCalledWith(
      "[METRIC] webhook.processing_time",
      expect.objectContaining({ processingTimeMs: expect.any(Number) }),
    );
    consoleSpy.mockRestore();
  });
});
