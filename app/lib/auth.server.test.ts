import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "react-router";

// Mock shopify.server BEFORE importing auth.server
vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

import { requireShopSession } from "./auth.server";
import { authenticate } from "../shopify.server";

describe("requireShopSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns shop and session when valid", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: { shop: "test-store.myshopify.com", accessToken: "tok" } as any,
    } as any);
    const result = await requireShopSession(new Request("http://localhost/app"));
    expect(result.shop).toBe("test-store.myshopify.com");
  });

  it("redirects to /auth when session.shop is missing", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {} as any,
    } as any);
    const thrown = await requireShopSession(
      new Request("http://localhost/app")
    ).catch((e) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("Location")).toBe("/auth");
  });

  it("re-throws Response objects from authenticate.admin (OAuth redirects)", async () => {
    const oauthRedirect = redirect("/auth");
    vi.mocked(authenticate.admin).mockRejectedValueOnce(oauthRedirect);
    const thrown = await requireShopSession(
      new Request("http://localhost/app")
    ).catch((e) => e);
    expect(thrown).toBe(oauthRedirect);
  });

  it("redirects to /auth when session.shop is empty string", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: { shop: "", accessToken: "tok" } as any,
    } as any);
    const thrown = await requireShopSession(
      new Request("http://localhost/app")
    ).catch((e) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("Location")).toBe("/auth");
  });

  it("redirects to /auth when authenticate.admin throws a non-Response error", async () => {
    vi.mocked(authenticate.admin).mockRejectedValueOnce(new Error("network timeout"));
    const thrown = await requireShopSession(
      new Request("http://localhost/app")
    ).catch((e) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("Location")).toBe("/auth");
  });
});
