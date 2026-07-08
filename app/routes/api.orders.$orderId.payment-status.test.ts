import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoaderFunctionArgs } from "react-router";

vi.mock("../shopify.server", () => ({
  authenticate: {
    public: {
      checkout: vi.fn(),
    },
  },
}));

vi.mock("../db.server", () => ({
  default: {
    payment: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../lib/rateLimit.server", () => ({
  pollingRateLimiter: { isRateLimited: vi.fn().mockReturnValue(false) },
}));

import { loader } from "./api.orders.$orderId.payment-status";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { pollingRateLimiter } from "../lib/rateLimit.server";

function mockCheckoutAuth(shopDomain = "test.myshopify.com") {
  vi.mocked(authenticate.public.checkout).mockResolvedValue({
    sessionToken: { dest: `https://${shopDomain}` },
    cors: vi.fn((response: Response) => response),
  } as any);
}

function makeRequest(orderId: string): Request {
  const url = new URL(
    `/api/orders/${orderId}/payment-status`,
    "https://test.myshopify.com"
  );
  return new Request(url.toString());
}

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    orderId: "gid://shopify/Order/123",
    shopDomain: "test.myshopify.com",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 600_000),
    updatedAt: new Date("2026-06-24T10:00:00.000Z"),
    createdAt: new Date("2026-06-24T09:00:00.000Z"),
    ...overrides,
  };
}

const ORDER_ID = "gid://shopify/Order/123";

describe("GET /api/orders/:orderId/payment-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pollingRateLimiter.isRateLimited).mockReturnValue(false);
  });

  it("returns 400 when orderId is missing from params", async () => {
    mockCheckoutAuth();

    const response = await loader({
      request: makeRequest(""),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("INVALID_REQUEST");
  });

  it("returns 200 { status: PENDING } for PENDING payment not expired", async () => {
    mockCheckoutAuth();
    vi.mocked(db.payment.findFirst).mockResolvedValue(makePayment() as any);

    const response = await loader({
      request: makeRequest(ORDER_ID),
      params: { orderId: ORDER_ID },
      context: {},
    } as LoaderFunctionArgs);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: "PENDING" });
  });

  it("returns 200 { status: PENDING } for PROCESSING payment (mapped)", async () => {
    mockCheckoutAuth();
    vi.mocked(db.payment.findFirst).mockResolvedValue(
      makePayment({ status: "PROCESSING" }) as any
    );

    const response = await loader({
      request: makeRequest(ORDER_ID),
      params: { orderId: ORDER_ID },
      context: {},
    } as LoaderFunctionArgs);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: "PENDING" });
  });

  it("returns 200 { status: COMPLETED, paidAt } for SUCCESS payment", async () => {
    mockCheckoutAuth();
    const updatedAt = new Date("2026-06-24T10:00:00.000Z");
    vi.mocked(db.payment.findFirst).mockResolvedValue(
      makePayment({ status: "SUCCESS", updatedAt }) as any
    );

    const response = await loader({
      request: makeRequest(ORDER_ID),
      params: { orderId: ORDER_ID },
      context: {},
    } as LoaderFunctionArgs);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      status: "COMPLETED",
      paidAt: "2026-06-24T10:00:00.000Z",
    });
  });

  it("returns 200 { status: FAILED } for FAILED payment", async () => {
    mockCheckoutAuth();
    vi.mocked(db.payment.findFirst).mockResolvedValue(
      makePayment({ status: "FAILED" }) as any
    );

    const response = await loader({
      request: makeRequest(ORDER_ID),
      params: { orderId: ORDER_ID },
      context: {},
    } as LoaderFunctionArgs);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: "FAILED" });
  });

  it("returns 200 { status: EXPIRED } for EXPIRED status already in DB", async () => {
    mockCheckoutAuth();
    vi.mocked(db.payment.findFirst).mockResolvedValue(
      makePayment({ status: "EXPIRED" }) as any
    );

    const response = await loader({
      request: makeRequest(ORDER_ID),
      params: { orderId: ORDER_ID },
      context: {},
    } as LoaderFunctionArgs);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: "EXPIRED" });
  });

  it("auto-expires PENDING payment with past expiresAt and returns EXPIRED", async () => {
    mockCheckoutAuth();
    vi.mocked(db.payment.findFirst).mockResolvedValue(
      makePayment({ status: "PENDING", expiresAt: new Date(Date.now() - 1000) }) as any
    );
    vi.mocked(db.payment.updateMany).mockResolvedValue({ count: 1 } as any);

    const response = await loader({
      request: makeRequest(ORDER_ID),
      params: { orderId: ORDER_ID },
      context: {},
    } as LoaderFunctionArgs);
    const data = await response.json();

    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "pay-1", status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "EXPIRED" },
    });
    expect(response.status).toBe(200);
    expect(data).toEqual({ status: "EXPIRED" });
  });

  it("auto-expires PROCESSING payment with past expiresAt and returns EXPIRED", async () => {
    mockCheckoutAuth();
    vi.mocked(db.payment.findFirst).mockResolvedValue(
      makePayment({
        status: "PROCESSING",
        expiresAt: new Date(Date.now() - 1000),
      }) as any
    );
    vi.mocked(db.payment.updateMany).mockResolvedValue({ count: 1 } as any);

    const response = await loader({
      request: makeRequest(ORDER_ID),
      params: { orderId: ORDER_ID },
      context: {},
    } as LoaderFunctionArgs);
    const data = await response.json();

    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "pay-1", status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "EXPIRED" },
    });
    expect(data).toEqual({ status: "EXPIRED" });
  });

  it("returns EXPIRED even if updateMany throws during auto-expiry", async () => {
    mockCheckoutAuth();
    vi.mocked(db.payment.findFirst).mockResolvedValue(
      makePayment({ status: "PENDING", expiresAt: new Date(Date.now() - 1000) }) as any
    );
    vi.mocked(db.payment.updateMany).mockRejectedValue(new Error("DB error"));

    const response = await loader({
      request: makeRequest(ORDER_ID),
      params: { orderId: ORDER_ID },
      context: {},
    } as LoaderFunctionArgs);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: "EXPIRED" });
  });

  it("returns 404 when payment not found", async () => {
    mockCheckoutAuth();
    vi.mocked(db.payment.findFirst).mockResolvedValue(null);

    const response = await loader({
      request: makeRequest(ORDER_ID),
      params: { orderId: ORDER_ID },
      context: {},
    } as LoaderFunctionArgs);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.code).toBe("NOT_FOUND");
  });

  it("returns 500 when DB throws on findFirst", async () => {
    mockCheckoutAuth();
    vi.mocked(db.payment.findFirst).mockRejectedValue(new Error("DB error"));

    const response = await loader({
      request: makeRequest(ORDER_ID),
      params: { orderId: ORDER_ID },
      context: {},
    } as LoaderFunctionArgs);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.code).toBe("SERVER_ERROR");
  });

  it("returns 429 with Retry-After header when rate limit exceeded", async () => {
    mockCheckoutAuth();
    vi.mocked(db.payment.findFirst).mockResolvedValue(makePayment() as any);
    vi.mocked(pollingRateLimiter.isRateLimited).mockReturnValue(true);

    const response = await loader({
      request: makeRequest(ORDER_ID),
      params: { orderId: ORDER_ID },
      context: {},
    } as LoaderFunctionArgs);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(data.code).toBe("RATE_LIMITED");
  });

  it("IDOR: shop derived from sessionToken.dest, not query params", async () => {
    vi.mocked(authenticate.public.checkout).mockResolvedValue({
      sessionToken: { dest: "https://real-shop.myshopify.com" },
      cors: vi.fn((response: Response) => response),
    } as any);
    vi.mocked(db.payment.findFirst).mockResolvedValue(
      makePayment({ shopDomain: "real-shop.myshopify.com" }) as any
    );

    await loader({
      request: makeRequest(ORDER_ID),
      params: { orderId: ORDER_ID },
      context: {},
    } as LoaderFunctionArgs);

    expect(db.payment.findFirst).toHaveBeenCalledWith({
      where: { orderId: ORDER_ID, shopDomain: "real-shop.myshopify.com" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns 401 when sessionToken.dest is missing", async () => {
    vi.mocked(authenticate.public.checkout).mockResolvedValue({
      sessionToken: {},
      cors: vi.fn((response: Response) => response),
    } as any);

    const response = await loader({
      request: makeRequest(ORDER_ID),
      params: { orderId: ORDER_ID },
      context: {},
    } as LoaderFunctionArgs);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.code).toBe("UNAUTHORIZED");
  });
});
