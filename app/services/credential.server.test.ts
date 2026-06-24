import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db.server", () => ({
  default: {
    merchant: {
      findUnique: vi.fn(),
    },
    merchantCredential: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../lib/encryption.server", () => ({
  encrypt: vi.fn((text: string) => `encrypted:${text}`),
  decrypt: vi.fn((cipher: string) => cipher.replace("encrypted:", "")),
}));

vi.mock("../lib/env.server", () => ({
  env: { ENCRYPTION_KEY: "a".repeat(64), TINGEE_SDK_TIMEOUT_MS: 4000 },
}));

import { getDecryptedCredential } from "./credential.server";
import db from "../db.server";
import { decrypt } from "../lib/encryption.server";

describe("getDecryptedCredential", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when merchant not found", async () => {
    vi.mocked(db.merchant.findUnique).mockResolvedValue(null);
    const result = await getDecryptedCredential("unknown.myshopify.com");
    expect(result).toBeNull();
  });

  it("returns null when merchant has no credential", async () => {
    vi.mocked(db.merchant.findUnique).mockResolvedValue({
      id: "m1",
      shopDomain: "test.myshopify.com",
      credential: null,
    } as any);
    const result = await getDecryptedCredential("test.myshopify.com");
    expect(result).toBeNull();
  });

  it("returns decrypted clientId and secretToken when credential exists", async () => {
    vi.mocked(db.merchant.findUnique).mockResolvedValue({
      id: "m1",
      shopDomain: "test.myshopify.com",
      credential: {
        encryptedClientId: "encrypted:my-client-id",
        encryptedSecretToken: "encrypted:my-secret",
      },
    } as any);
    vi.mocked(decrypt).mockImplementation((cipher: string) =>
      cipher.replace("encrypted:", "")
    );

    const result = await getDecryptedCredential("test.myshopify.com");

    expect(result).toEqual({
      clientId: "my-client-id",
      secretToken: "my-secret",
    });
    expect(decrypt).toHaveBeenCalledTimes(2);
  });

  it("queries by shopDomain", async () => {
    vi.mocked(db.merchant.findUnique).mockResolvedValue(null);
    await getDecryptedCredential("shop.myshopify.com");
    expect(db.merchant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopDomain: "shop.myshopify.com" },
      })
    );
  });
});
