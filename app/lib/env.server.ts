import { envSchema } from "./env.schema.js";

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error(
    "❌ Invalid environment variables:",
    result.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const env = result.data;
