import { describe, it, expect } from "vitest";
import { envSchema } from "./env.schema.js";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  SHOPIFY_API_KEY: "test-key",
  SHOPIFY_API_SECRET: "test-secret",
  ENCRYPTION_KEY: "a".repeat(64),
};

describe("env validation schema", () => {
  it("parses valid environment successfully", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TINGEE_SDK_TIMEOUT_MS).toBe(4000);
      expect(result.data.NODE_ENV).toBe("development");
    }
  });

  it("applies default TINGEE_SDK_TIMEOUT_MS of 4000 when not provided", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TINGEE_SDK_TIMEOUT_MS).toBe(4000);
    }
  });

  it("accepts custom TINGEE_SDK_TIMEOUT_MS value", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      TINGEE_SDK_TIMEOUT_MS: "5000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TINGEE_SDK_TIMEOUT_MS).toBe(5000);
    }
  });

  it("fails when DATABASE_URL is missing", () => {
    const { DATABASE_URL: _, ...withoutDb } = validEnv;
    const result = envSchema.safeParse(withoutDb);
    expect(result.success).toBe(false);
  });

  it("fails when ENCRYPTION_KEY is too short", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      ENCRYPTION_KEY: "a".repeat(32),
    });
    expect(result.success).toBe(false);
  });

  it("fails when ENCRYPTION_KEY is not hex", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      ENCRYPTION_KEY: "z".repeat(64),
    });
    expect(result.success).toBe(false);
  });

  it("SENTRY_DSN is optional", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SENTRY_DSN).toBeUndefined();
    }
  });
});
