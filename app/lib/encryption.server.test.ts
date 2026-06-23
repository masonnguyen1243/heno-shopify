import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./encryption.server";

const TEST_KEY = "a".repeat(64); // 64-char hex = 32 bytes, valid for AES-256

describe("encrypt", () => {
  it("returns a JSON string with version, iv, tag, data fields", () => {
    const result = encrypt("hello", TEST_KEY);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("version", 1);
    expect(parsed).toHaveProperty("iv");
    expect(parsed).toHaveProperty("tag");
    expect(parsed).toHaveProperty("data");
  });

  it("returns ciphertext that differs from plaintext", () => {
    const plaintext = "my-secret-token";
    const result = encrypt(plaintext, TEST_KEY);
    expect(result).not.toEqual(plaintext);
    expect(JSON.parse(result).data).not.toEqual(
      Buffer.from(plaintext, "utf8").toString("hex")
    );
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const plaintext = "same-input";
    const result1 = encrypt(plaintext, TEST_KEY);
    const result2 = encrypt(plaintext, TEST_KEY);
    expect(result1).not.toEqual(result2);
  });
});

describe("decrypt", () => {
  it("roundtrips: decrypt(encrypt(plaintext)) === plaintext", () => {
    const plaintext = "super-secret-token-123";
    expect(decrypt(encrypt(plaintext, TEST_KEY), TEST_KEY)).toBe(plaintext);
  });

  it("roundtrips unicode plaintext correctly", () => {
    const plaintext = "tiếng việt 🎉";
    expect(decrypt(encrypt(plaintext, TEST_KEY), TEST_KEY)).toBe(plaintext);
  });

  it("throws if ciphertext is tampered", () => {
    const cipherJson = encrypt("data", TEST_KEY);
    const parsed = JSON.parse(cipherJson);
    parsed.data = "deadbeef" + parsed.data.slice(8); // corrupt data
    expect(() => decrypt(JSON.stringify(parsed), TEST_KEY)).toThrow();
  });
});
