import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../db.server", () => ({
  default: {
    processedWebhook: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { insertIdempotencyRecord, updateIdempotencyStatus } from "./idempotency.server";
import db from "../db.server";

const KEY = "tingee:TX_ABC123";
const PARAMS = { idempotencyKey: KEY, topic: "payment.confirmed", shopDomain: "shop.myshopify.com" };

describe("insertIdempotencyRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'inserted' when INSERT succeeds", async () => {
    vi.mocked(db.processedWebhook.create).mockResolvedValue({} as any);
    const result = await insertIdempotencyRecord(PARAMS);
    expect(result).toBe("inserted");
    expect(db.processedWebhook.create).toHaveBeenCalledWith({
      data: { idempotencyKey: KEY, topic: "payment.confirmed", shopDomain: "shop.myshopify.com", status: "PENDING" },
    });
  });

  it("returns 'duplicate' on P2002 error without throwing", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "6.0.0",
    });
    vi.mocked(db.processedWebhook.create).mockRejectedValue(p2002);
    const result = await insertIdempotencyRecord(PARAMS);
    expect(result).toBe("duplicate");
  });

  it("rethrows non-P2002 DB errors", async () => {
    const dbError = new Error("Connection refused");
    vi.mocked(db.processedWebhook.create).mockRejectedValue(dbError);
    await expect(insertIdempotencyRecord(PARAMS)).rejects.toThrow("Connection refused");
  });
});

describe("updateIdempotencyStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls db.processedWebhook.update with correct args", async () => {
    vi.mocked(db.processedWebhook.update).mockResolvedValue({} as any);
    await updateIdempotencyStatus(KEY, "COMPLETED");
    expect(db.processedWebhook.update).toHaveBeenCalledWith({
      where: { idempotencyKey: KEY },
      data: { status: "COMPLETED" },
    });
  });
});
