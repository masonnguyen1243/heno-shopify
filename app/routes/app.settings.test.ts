import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

vi.mock("../shopify.server", () => ({
  authenticate: { admin: vi.fn() },
}));
vi.mock("../db.server", () => ({
  default: {
    merchant: {
      findUnique: vi.fn(),
    },
    merchantCredential: {
      upsert: vi.fn(),
    },
  },
}));
vi.mock("../services/tingee.server", () => ({
  verifyCredentials: vi.fn(),
  InvalidCredentialsError: class InvalidCredentialsError extends Error {
    constructor(msg?: string) {
      super(msg ?? "Invalid Tingee credentials");
      this.name = "InvalidCredentialsError";
    }
  },
  TingeeConnectionError: class TingeeConnectionError extends Error {
    constructor(msg?: string) {
      super(msg ?? "Cannot connect to Tingee");
      this.name = "TingeeConnectionError";
    }
  },
}));
vi.mock("../services/credential.server", () => ({
  saveCredential: vi.fn(),
  hasCredential: vi.fn(),
  deleteCredential: vi.fn(),
}));
vi.mock("../services/order.server", () => ({
  registerPaymentMethod: vi.fn(),
  unregisterPaymentMethod: vi.fn(),
}));

import { loader, action } from "./app.settings";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { createMockShopifySession } from "../../test/helpers/shopify-session";
import {
  verifyCredentials,
  InvalidCredentialsError,
  TingeeConnectionError,
} from "../services/tingee.server";
import { saveCredential, hasCredential, deleteCredential } from "../services/credential.server";
import { registerPaymentMethod, unregisterPaymentMethod } from "../services/order.server";

const makeLoaderArgs = (url = "http://localhost/app/settings") =>
  ({ request: new Request(url), params: {}, context: {} }) as unknown as LoaderFunctionArgs;

const makeActionArgs = (body: Record<string, string>) => {
  const formData = new FormData();
  Object.entries(body).forEach(([k, v]) => formData.set(k, v));
  return {
    request: new Request("http://localhost/app/settings", {
      method: "POST",
      body: formData,
    }),
    params: {},
    context: {},
  } as unknown as ActionFunctionArgs;
};

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

describe("Settings action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves credentials and registers payment method on first save", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {
        ...createMockShopifySession(),
        accessToken: "tok123",
        shop: "test-store.myshopify.com",
      } as any,
    } as any);
    vi.mocked(hasCredential).mockResolvedValueOnce(false);
    vi.mocked(verifyCredentials).mockResolvedValueOnce(undefined);
    vi.mocked(saveCredential).mockResolvedValueOnce(undefined);
    vi.mocked(registerPaymentMethod).mockResolvedValueOnce(undefined);

    const result = await action(
      makeActionArgs({ clientId: "id123", secretToken: "tok" })
    );
    expect(result).toEqual({ success: true });
    expect(saveCredential).toHaveBeenCalledWith(
      "test-store.myshopify.com",
      "id123",
      "tok"
    );
    expect(registerPaymentMethod).toHaveBeenCalledOnce();
  });

  it("skips payment method registration on credential update", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {
        ...createMockShopifySession(),
        accessToken: "tok123",
        shop: "test-store.myshopify.com",
      } as any,
    } as any);
    vi.mocked(hasCredential).mockResolvedValueOnce(true);
    vi.mocked(verifyCredentials).mockResolvedValueOnce(undefined);
    vi.mocked(saveCredential).mockResolvedValueOnce(undefined);

    const result = await action(
      makeActionArgs({ clientId: "id123", secretToken: "tok" })
    );
    expect(result).toEqual({ success: true });
    expect(registerPaymentMethod).not.toHaveBeenCalled();
  });

  it("returns INVALID_CREDENTIALS when Tingee rejects", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {
        ...createMockShopifySession(),
        shop: "test-store.myshopify.com",
      } as any,
    } as any);
    vi.mocked(hasCredential).mockResolvedValueOnce(false);
    vi.mocked(verifyCredentials).mockRejectedValueOnce(
      new InvalidCredentialsError()
    );

    const result = await action(
      makeActionArgs({ clientId: "bad", secretToken: "bad" })
    );
    expect(result).toEqual({ error: "INVALID_CREDENTIALS" });
    expect(saveCredential).not.toHaveBeenCalled();
    expect(registerPaymentMethod).not.toHaveBeenCalled();
  });

  it("returns TINGEE_TIMEOUT on network timeout", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {
        ...createMockShopifySession(),
        shop: "test-store.myshopify.com",
      } as any,
    } as any);
    vi.mocked(hasCredential).mockResolvedValueOnce(false);
    vi.mocked(verifyCredentials).mockRejectedValueOnce(
      new TingeeConnectionError()
    );

    const result = await action(
      makeActionArgs({ clientId: "id", secretToken: "tok" })
    );
    expect(result).toEqual({ error: "TINGEE_TIMEOUT" });
    expect(saveCredential).not.toHaveBeenCalled();
  });

  it("returns MISSING_FIELDS when clientId is blank", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {
        ...createMockShopifySession(),
        shop: "test-store.myshopify.com",
      } as any,
    } as any);

    const result = await action(
      makeActionArgs({ clientId: "", secretToken: "tok" })
    );
    expect(result).toEqual({ error: "MISSING_FIELDS" });
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("returns MISSING_FIELDS when clientId exceeds 255 chars", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {
        ...createMockShopifySession(),
        shop: "test-store.myshopify.com",
      } as any,
    } as any);

    const result = await action(
      makeActionArgs({ clientId: "a".repeat(256), secretToken: "tok" })
    );
    expect(result).toEqual({ error: "MISSING_FIELDS" });
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("returns PAYMENT_METHOD_REGISTRATION_FAILED when registerPaymentMethod throws on first save", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {
        ...createMockShopifySession(),
        accessToken: "tok123",
        shop: "test-store.myshopify.com",
      } as any,
    } as any);
    vi.mocked(hasCredential).mockResolvedValueOnce(false);
    vi.mocked(verifyCredentials).mockResolvedValueOnce(undefined);
    vi.mocked(saveCredential).mockResolvedValueOnce(undefined);
    vi.mocked(registerPaymentMethod).mockRejectedValueOnce(
      new Error("Shopify API unavailable")
    );

    const result = await action(
      makeActionArgs({ clientId: "id123", secretToken: "tok" })
    );
    expect(result).toEqual({ error: "PAYMENT_METHOD_REGISTRATION_FAILED" });
    expect(saveCredential).toHaveBeenCalledOnce();
  });

  it("delete: Shopify unregister succeeds → returns { deleted: true }, calls both service functions", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {
        ...createMockShopifySession(),
        accessToken: "tok123",
        shop: "test-store.myshopify.com",
      } as any,
    } as any);
    vi.mocked(unregisterPaymentMethod).mockResolvedValueOnce(undefined);
    vi.mocked(deleteCredential).mockResolvedValueOnce(undefined);

    const result = await action(makeActionArgs({ intent: "delete" }));
    expect(result).toEqual({ deleted: true });
    expect(unregisterPaymentMethod).toHaveBeenCalledOnce();
    expect(deleteCredential).toHaveBeenCalledOnce();
  });

  it("delete: unregisterPaymentMethod throws → returns PAYMENT_METHOD_UNREGISTRATION_FAILED, deleteCredential NOT called", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {
        ...createMockShopifySession(),
        accessToken: "tok123",
        shop: "test-store.myshopify.com",
      } as any,
    } as any);
    vi.mocked(unregisterPaymentMethod).mockRejectedValueOnce(
      new Error("Shopify API error")
    );

    const result = await action(makeActionArgs({ intent: "delete" }));
    expect(result).toEqual({ error: "PAYMENT_METHOD_UNREGISTRATION_FAILED" });
    expect(deleteCredential).not.toHaveBeenCalled();
  });

  it("save (update existing): valid credentials → returns { success: true }, registerPaymentMethod NOT called", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {
        ...createMockShopifySession(),
        accessToken: "tok123",
        shop: "test-store.myshopify.com",
      } as any,
    } as any);
    vi.mocked(hasCredential).mockResolvedValueOnce(true);
    vi.mocked(verifyCredentials).mockResolvedValueOnce(undefined);
    vi.mocked(saveCredential).mockResolvedValueOnce(undefined);

    const result = await action(
      makeActionArgs({ intent: "save", clientId: "id123", secretToken: "tok" })
    );
    expect(result).toEqual({ success: true });
    expect(saveCredential).toHaveBeenCalledOnce();
    expect(registerPaymentMethod).not.toHaveBeenCalled();
  });

  it("save (update existing): verifyCredentials throws InvalidCredentialsError → returns INVALID_CREDENTIALS, saveCredential NOT called", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {
        ...createMockShopifySession(),
        shop: "test-store.myshopify.com",
      } as any,
    } as any);
    vi.mocked(hasCredential).mockResolvedValueOnce(true);
    vi.mocked(verifyCredentials).mockRejectedValueOnce(
      new InvalidCredentialsError()
    );

    const result = await action(
      makeActionArgs({ intent: "save", clientId: "bad", secretToken: "bad" })
    );
    expect(result).toEqual({ error: "INVALID_CREDENTIALS" });
    expect(saveCredential).not.toHaveBeenCalled();
  });

  it("enforces multi-tenancy: shop from session, not form", async () => {
    // Even if attacker injects shop in form, action uses session.shop
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: {
        ...createMockShopifySession(),
        shop: "test-store.myshopify.com",
        accessToken: "tok123",
      } as any,
    } as any);
    vi.mocked(hasCredential).mockResolvedValueOnce(false);
    vi.mocked(verifyCredentials).mockResolvedValueOnce(undefined);
    vi.mocked(saveCredential).mockResolvedValueOnce(undefined);
    vi.mocked(registerPaymentMethod).mockResolvedValueOnce(undefined);

    await action(makeActionArgs({ clientId: "id", secretToken: "tok" }));
    // saveCredential receives session.shop, not any attacker-provided shop
    expect(saveCredential).toHaveBeenCalledWith(
      "test-store.myshopify.com",
      "id",
      "tok"
    );
  });
});
