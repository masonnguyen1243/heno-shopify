const SENSITIVE_KEYS = new Set([
  "secretToken",
  "accessToken",
  "webhookSecret",
  "encryptedSecretToken",
  "encryptedClientId",
  "password",
]);

export function sanitizeForLog(
  obj: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      SENSITIVE_KEYS.has(k) ? "[REDACTED]" : v,
    ])
  );
}
