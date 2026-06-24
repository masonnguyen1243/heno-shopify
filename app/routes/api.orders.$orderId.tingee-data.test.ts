import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoaderFunctionArgs } from "react-router";

vi.mock("../shopify.server", () => ({
  authenticate: {
    public: {
      checkout: vi.fn(),
    },
  },
}));

vi.mock("../services/payment.server", () => ({
  createPaymentData: vi.fn(),
}));

vi.mock("../lib/logger.server", () => ({
  sanitizeForLog: vi.fn((obj) => obj),
}));

vi.mock("../services/tingee.server", () => ({
  TingeeConnectionError: class TingeeConnectionError extends Error {
    constructor(msg?: string) {
      super(msg ?? "Cannot connect to Tingee");
      this.name = "TingeeConnectionError";
    }
  },
}));

import { loader } from "./api.orders.$orderId.tingee-data";
import { authenticate } from "../shopify.server";
import { createPaymentData } from "../services/payment.server";
import { TingeeConnectionError } from "../services/tingee.server";

function mockCheckoutAuth(shopDomain = "test.myshopify.com") {
  vi.mocked(authenticate.public.checkout).mockResolvedValue({
    sessionToken: { dest: `https://${shopDomain}` },
  } as any);
}

function makeRequest(
  orderId: string,
  query: Record<string, string> = {}
): Request {
  const url = new URL(
    `/api/orders/${orderId}/tingee-data`,
    "https://test.myshopify.com"
  );
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

const validQuery = { amount: "150000", orderNumber: "1001" };

describe("GET /api/orders/:orderId/tingee-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with payment data on success", async () => {
    mockCheckoutAuth();
    const paymentData = {
      qrImageUrl: "data:image/png;base64,ABC",
      deeplinkUrl: "tingee://pay?abc",
      amount: 150000,
      currency: "VND" as const,
      status: "PENDING",
      expiresAt: "2026-06-24T10:00:00.000Z",
      orderId: "gid://shopify/Order/123",
    };
    vi.mocked(createPaymentData).mockResolvedValue(paymentData);

    const request = makeRequest("gid://shopify/Order/123", validQuery);
    const args: LoaderFunctionArgs = {
      request,
      params: { orderId: "gid://shopify/Order/123" },
      context: {},
    };

    const response = await loader(args);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(paymentData);
  });

  it("returns 400 when orderId is missing", async () => {
    mockCheckoutAuth();

    const request = makeRequest("", validQuery);
    const args: LoaderFunctionArgs = {
      request,
      params: {},
      context: {},
    };

    const response = await loader(args);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 when amount is missing", async () => {
    mockCheckoutAuth();

    const request = makeRequest("gid://shopify/Order/123", {
      orderNumber: "1001",
    });
    const args: LoaderFunctionArgs = {
      request,
      params: { orderId: "gid://shopify/Order/123" },
      context: {},
    };

    const response = await loader(args);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 when amount is not a positive integer", async () => {
    mockCheckoutAuth();

    const request = makeRequest("gid://shopify/Order/123", {
      amount: "-100",
      orderNumber: "1001",
    });
    const args: LoaderFunctionArgs = {
      request,
      params: { orderId: "gid://shopify/Order/123" },
      context: {},
    };

    const response = await loader(args);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("INVALID_REQUEST");
  });

  it("returns 503 when TingeeConnectionError is thrown", async () => {
    mockCheckoutAuth();
    vi.mocked(createPaymentData).mockRejectedValue(
      new TingeeConnectionError("Timeout")
    );

    const request = makeRequest("gid://shopify/Order/123", validQuery);
    const args: LoaderFunctionArgs = {
      request,
      params: { orderId: "gid://shopify/Order/123" },
      context: {},
    };

    const response = await loader(args);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("TINGEE_UNAVAILABLE");
    expect(data.code).toBe("TINGEE_UNAVAILABLE");
  });

  it("returns 500 on unexpected errors", async () => {
    mockCheckoutAuth();
    vi.mocked(createPaymentData).mockRejectedValue(new Error("DB failure"));

    const request = makeRequest("gid://shopify/Order/123", validQuery);
    const args: LoaderFunctionArgs = {
      request,
      params: { orderId: "gid://shopify/Order/123" },
      context: {},
    };

    const response = await loader(args);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.code).toBe("INTERNAL_ERROR");
  });

  it("IDOR: shop is taken from sessionToken.dest not from URL", async () => {
    // Different shop in session vs URL
    vi.mocked(authenticate.public.checkout).mockResolvedValue({
      sessionToken: { dest: "https://real-shop.myshopify.com" },
    } as any);
    vi.mocked(createPaymentData).mockResolvedValue({
      qrImageUrl: "data:image/png;base64,X",
      deeplinkUrl: null,
      amount: 100,
      currency: "VND",
      status: "PENDING",
      expiresAt: "2026-06-24T10:00:00.000Z",
      orderId: "gid://shopify/Order/123",
    });

    const request = makeRequest("gid://shopify/Order/123", validQuery);
    const args: LoaderFunctionArgs = {
      request,
      params: { orderId: "gid://shopify/Order/123" },
      context: {},
    };

    await loader(args);

    // Verify createPaymentData was called with shop from sessionToken, not URL
    expect(createPaymentData).toHaveBeenCalledWith(
      expect.objectContaining({
        shopDomain: "real-shop.myshopify.com",
      })
    );
  });
});
