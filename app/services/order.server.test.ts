import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../shopify.server", () => ({
  unauthenticated: { admin: vi.fn() },
}));
vi.mock("../lib/logger.server", () => ({
  sanitizeForLog: vi.fn((obj) => obj),
}));

import { addOrderNote, markOrderPaid, ShopifyMarkPaidError } from "./order.server";
import { unauthenticated } from "../shopify.server";

const SHOP = "test.myshopify.com";
const ORDER_ID = "gid://shopify/Order/12345";

function makeAdminMock(currentNote = "", userErrors: unknown[] = []) {
  const graphql = vi.fn()
    .mockResolvedValueOnce({
      json: async () => ({ data: { order: { note: currentNote } } }),
    })
    .mockResolvedValueOnce({
      json: async () => ({ data: { orderUpdate: { order: { id: ORDER_ID }, userErrors } } }),
    });
  vi.mocked(unauthenticated.admin).mockResolvedValue({ admin: { graphql } } as any);
  return graphql;
}

function makeMarkPaidAdminMock(responses: Array<{ status: number; userErrors?: unknown[] }>) {
  const calls: number[] = [];
  const graphql = vi.fn().mockImplementation(async () => {
    const res = responses[calls.length] ?? responses[responses.length - 1];
    calls.push(res.status);
    return {
      status: res.status,
      json: async () => ({
        data: {
          orderMarkAsPaid: {
            order: res.status < 400 && !res.userErrors?.length ? { id: ORDER_ID, financialStatus: "PAID" } : null,
            userErrors: res.userErrors ?? [],
          },
        },
      }),
    };
  });
  vi.mocked(unauthenticated.admin).mockResolvedValue({ admin: { graphql } } as any);
  return graphql;
}

describe("addOrderNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("appends new note to existing note in orderUpdate mutation", async () => {
    const graphql = makeAdminMock("existing note");
    await addOrderNote(SHOP, ORDER_ID, "new note");
    expect(graphql).toHaveBeenCalledTimes(2);
    expect(graphql).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("orderUpdate"),
      expect.objectContaining({ variables: { input: { id: ORDER_ID, note: "existing note\nnew note" } } })
    );
  });

  it("uses only the new note when order has no existing note", async () => {
    const graphql = makeAdminMock("");
    await addOrderNote(SHOP, ORDER_ID, "new note");
    expect(graphql).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("orderUpdate"),
      expect.objectContaining({ variables: { input: { id: ORDER_ID, note: "new note" } } })
    );
  });

  it("logs warning when userErrors returned but does NOT throw", async () => {
    makeAdminMock("", [{ field: "id", message: "Not found" }]);
    await expect(addOrderNote(SHOP, ORDER_ID, "note")).resolves.toBeUndefined();
  });

  it("does NOT throw when admin.graphql rejects (non-fatal)", async () => {
    vi.mocked(unauthenticated.admin).mockResolvedValue({
      admin: { graphql: vi.fn().mockRejectedValue(new Error("Network error")) },
    } as any);
    await expect(addOrderNote(SHOP, ORDER_ID, "note")).resolves.toBeUndefined();
  });
});

describe("markOrderPaid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("succeeds on first attempt and returns retryCount 0", async () => {
    const graphql = makeMarkPaidAdminMock([{ status: 200 }]);
    const resultPromise = markOrderPaid(SHOP, ORDER_ID);
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(result.retryCount).toBe(0);
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and succeeds on attempt 2, returns retryCount 1", async () => {
    const graphql = makeMarkPaidAdminMock([{ status: 429 }, { status: 200 }]);
    const resultPromise = markOrderPaid(SHOP, ORDER_ID);
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(result.retryCount).toBe(1);
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("exhausts all 4 attempts on 500 and throws ShopifyMarkPaidError with retryCount 3", async () => {
    const graphql = makeMarkPaidAdminMock([{ status: 500 }]); // last response repeats
    const resultPromise = markOrderPaid(SHOP, ORDER_ID).catch((e) => e);
    await vi.runAllTimersAsync();
    const error = await resultPromise;
    expect(error).toBeInstanceOf(ShopifyMarkPaidError);
    expect(error.retryCount).toBe(3);
    expect(graphql).toHaveBeenCalledTimes(4);
  });

  it("does NOT retry on 404 — throws immediately with retryCount 0", async () => {
    const graphql = makeMarkPaidAdminMock([{ status: 404 }]);
    const resultPromise = markOrderPaid(SHOP, ORDER_ID).catch((e) => e);
    await vi.runAllTimersAsync();
    const error = await resultPromise;
    expect(error).toBeInstanceOf(ShopifyMarkPaidError);
    expect(error.retryCount).toBe(0);
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("throws ShopifyMarkPaidError on userErrors in 200 response with retryCount 0", async () => {
    const graphql = makeMarkPaidAdminMock([
      { status: 200, userErrors: [{ field: "id", message: "Order already paid" }] },
    ]);
    const resultPromise = markOrderPaid(SHOP, ORDER_ID).catch((e) => e);
    await vi.runAllTimersAsync();
    const error = await resultPromise;
    expect(error).toBeInstanceOf(ShopifyMarkPaidError);
    expect(error.retryCount).toBe(0);
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("sets httpStatus correctly on 4xx permanent failure", async () => {
    makeMarkPaidAdminMock([{ status: 403 }]);
    const resultPromise = markOrderPaid(SHOP, ORDER_ID).catch((e) => e);
    await vi.runAllTimersAsync();
    const error = await resultPromise;
    expect(error).toBeInstanceOf(ShopifyMarkPaidError);
    expect(error.httpStatus).toBe(403);
    expect(error.retryCount).toBe(0);
  });

  it("retries on network error and throws after max attempts", async () => {
    const graphql = vi.fn().mockRejectedValue(new Error("Network timeout"));
    vi.mocked(unauthenticated.admin).mockResolvedValue({ admin: { graphql } } as any);
    const resultPromise = markOrderPaid(SHOP, ORDER_ID).catch((e) => e);
    await vi.runAllTimersAsync();
    const error = await resultPromise;
    expect(error).toBeInstanceOf(ShopifyMarkPaidError);
    expect(error.retryCount).toBe(3);
    expect(graphql).toHaveBeenCalledTimes(4);
  });
});
