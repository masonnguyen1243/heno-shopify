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

import { action } from "./webhooks.tingee";
import { webhookRateLimiter } from "../lib/rateLimit.server";
import { getDecryptedCredential } from "../services/credential.server";
import { verifyWebhookHMAC } from "../services/tingee.server";
import { sanitizeForLog } from "../lib/logger.server";

const SHOP = "test.myshopify.com";
const VALID_BODY = JSON.stringify({ transactionCode: "TX123" });
const DEFAULT_HEADERS = {
  "x-signature": "valid-sig",
  "x-request-timestamp": "20260629143052123",
  "content-type": "application/json",
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
});
