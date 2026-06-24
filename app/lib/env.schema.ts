import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
  ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-f]{64}$/i,
      "must be a 64-character hex string (generate with: openssl rand -hex 32)"
    ),
  TINGEE_SDK_TIMEOUT_MS: z.coerce.number().default(4000),
  SENTRY_DSN: z.preprocess(v => (v === "" ? undefined : v), z.string().url().optional()),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;
