import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoaderFunctionArgs } from "react-router";

vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

vi.mock("../db.server", () => ({
  default: {
    merchant: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { loader } from "./app";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const makeLoaderArgs = (url = "http://localhost/app") =>
  ({ request: new Request(url), params: {}, context: {} }) as unknown as LoaderFunctionArgs;

describe("app.tsx loader — Merchant upsert", () => {
  const mockSession = { shop: "test-store.myshopify.com", accessToken: "tok" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.merchant.upsert).mockResolvedValue({} as any);
  });

  it("upserts Merchant with correct args on first install", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: mockSession as any,
    } as any);

    await loader(makeLoaderArgs());

    expect(db.merchant.upsert).toHaveBeenCalledOnce();
    expect(db.merchant.upsert).toHaveBeenCalledWith({
      where: { shopDomain: "test-store.myshopify.com" },
      update: { uninstalledAt: null },
      create: expect.objectContaining({ shopDomain: "test-store.myshopify.com", installedAt: expect.any(Date) }),
    });
  });

  it("calls upsert with uninstalledAt: null to clear flag on re-install", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: mockSession as any,
    } as any);

    await loader(makeLoaderArgs());

    const call = vi.mocked(db.merchant.upsert).mock.calls[0][0];
    expect(call.update).toEqual({ uninstalledAt: null });
    expect(call.create).toEqual(expect.objectContaining({ shopDomain: "test-store.myshopify.com", installedAt: expect.any(Date) }));
  });

  it("returns apiKey in response", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: mockSession as any,
    } as any);

    const result = await loader(makeLoaderArgs());
    expect(result).toHaveProperty("apiKey");
  });
});
