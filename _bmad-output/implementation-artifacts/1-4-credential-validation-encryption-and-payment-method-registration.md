---
baseline_commit: 1736987
---

# Story 1.4: Credential Validation, Encryption & Payment Method Registration

Status: done

## Story

As a merchant,
I want my credentials to be validated with Tingee and saved securely, with the payment method automatically appearing at checkout,
So that setup is complete in one action — no manual Shopify configuration needed.

## Acceptance Criteria

1. **Given** a merchant enters valid Client ID + Secret Token and clicks "Lưu cài đặt", **When** Tingee API confirms the credentials are valid, **Then** credentials are saved AES-256 encrypted (`{version:1, iv, tag, data}` JSON) in `MerchantCredential`, badge shows "Đã kết nối" (success/green), and a success Banner auto-dismisses after 5 seconds

2. **Given** credentials are saved to the database, **When** the raw DB value of `encryptedSecretToken` is read (Testcontainers integration test), **Then** it is ciphertext — never plaintext

3. **Given** valid credentials saved for the first time, **When** payment method registration is triggered, **Then** a Shopify Manual Payment Method named "Thanh toán qua Tingee QR" is registered via Shopify REST Admin API (version 2025-07), and the merchant does NOT need any manual action in Shopify Admin

4. **Given** invalid credentials are submitted, **When** Tingee API returns an auth error, **Then** a critical Banner shows "Client ID hoặc Secret Token không đúng. Kiểm tra lại trong portal Tingee." — credentials are NOT saved, badge stays "Chưa kết nối"

5. **Given** a network timeout when verifying (>4000ms per `TINGEE_SDK_TIMEOUT_MS`), **When** the timeout occurs, **Then** a critical Banner shows "Không thể kết nối đến Tingee. Kiểm tra kết nối mạng và thử lại." — no credentials saved

6. **Given** the "Lưu cài đặt" button is clicked, **When** the API call is in progress, **Then** button shows loading state, fields are disabled, and Polaris Spinner appears in Card 2

7. **Given** any log call during credential processing, **When** logs are inspected, **Then** `secretToken` and `accessToken` values appear as `[REDACTED]` via `sanitizeForLog()` — never plaintext in logs

8. **Given** IDOR security test — merchant A's session attempts to save credentials for merchant B's shop_domain, **When** the request is made, **Then** it returns 403 — `requireShopSession()` blocks cross-tenant writes

## Tasks / Subtasks

- [x] Task 1: Create `app/lib/encryption.server.ts` — AES-256-GCM encrypt/decrypt (AC: #1, #2)
  - [x] Implement `encrypt(plaintext: string, hexKey: string): string` → returns JSON string `{"version":1,"iv":"hex","tag":"hex","data":"hex"}`
  - [x] Implement `decrypt(cipherJson: string, hexKey: string): string` → parses JSON, decrypts, returns plaintext
  - [x] Use Node.js built-in `crypto`: `createCipheriv('aes-256-gcm', key, iv)` + `getAuthTag()` for GCM auth tag
  - [x] `iv` = 16 random bytes (crypto.randomBytes(16)), `key` = Buffer.from(hexKey, 'hex') (32 bytes)
  - [x] Function must be pure (no imports from app/ besides types) — lives in `lib/` per architectural boundary rule

- [x] Task 2: Create `app/lib/logger.server.ts` — sanitizeForLog utility (AC: #7)
  - [x] Implement `sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown>`
  - [x] Shallow sanitize: keys in `SENSITIVE_KEYS = new Set(["secretToken", "accessToken", "encryptedSecretToken", "encryptedClientId"])` → replace value with `"[REDACTED]"`
  - [x] Copy exact implementation from architecture doc (section "Logging & Sensitive Data")

- [x] Task 3: Create `app/services/credential.server.ts` — credential business logic (AC: #1, #2, #4, #7, #8)
  - [x] Implement `saveCredential(shop: string, clientId: string, secretToken: string): Promise<void>`
    - [x] Encrypt both clientId and secretToken via `encrypt()` from encryption.server.ts
    - [x] `env` import from `env.server.ts` for `ENCRYPTION_KEY`
    - [x] Upsert `MerchantCredential` via `db.merchantCredential.upsert({ where: { merchantId }, create: {...}, update: {...} })`
    - [x] Must find `Merchant` by shopDomain first to get `merchantId` — multi-tenancy guard
    - [x] Log success via `sanitizeForLog()` — never log raw tokens
  - [x] Implement `hasCredential(shop: string): Promise<boolean>`
    - [x] Query `MerchantCredential` via `db.merchant.findUnique({ where: { shopDomain: shop }, include: { credential: { select: { id: true } } } })`

- [x] Task 4: Create `app/services/tingee.server.ts` — Tingee SDK wrapper (AC: #4, #5)
  - [x] Implement `verifyCredentials(clientId: string, secretToken: string): Promise<void>` (throws on invalid)
    - [x] Instantiate `TingeeClient({ clientId, secretKey: secretToken, environment: 'production', timeout: env.TINGEE_SDK_TIMEOUT_MS })`
    - [x] Call `client.bank.getBanks()` as a lightweight credential-verifying ping
    - [x] If `isSuccessResponse(result)` → credentials valid, return void
    - [x] If `!isSuccessResponse(result)` → throw `new InvalidCredentialsError(result.message)`
    - [x] If `TingeeHttpError` (status 401/403) → throw `new InvalidCredentialsError('Auth rejected')`
    - [x] If timeout (e.g., `AbortError` or code `ECONNABORTED`) → throw `new TingeeConnectionError('Timeout')`
    - [x] Define `InvalidCredentialsError` and `TingeeConnectionError` as named exports for use in action
  - [x] Add stub interface for Epic 2+3 methods (Story 2.1 will implement, Story 3.1 fills verifyWebhookHMAC)
  - [x] Import `env` from `env.server.ts` for `TINGEE_SDK_TIMEOUT_MS`

- [x] Task 5: Create `app/services/order.server.ts` — Shopify payment method registration (AC: #3)
  - [x] Implement `registerPaymentMethod(shop: string, accessToken: string): Promise<void>`
    - [x] POST to `https://${shop}/admin/api/2025-07/payment_gateways.json`
    - [x] Headers: `X-Shopify-Access-Token: ${accessToken}`, `Content-Type: application/json`
    - [x] Body: `{ payment_gateway: { name: 'Thanh toán qua Tingee QR', type: 'manual', enabled: true } }`
    - [x] Parse JSON response — check `payment_gateway.id` exists in success response
    - [x] If response is not 2xx: throw descriptive error
    - [x] NOTE: Do NOT store the payment_gateway.id — it's not needed per architecture scope
  - [x] This function is ONLY called on first-time credential save (when no existing credential)

- [x] Task 6: Add `action` to `app/routes/app.settings.tsx` (AC: #1–#8)
  - [x] Import `ActionFunctionArgs` from `react-router`
  - [x] `requireShopSession(request)` FIRST — returns `{ admin, session, shop }`
  - [x] Parse form data: clientId and secretToken trimmed
  - [x] Validate non-empty (early return with error if blank)
  - [x] Check if credential exists BEFORE calling Tingee: `const isFirstSave = !(await hasCredential(shop))`
  - [x] Call `verifyCredentials(clientId, secretToken)` from tingee.server.ts
  - [x] On success: call `saveCredential(shop, clientId, secretToken)`
  - [x] If `isFirstSave`: call `registerPaymentMethod(session.shop, session.accessToken)`
  - [x] Return `{ success: true }` on full completion
  - [x] Catch `InvalidCredentialsError` → return `{ error: 'INVALID_CREDENTIALS' }`
  - [x] Catch `TingeeConnectionError` → return `{ error: 'TINGEE_TIMEOUT' }`
  - [x] Catch any other error → sanitized log + return `{ error: 'UNKNOWN' }`

- [x] Task 7: Update `app/components/CredentialForm.tsx` — wire form + loading/success/error states (AC: #1, #4, #5, #6)
  - [x] Replace static `<Button>` with `useFetcher` + `<fetcher.Form method="post">`
  - [x] Hidden inputs pattern for Polaris TextField values
  - [x] Derive `isSubmitting` from `fetcher.state`, `saveResult` from `fetcher.data`
  - [x] Loading state: disabled TextFields, loading Button, Spinner in Card 2
  - [x] Success state: success Banner, "Đã kết nối" Badge, clear fields, auto-dismiss after 5s
  - [x] Error state: critical Banner with Vietnamese error messages for each error code
  - [x] AC7 deferred from 1.3: MISSING_FIELDS error mapped to user message
  - [x] maxLength={255} on both TextFields
  - [x] Trim via hidden inputs + action (defense in depth)

- [x] Task 8: Create `app/lib/encryption.server.test.ts` — AES-256 unit tests (AC: #2)
  - [x] Test: `encrypt(plaintext, key)` returns a JSON string with `version`, `iv`, `tag`, `data` fields
  - [x] Test: `decrypt(encrypt(plaintext, key), key)` === plaintext (roundtrip)
  - [x] Test: `encrypt(plaintext, key)` return value ≠ plaintext (ciphertext assertion)
  - [x] Test: two calls to `encrypt(same_plaintext, same_key)` return DIFFERENT ciphertexts (IV is random)
  - [x] No DB or network needed — pure crypto tests

- [x] Task 9: Add action tests to `app/routes/app.settings.test.ts` (AC: #4, #5, #7, #8)
  - [x] Mock `verifyCredentials`, `saveCredential`, `hasCredential`, `registerPaymentMethod`
  - [x] Test: valid credentials + first save → returns `{ success: true }`, calls `saveCredential`, calls `registerPaymentMethod`
  - [x] Test: valid credentials + existing credential → returns `{ success: true }`, calls `saveCredential`, does NOT call `registerPaymentMethod`
  - [x] Test: `InvalidCredentialsError` → returns `{ error: 'INVALID_CREDENTIALS' }`, no DB write
  - [x] Test: `TingeeConnectionError` → returns `{ error: 'TINGEE_TIMEOUT' }`, no DB write
  - [x] Test: IDOR multi-tenancy — credentials always saved under session.shop
  - [x] Test: MISSING_FIELDS → returns `{ error: 'MISSING_FIELDS' }`, no Tingee call

- [ ] Task 10: (Optional, if time permits) Integration test `credential.server.integration.test.ts` (AC: #2)
  - [ ] Uses `@testcontainers/postgresql` — requires `DATABASE_URL` pointing to Testcontainers instance
  - [ ] Test: after `saveCredential(shop, clientId, secretToken)`, raw `db.merchantCredential.findFirst()` returns `encryptedSecretToken` that is NOT equal to original `secretToken`
  - [ ] Test: decrypt the stored value → equals original `secretToken`
  - [ ] This test is marked `@integration` and skipped in regular `vitest` run — runs only via `vitest --testPathPattern=integration`

### Review Findings

- [x] [Review][Decision] AC8 IDOR — dismissed: session binding đủ để ngăn IDOR; HTTP 403 status không bắt buộc theo spec intent. [app/routes/app.settings.tsx]

- [x] [Review][Patch] Payment method registration failure trả về { error: "UNKNOWN" } thay vì { error: "PAYMENT_METHOD_REGISTRATION_FAILED" } — và khi retry thì isFirstSave=false nên không bao giờ retry registerPaymentMethod được nữa. Story Dev Notes đã chỉ rõ cần return error code riêng [app/routes/app.settings.tsx:35-53]
- [x] [Review][Patch] Không có fetch timeout trong registerPaymentMethod — nếu Shopify API chậm/hang, action handler block vô thời hạn [app/services/order.server.ts:10]
- [x] [Review][Patch] response.json() không được guard trong registerPaymentMethod — nếu Shopify trả 200 với non-JSON body (CDN/proxy interception), throws unhandled parse error [app/services/order.server.ts:32]
- [x] [Review][Patch] isSuccessResponse trả false nhưng result.message có thể undefined — InvalidCredentialsError được tạo với message "undefined" [app/services/tingee.server.ts:35-37]
- [x] [Review][Patch] maxLength={255} chỉ là UI hint — không có server-side length validation trong action; direct POST có thể bypass [app/routes/app.settings.tsx:21-24]
- [x] [Review][Patch] saveCredential log encryptedSecretToken và encryptedClientId dưới dạng [REDACTED] — log vô nghĩa; chỉ nên log { shop } [app/services/credential.server.ts:35-38]

- [x] [Review][Defer] AC2 integration test (Testcontainers) chưa được viết — deferred, đã được đánh dấu optional Task 10 trong story
- [x] [Review][Defer] Race condition: hai concurrent saves từ cùng shop đều read isFirstSave=true, có thể registerPaymentMethod 2 lần tạo duplicate gateway — deferred, pre-existing architectural concern
- [x] [Review][Defer] decrypt không validate version field — nếu version 2 payload được load, decrypt version-1 logic chạy sai — deferred, future key rotation concern
- [x] [Review][Defer] decrypt không wrap JSON.parse trong try/catch — SyntaxError trên DB corruption — deferred, defensive programming beyond current scope
- [x] [Review][Defer] sanitizeForLog chỉ shallow-redact — nested sensitive keys không được redact — deferred, không có callers hiện tại với nested sensitive objects
- [x] [Review][Defer] registerPaymentMethod embeds raw Shopify error body vào Error.message — có thể chứa Shopify metadata — deferred, low risk in current scope

## Dev Notes

### Architecture Overview for This Story

This story wires the save action for credentials end-to-end:

```
CredentialForm (useFetcher)
  → POST /app/settings (action in app.settings.tsx)
    → requireShopSession() [ALWAYS FIRST]
    → tingee.server.ts: verifyCredentials()
      → TingeeClient.bank.getBanks()  [credential ping]
    → credential.server.ts: saveCredential()
      → encryption.server.ts: encrypt()
      → db.merchantCredential.upsert()
    → (if first save) order.server.ts: registerPaymentMethod()
      → Shopify REST API: POST /payment_gateways.json
    → return { success: true } | { error: 'INVALID_CREDENTIALS' | 'TINGEE_TIMEOUT' | 'UNKNOWN' }
```

### `lib/encryption.server.ts` — Full Implementation

```typescript
// app/lib/encryption.server.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

interface EncryptedPayload {
  version: number;
  iv: string;
  tag: string;
  data: string;
}

export function encrypt(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, "hex"); // 32 bytes for AES-256
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    version: 1,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  };
  return JSON.stringify(payload);
}

export function decrypt(cipherJson: string, hexKey: string): string {
  const { iv, tag, data }: EncryptedPayload = JSON.parse(cipherJson);
  const key = Buffer.from(hexKey, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return (
    decipher.update(Buffer.from(data, "hex")).toString("utf8") +
    decipher.final("utf8")
  );
}
```

**Why AES-256-GCM?** GCM provides authenticated encryption — if the ciphertext or key is tampered, `decipher.final()` throws. The `tag` is the authentication tag. The `iv` must be unique per encryption call (randomBytes(16) ensures this).

**ENCRYPTION_KEY format:** 64-character hex string (32 bytes). Already validated in `env.schema.ts` with regex `/^[0-9a-f]{64}$/i`. Generate via: `openssl rand -hex 32`.

### `lib/logger.server.ts` — Full Implementation

```typescript
// app/lib/logger.server.ts
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
```

**Usage pattern in action:**
```typescript
// WRONG — never log raw credentials:
console.error("Failed to save", { secretToken, error });

// CORRECT:
console.error("Failed to save credential", sanitizeForLog({ secretToken, error: error.message, shop }));
```

### `services/credential.server.ts` — Implementation Pattern

```typescript
// app/services/credential.server.ts
import db from "../db.server";
import { encrypt } from "../lib/encryption.server";
import { sanitizeForLog } from "../lib/logger.server";
import { env } from "../lib/env.server";

export async function saveCredential(
  shop: string,
  clientId: string,
  secretToken: string
): Promise<void> {
  const merchant = await db.merchant.findUnique({
    where: { shopDomain: shop },
    select: { id: true },
  });
  if (!merchant) throw new Error(`Merchant not found: ${shop}`);

  const encryptedClientId = encrypt(clientId, env.ENCRYPTION_KEY);
  const encryptedSecretToken = encrypt(secretToken, env.ENCRYPTION_KEY);

  await db.merchantCredential.upsert({
    where: { merchantId: merchant.id },
    create: {
      merchantId: merchant.id,
      encryptedClientId,
      encryptedSecretToken,
      keyVersion: 1,
    },
    update: {
      encryptedClientId,
      encryptedSecretToken,
      keyVersion: 1,
    },
  });
}

export async function hasCredential(shop: string): Promise<boolean> {
  const merchant = await db.merchant.findUnique({
    where: { shopDomain: shop },
    include: { credential: { select: { id: true } } },
  });
  return !!merchant?.credential;
}
```

**Why upsert?** Handles both first-time save (create) and credential update (update) atomically. Idempotent.

**Why `select: { id: true }` on credential in `hasCredential`?** Follows the same defense-in-depth pattern from Story 1.3 — never pull encrypted values unnecessarily.

### `services/tingee.server.ts` — Implementation Pattern

```typescript
// app/services/tingee.server.ts
// CHỈ HTTP calls đến Tingee API. Zero business logic. — architecture rule
import {
  TingeeClient,
  isSuccessResponse,
  TingeeHttpError,
} from "@tingee/sdk-node";
import { env } from "../lib/env.server";

export class InvalidCredentialsError extends Error {
  constructor(message = "Invalid Tingee credentials") {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

export class TingeeConnectionError extends Error {
  constructor(message = "Cannot connect to Tingee") {
    super(message);
    this.name = "TingeeConnectionError";
  }
}

// Verify credentials by making a lightweight API call
export async function verifyCredentials(
  clientId: string,
  secretToken: string
): Promise<void> {
  const client = new TingeeClient({
    clientId,
    secretKey: secretToken,        // NOTE: SDK uses 'secretKey' for what merchants call 'Secret Token'
    environment: "production",     // Architecture constraint: Production URL only — never UAT
    timeout: env.TINGEE_SDK_TIMEOUT_MS,
  });

  try {
    const result = await client.bank.getBanks();
    if (!isSuccessResponse(result)) {
      throw new InvalidCredentialsError(result.message);
    }
  } catch (error) {
    if (error instanceof InvalidCredentialsError) throw error;
    if (error instanceof TingeeHttpError) {
      if (error.status === 401 || error.status === 403) {
        throw new InvalidCredentialsError(`HTTP ${error.status}: auth rejected`);
      }
      throw new TingeeConnectionError(`HTTP ${error.status}: ${error.message}`);
    }
    // Timeout, network error, etc.
    throw new TingeeConnectionError(
      error instanceof Error ? error.message : String(error)
    );
  }
}

// Stubs — implemented in Story 2.1
export async function generateQR(_params: {
  clientId: string;
  secretToken: string;
  amount: number;
  orderNumber: string;
}): Promise<string> {
  throw new Error("generateQR: not implemented until Story 2.1");
}

export async function generateDeeplink(_params: {
  clientId: string;
  secretToken: string;
  qrCode: string;
}): Promise<string | null> {
  throw new Error("generateDeeplink: not implemented until Story 2.1");
}

// Stub — implemented in Story 3.1
export function verifyWebhookHMAC(_params: {
  secretToken: string;
  signature: string;
  timestamp: string;
  body: object | string;
}): boolean {
  throw new Error("verifyWebhookHMAC: not implemented until Story 3.1");
}
```

**SDK mapping:**
- `TingeeClient({ clientId, secretKey: secretToken })` — the SDK's `secretKey` parameter maps to the merchant's "Secret Token" field in the UI
- `environment: 'production'` — **mandatory per architecture**, never use `'uat'`
- `timeout: env.TINGEE_SDK_TIMEOUT_MS` — defaults to 4000ms in env.schema.ts

**Credential verification strategy:** `client.bank.getBanks()` is a lightweight, read-only endpoint that requires valid credentials. If credentials are wrong, Tingee returns HTTP 401/403 → `TingeeHttpError` is thrown. This is the standard ping approach since Tingee has no dedicated "verify credentials" endpoint.

### `services/order.server.ts` — Implementation Pattern

```typescript
// app/services/order.server.ts
// Shopify GraphQL: registerPaymentMethod, markOrderPaid
// NOTE: Keep separate from app/shopify.server.ts (Shopify template file, never modify)

const PAYMENT_METHOD_NAME = "Thanh toán qua Tingee QR";
const SHOPIFY_API_VERSION = "2025-07";

export async function registerPaymentMethod(
  shop: string,
  accessToken: string
): Promise<void> {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/payment_gateways.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payment_gateway: {
        name: PAYMENT_METHOD_NAME,
        type: "manual",
        enabled: true,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to register payment method: HTTP ${response.status} — ${errorBody}`
    );
  }

  const json = (await response.json()) as { payment_gateway?: { id?: number } };
  if (!json.payment_gateway?.id) {
    throw new Error("Payment gateway registration returned unexpected response");
  }
  // NOTE: We do NOT store the payment_gateway.id — not needed per Phase 1 scope
}
```

**Why REST instead of GraphQL?** Shopify's Admin GraphQL API does not expose a `manualPaymentMethodCreate` mutation in 2025-07. Manual payment gateways are created via the REST API at `/payment_gateways.json`. This is an official Shopify REST endpoint.

**`accessToken` security:** Only used server-side for the Shopify REST call. Never logged (don't pass `accessToken` through `sanitizeForLog` — just omit it from any log object).

**Re-registration guard:** The action checks `isFirstSave` (no existing credential) before calling this function. If called again (e.g., credential update), it would create a DUPLICATE payment gateway. The guard in the action prevents this.

**If `registerPaymentMethod` fails:** The action should NOT roll back the credential save (Tingee credentials are already valid at this point). Instead, return `{ error: 'PAYMENT_METHOD_REGISTRATION_FAILED' }` so the merchant can retry. This is acceptable UX since Shopify payment gateway creation rarely fails after credential validation succeeds.

### `app/routes/app.settings.tsx` — Full Action

```typescript
// ADD to existing app/routes/app.settings.tsx — keep existing loader unchanged

import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireShopSession } from "../lib/auth.server";
import { sanitizeForLog } from "../lib/logger.server";
import db from "../db.server";
import { CredentialForm } from "../components/CredentialForm";
import { verifyCredentials, InvalidCredentialsError, TingeeConnectionError } from "../services/tingee.server";
import { saveCredential, hasCredential } from "../services/credential.server";
import { registerPaymentMethod } from "../services/order.server";

// ... (existing loader stays exactly as is) ...

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, shop } = await requireShopSession(request); // ALWAYS first

  const formData = await request.formData();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const secretToken = String(formData.get("secretToken") ?? "").trim();

  if (!clientId || !secretToken) {
    return { error: "MISSING_FIELDS" };
  }

  const isFirstSave = !(await hasCredential(shop));

  try {
    await verifyCredentials(clientId, secretToken);
    await saveCredential(shop, clientId, secretToken);
    if (isFirstSave) {
      await registerPaymentMethod(session.shop, session.accessToken);
    }
    return { success: true };
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return { error: "INVALID_CREDENTIALS" };
    }
    if (error instanceof TingeeConnectionError) {
      return { error: "TINGEE_TIMEOUT" };
    }
    console.error("Credential save failed", sanitizeForLog({
      shop,
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    return { error: "UNKNOWN" };
  }
};
```

**Order of operations is critical:**
1. `requireShopSession` — guards against IDOR; `shop` is authoritative from session
2. `hasCredential` — checked BEFORE verify to avoid unnecessary Tingee API call on update? No, check is cheap and correct order is verify-then-check. Actually `isFirstSave` is checked BEFORE `verifyCredentials` to determine whether to register after saving. It's safe to reorder: check first, verify second.
3. `verifyCredentials` — may throw; if it does, we abort early (no DB write)
4. `saveCredential` — encrypts and persists
5. `registerPaymentMethod` — only on first save

### `CredentialForm.tsx` — useFetcher Pattern

```typescript
// Key changes to app/components/CredentialForm.tsx
import { useFetcher } from "react-router";
import { useEffect, useRef } from "react";
import { Spinner } from "@shopify/polaris"; // Add Spinner import

type ActionData = { success?: boolean; error?: string } | undefined;

export function CredentialForm({ hasCredential }: CredentialFormProps) {
  const fetcher = useFetcher<ActionData>();
  const [clientId, setClientId] = useState("");
  const [secretToken, setSecretToken] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [localHasCredential, setLocalHasCredential] = useState(hasCredential);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const isSubmitting = fetcher.state === "submitting";
  const saveResult = fetcher.data;

  // Auto-dismiss success banner after 5s
  useEffect(() => {
    if (saveResult?.success) {
      setLocalHasCredential(true);
      setClientId("");
      setSecretToken("");
      dismissTimerRef.current = setTimeout(() => {
        fetcher.load("/app/settings"); // reload loader to refresh hasCredential
      }, 5000);
    }
    return () => clearTimeout(dismissTimerRef.current);
  }, [saveResult?.success]);

  const errorMessage =
    saveResult?.error === "INVALID_CREDENTIALS"
      ? "Client ID hoặc Secret Token không đúng. Kiểm tra lại trong portal Tingee."
      : saveResult?.error === "TINGEE_TIMEOUT"
      ? "Không thể kết nối đến Tingee. Kiểm tra kết nối mạng và thử lại."
      : saveResult?.error === "MISSING_FIELDS"
      ? "Vui lòng nhập Client ID và Secret Token."
      : saveResult?.error
      ? "Đã xảy ra lỗi khi lưu cài đặt. Vui lòng thử lại."
      : null;

  const isSaveDisabled = isSubmitting || !clientId.trim() || !secretToken.trim();

  return (
    <Page title="Cài đặt Tingee Payment">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            {/* Success banner */}
            {saveResult?.success && (
              <Banner tone="success">Đã kết nối thành công với Tingee</Banner>
            )}
            {/* Error banner */}
            {errorMessage && (
              <Banner tone="critical">{errorMessage}</Banner>
            )}
            {/* Info banner for fresh install */}
            {!localHasCredential && !saveResult?.success && (
              <Banner tone="info">
                Nhập Client ID và Secret Token từ portal Tingee để bắt đầu
              </Banner>
            )}

            {/* fetcher.Form handles POST to current route action */}
            <fetcher.Form method="post">
              {/* Hidden inputs carry the values — Polaris TextFields update state */}
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="secretToken" value={secretToken} />

              <BlockStack gap="400">
                <TextField
                  label="Client ID"
                  value={clientId}
                  onChange={setClientId}
                  autoComplete="off"
                  disabled={isSubmitting}
                  placeholder={localHasCredential ? "Nhập lại Client ID" : undefined}
                  helpText={localHasCredential ? "Client ID đã được lưu — nhập lại để thay đổi" : undefined}
                  maxLength={255}
                />
                <TextField
                  label="Secret Token"
                  type={showSecret ? "text" : "password"}
                  value={secretToken}
                  onChange={setSecretToken}
                  autoComplete="off"
                  disabled={isSubmitting}
                  placeholder={localHasCredential ? "••••••••" : undefined}
                  helpText={localHasCredential ? "Secret Token đã được lưu — nhập giá trị mới để thay đổi" : undefined}
                  maxLength={255}
                  suffix={
                    <Button
                      variant="plain"
                      onClick={() => setShowSecret((v) => !v)}
                      icon={showSecret ? HideIcon : ViewIcon}
                      accessibilityLabel={showSecret ? "Ẩn Secret Token" : "Hiện Secret Token"}
                    />
                  }
                />
                <Button
                  variant="primary"
                  disabled={isSaveDisabled}
                  loading={isSubmitting}
                  submit
                >
                  Lưu cài đặt
                </Button>
              </BlockStack>
            </fetcher.Form>
          </BlockStack>
        </Card>

        {/* Card 2: Connection Status */}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Trạng thái kết nối</Text>
            {isSubmitting ? (
              <Spinner size="small" />
            ) : localHasCredential || saveResult?.success ? (
              <Badge tone="success">Đã kết nối</Badge>
            ) : (
              <Badge tone="critical">Chưa kết nối</Badge>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
```

**Key patterns:**
- `fetcher.Form method="post"` → submits to current route's action (no `action` attribute needed)
- Hidden inputs pattern: Polaris `TextField` updates React state; hidden inputs carry values to the form submission
- `localHasCredential` state: tracks credential presence client-side after successful save (avoids full page reload)
- `fetcher.load("/app/settings")` after 5s: triggers loader re-run to sync `hasCredential` from server
- `loading={isSubmitting}` on Button: Polaris 13 supports `loading` prop on Button

**Why `submit` prop on Button?** The Button is inside `<fetcher.Form>` — the `submit` prop makes it a submit button. This is correct (unlike Story 1.3 where there was no form).

### Multi-Tenancy & Security Rules for This Story

| Rule | How Enforced |
|------|-------------|
| `requireShopSession()` first in action | ✅ First line of action |
| `shop` from session only — not from form | ✅ Never read `shop` from formData |
| `session.accessToken` never logged | ✅ Not passed to `sanitizeForLog()`, only used in REST call |
| Encrypted values never returned to client | ✅ Action returns `{ success: true }`, never decrypted values |
| `saveCredential` scoped to `shop` from session | ✅ Uses `db.merchant.findUnique({ where: { shopDomain: shop } })` |
| IDOR: merchant A cannot save for merchant B | ✅ `shop` from `requireShopSession()` is authoritative |

### Env Variables Required

| Variable | From | Purpose |
|----------|------|---------|
| `ENCRYPTION_KEY` | `env.server.ts` | AES-256-GCM 32-byte key (hex) |
| `TINGEE_SDK_TIMEOUT_MS` | `env.server.ts` | Default 4000ms |
| (already validated in env.schema.ts — no changes to schema needed) |

**Local dev:** Add to `.env` file:
```bash
ENCRYPTION_KEY=<64-char hex> # openssl rand -hex 32
```

### Test Pattern — Action Tests

```typescript
// Addition to app/routes/app.settings.test.ts

// Add additional mocks at top:
vi.mock("../services/tingee.server", () => ({
  verifyCredentials: vi.fn(),
  InvalidCredentialsError: class InvalidCredentialsError extends Error { name = 'InvalidCredentialsError' },
  TingeeConnectionError: class TingeeConnectionError extends Error { name = 'TingeeConnectionError' },
}));
vi.mock("../services/credential.server", () => ({
  saveCredential: vi.fn(),
  hasCredential: vi.fn(),
}));
vi.mock("../services/order.server", () => ({
  registerPaymentMethod: vi.fn(),
}));

// Then import action:
import { action } from "./app.settings";
import { verifyCredentials, InvalidCredentialsError, TingeeConnectionError } from "../services/tingee.server";
import { saveCredential, hasCredential } from "../services/credential.server";
import { registerPaymentMethod } from "../services/order.server";

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

describe("Settings action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves credentials and registers payment method on first save", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: { ...createMockShopifySession(), accessToken: "tok123" } as any,
    } as any);
    vi.mocked(hasCredential).mockResolvedValueOnce(false); // first save
    vi.mocked(verifyCredentials).mockResolvedValueOnce(undefined);
    vi.mocked(saveCredential).mockResolvedValueOnce(undefined);
    vi.mocked(registerPaymentMethod).mockResolvedValueOnce(undefined);

    const result = await action(makeActionArgs({ clientId: "id123", secretToken: "tok" }));
    expect(result).toEqual({ success: true });
    expect(saveCredential).toHaveBeenCalledWith("test-store.myshopify.com", "id123", "tok");
    expect(registerPaymentMethod).toHaveBeenCalledOnce();
  });

  it("skips payment method registration on credential update", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: { ...createMockShopifySession(), accessToken: "tok123" } as any,
    } as any);
    vi.mocked(hasCredential).mockResolvedValueOnce(true); // existing credential
    vi.mocked(verifyCredentials).mockResolvedValueOnce(undefined);
    vi.mocked(saveCredential).mockResolvedValueOnce(undefined);

    const result = await action(makeActionArgs({ clientId: "id123", secretToken: "tok" }));
    expect(result).toEqual({ success: true });
    expect(registerPaymentMethod).not.toHaveBeenCalled();
  });

  it("returns INVALID_CREDENTIALS when Tingee rejects", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: createMockShopifySession() as any,
    } as any);
    vi.mocked(hasCredential).mockResolvedValueOnce(false);
    vi.mocked(verifyCredentials).mockRejectedValueOnce(new InvalidCredentialsError());

    const result = await action(makeActionArgs({ clientId: "bad", secretToken: "bad" }));
    expect(result).toEqual({ error: "INVALID_CREDENTIALS" });
    expect(saveCredential).not.toHaveBeenCalled();
  });

  it("returns TINGEE_TIMEOUT on network timeout", async () => {
    vi.mocked(authenticate.admin).mockResolvedValueOnce({
      admin: {} as any,
      session: createMockShopifySession() as any,
    } as any);
    vi.mocked(hasCredential).mockResolvedValueOnce(false);
    vi.mocked(verifyCredentials).mockRejectedValueOnce(new TingeeConnectionError());

    const result = await action(makeActionArgs({ clientId: "id", secretToken: "tok" }));
    expect(result).toEqual({ error: "TINGEE_TIMEOUT" });
  });
});
```

### What Story 1.3 Already Built — Do Not Redo

| Item | Location |
|------|----------|
| `requireShopSession()` | `app/lib/auth.server.ts` |
| `db` singleton | `app/db.server.ts` |
| `CredentialForm` component (modify, don't recreate) | `app/components/CredentialForm.tsx` |
| `app.settings.tsx` loader (keep as-is) | `app/routes/app.settings.tsx` |
| `Merchant`/`MerchantCredential` Prisma models | `prisma/schema.prisma` — no changes needed |
| `createMockShopifySession` test helper | `test/helpers/shopify-session.ts` |
| `env.schema.ts` with `ENCRYPTION_KEY` + `TINGEE_SDK_TIMEOUT_MS` | `app/lib/env.schema.ts` |
| `@shopify/polaris` 13.9.5 installed | — |

### Files to CREATE

| File | Purpose |
|------|---------|
| `app/lib/encryption.server.ts` | AES-256-GCM encrypt/decrypt |
| `app/lib/logger.server.ts` | `sanitizeForLog()` |
| `app/services/credential.server.ts` | Save/check credentials (business logic) |
| `app/services/tingee.server.ts` | Tingee SDK wrapper + stubs for Epic 2+3 |
| `app/services/order.server.ts` | Shopify REST: registerPaymentMethod |
| `app/lib/encryption.server.test.ts` | AES-256 unit tests |

### Files to MODIFY

| File | Change |
|------|--------|
| `app/routes/app.settings.tsx` | Add `action` function export |
| `app/components/CredentialForm.tsx` | Wire `useFetcher`, loading/success/error states |
| `app/routes/app.settings.test.ts` | Add action tests |

### Files to NOT TOUCH

| File | Reason |
|------|--------|
| `app/shopify.server.ts` | Shopify template file — never modify |
| `app/lib/auth.server.ts` | Complete from Story 1.2 |
| `prisma/schema.prisma` | No schema changes in this story |
| `app/lib/env.server.ts` / `app/lib/env.schema.ts` | `ENCRYPTION_KEY` already declared |
| `app/db.server.ts` | Use as singleton |

### Deferred Items from Story 1.3 — Address in This Story

Per `deferred-work.md`:
1. **AC7 error states** — `TextField` `error` prop is now in scope (this story has the action)
2. **Max-length validation** — `maxLength={255}` on both TextFields (included above)
3. **Trim before submit** — action already trims; hidden inputs in form carry trimmed state
4. **`clientId` + `secretToken` trim when check disabled but submit raw** — fixed: hidden inputs hold the same `clientId`/`secretToken` state that's trimmed for disabled check

**Note:** `ErrorBoundary` on `app.settings.tsx` is still deferred — out of scope for this story.

### Architecture Compliance Rules for This Story

| Rule | Implementation |
|------|----------------|
| `requireShopSession()` first in every action | ✅ First call in action |
| Multi-tenancy: all DB queries scoped to `shop` | ✅ `credential.server.ts` uses `shopDomain: shop` |
| `sanitizeForLog()` before all sensitive logs | ✅ In action catch block |
| `session.accessToken` never logged/returned | ✅ Only used in REST call header, never in log object |
| Encrypted values never in API response | ✅ Action returns `{ success: true }`, no credential values |
| `authenticate.admin()` for Admin routes only | ✅ Settings is admin route |
| Tingee `environment: 'production'` always | ✅ In `tingee.server.ts` |
| `TINGEE_SDK_TIMEOUT_MS` passed to TingeeClient | ✅ `timeout: env.TINGEE_SDK_TIMEOUT_MS` |

### References

- [Source: epics.md#Story 1.4] — Acceptance criteria verbatim
- [Source: architecture.md#Data Architecture] — AES-256 key management, `{version, iv, tag, data}` format
- [Source: architecture.md#Implementation Patterns → Logging] — `sanitizeForLog()` exact implementation
- [Source: architecture.md#Authentication & Security] — Multi-tenancy guard, `requireShopSession()` pattern
- [Source: architecture.md#Project Structure] — `services/credential.server.ts`, `services/tingee.server.ts`, `services/order.server.ts`, `lib/encryption.server.ts` file locations
- [Source: architecture.md#Validation — AES-256 keyVersion Pseudocode] — encrypt/decrypt schema
- [Source: story 1.3 Dev Notes] — `useFetcher` not used yet; action deferred to this story; Polaris 13 component names
- [Source: deferred-work.md] — AC7 errors, max-length, trim, IDOR — all addressed in this story
- [Source: @tingee/sdk-node types] — `TingeeClient({ clientId, secretKey })`, `client.bank.getBanks()`, `isSuccessResponse()`, `TingeeHttpError`

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- TingeeClient.bank.getBanks() requires casting to `any` because TypeScript types for generated methods are added via Object.assign at runtime — not reflected in the class type definition.

### Completion Notes List
- Tạo `app/lib/encryption.server.ts`: AES-256-GCM với random IV mỗi lần encrypt, format `{version,iv,tag,data}` JSON.
- Tạo `app/lib/logger.server.ts`: `sanitizeForLog()` che giấu 6 sensitive keys bằng `[REDACTED]`.
- Tạo `app/services/credential.server.ts`: `saveCredential()` upsert với mã hóa, `hasCredential()` kiểm tra tồn tại.
- Tạo `app/services/tingee.server.ts`: `verifyCredentials()` dùng `client.bank.getBanks()` làm ping, map lỗi thành typed errors. Stubs cho generateQR/generateDeeplink/verifyWebhookHMAC.
- Tạo `app/services/order.server.ts`: `registerPaymentMethod()` POST đến Shopify REST API 2025-07.
- Cập nhật `app/routes/app.settings.tsx`: Thêm `action` với đầy đủ flow verify→save→register, IDOR guard qua `requireShopSession`.
- Cập nhật `app/components/CredentialForm.tsx`: `useFetcher` form, hidden inputs pattern, loading/success/error states, auto-dismiss sau 5s, `maxLength={255}`.
- Tất cả 30 tests xanh (không có regression).
- Task 10 (integration test) bỏ qua — optional, cần Testcontainers.

### File List
- app/lib/encryption.server.ts (created)
- app/lib/logger.server.ts (created)
- app/services/credential.server.ts (created)
- app/services/tingee.server.ts (created)
- app/services/order.server.ts (created)
- app/routes/app.settings.tsx (modified — added action export)
- app/components/CredentialForm.tsx (modified — useFetcher, loading/success/error states)
- app/lib/encryption.server.test.ts (created)
- app/routes/app.settings.test.ts (modified — added action tests)

## Change Log
- 2026-06-23: Story created by bmad-create-story workflow
- 2026-06-23: Story implemented by dev-story workflow (claude-sonnet-4-6) — Tasks 1-9 complete, 30/30 tests passing
