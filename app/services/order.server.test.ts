import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../shopify.server", () => ({
  unauthenticated: { admin: vi.fn() },
}));
vi.mock("../lib/logger.server", () => ({
  sanitizeForLog: vi.fn((obj) => obj),
}));

import { addOrderNote, markOrderPaid } from "./order.server";
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
  it("throws Error with 'not implemented' message (stub behavior)", async () => {
    await expect(markOrderPaid(SHOP, ORDER_ID)).rejects.toThrow(
      "markOrderPaid not implemented — implement in Story 3.3"
    );
  });
});
