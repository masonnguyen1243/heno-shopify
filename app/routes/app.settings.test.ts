import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoaderFunctionArgs } from "react-router";

vi.mock("../shopify.server", () => ({
  authenticate: { admin: vi.fn() },
}));
vi.mock("../db.server", () => ({
  default: {
    merchant: {
      findUnique: vi.fn(),
    },
  },
}));

import { loader } from "./app.settings";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { createMockShopifySession } from "../../test/helpers/shopify-session";

const makeLoaderArgs = (url = "http://localhost/app/settings") =>
  ({ request: new Request(url), params: {}, context: {} }) as unknown as LoaderFunctionArgs;

describe("Settings loader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns hasCredential=false when no credential exists", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: createMockShopifySession() as any,
    } as any);
    vi.mocked(db.merchant.findUnique).mockResolvedValueOnce({
      id: "m1",
      shopDomain: "test-store.myshopify.com",
      installedAt: new Date(),
      uninstalledAt: null,
      credential: null,
    } as any);

    const result = await loader(makeLoaderArgs());
    expect(result.hasCredential).toBe(false);
  });

  it("returns hasCredential=true when credential exists", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: createMockShopifySession() as any,
    } as any);
    vi.mocked(db.merchant.findUnique).mockResolvedValueOnce({
      id: "m1",
      shopDomain: "test-store.myshopify.com",
      installedAt: new Date(),
      uninstalledAt: null,
      credential: { id: "cred1" },
    } as any);

    const result = await loader(makeLoaderArgs());
    expect(result.hasCredential).toBe(true);
  });

  it("throws redirect when session missing (requireShopSession guard)", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {} as any,
    } as any);
    const error = await loader(makeLoaderArgs()).catch((e) => e);
    expect(error).toBeInstanceOf(Response);
    expect(error.status).toBe(302);
    expect(error.headers.get("Location")).toContain("/auth");
  });
});
