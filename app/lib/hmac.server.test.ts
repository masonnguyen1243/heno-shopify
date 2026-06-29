import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyHMAC } from "./hmac.server";

const SECRET = "test-secret-token";
const TIMESTAMP = "20260629143052123";
const BODY = JSON.stringify({ transactionCode: "TX123" });
const VALID_SIG = createHmac("sha512", SECRET)
  .update(`${TIMESTAMP}:${BODY}`)
  .digest("hex");

describe("verifyHMAC", () => {
  it("returns true for valid signature and matching body", () => {
    expect(verifyHMAC({ signature: VALID_SIG, timestamp: TIMESTAMP, body: BODY, secretToken: SECRET })).toBe(true);
  });

  it("returns false for valid signature with tampered body", () => {
    const tamperedBody = JSON.stringify({ transactionCode: "TX999" });
    expect(verifyHMAC({ signature: VALID_SIG, timestamp: TIMESTAMP, body: tamperedBody, secretToken: SECRET })).toBe(false);
  });

  it("returns false for completely wrong signature", () => {
    expect(verifyHMAC({ signature: "deadbeef", timestamp: TIMESTAMP, body: BODY, secretToken: SECRET })).toBe(false);
  });

  it("returns false for empty signature string (graceful, no throw)", () => {
    expect(verifyHMAC({ signature: "", timestamp: TIMESTAMP, body: BODY, secretToken: SECRET })).toBe(false);
  });

  it("returns false for wrong secret token", () => {
    expect(verifyHMAC({ signature: VALID_SIG, timestamp: TIMESTAMP, body: BODY, secretToken: "wrong-secret" })).toBe(false);
  });
});
