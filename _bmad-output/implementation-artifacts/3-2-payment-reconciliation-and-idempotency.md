---
baseline_commit: "NO_VCS"
---

# Story 3.2: Payment Reconciliation & Idempotency

Status: done

## Story

As a merchant,
I want the system to automatically match incoming payments to the correct order and amount,
So that only exact payments trigger fulfillment — wrong-amount payments are flagged for my review without interrupting other orders.

## Acceptance Criteria

1. **Given** a valid Tingee webhook with `transactionCode`, **When** processing begins, **Then** `INSERT INTO processed_webhooks { idempotencyKey: 'tingee:{transactionCode}', status: 'PENDING' }` is attempted — if `P2002` (duplicate key), return HTTP 200 immediately (already processed, no reprocessing)

2. **Given** idempotency INSERT succeeds (new transaction), **When** `assertValidTransition(PENDING, PROCESSING)` is called, **Then** Payment record status transitions to `PROCESSING` — if transition is invalid (e.g., already COMPLETED), log to Sentry and return HTTP 200 (out-of-order webhook)

3. **Given** `receivedAmount` from webhook equals `expectedAmount` from Payment record (strict integer VND comparison), **When** amounts match exactly, **Then** processing continues to Shopify order update (Story 3.3)

4. **Given** `receivedAmount` does NOT equal `expectedAmount`, **When** mismatch is detected, **Then** Payment status → `FAILED`, `ProcessedWebhook` → `status: 'COMPLETED'` (no retry), Shopify Order Note is added: "Tingee received {receivedAmount} VND, expected {expectedAmount} VND — manual review required", HTTP 200 returned

5. **Given** no `Payment` record found matching the webhook's order reference, **When** lookup fails, **Then** webhook is logged to Sentry and HTTP 200 returned

6. **Given** Tingee retries the same webhook (up to 5 times per Tingee policy), **When** the same `transactionCode` arrives again, **Then** the `P2002` idempotency guard returns HTTP 200 immediately on every retry — zero duplicate processing

## Tasks / Subtasks

- [x] Task 1: Schema migration — add `orderNumber` to Payment (AC: #3, #5)
  - [x] Edit `prisma/schema.prisma`: add `orderNumber String @map("order_number")` field to `Payment` model (after `orderId`)
  - [x] Run `npx prisma migrate dev --name add_order_number_to_payment`
  - [x] **DO NOT** change any other model or enum — only add `orderNumber` to `Payment`
  - [x] Verify migration generates SQL: `ALTER TABLE payments ADD COLUMN order_number TEXT NOT NULL`
  - [x] Note: `processedAt` on `ProcessedWebhook` is set at INSERT time (not processing-completion time) — this is a known semantic concern from Story 1.1, acceptable in Phase 1

- [x] Task 2: Update `app/services/payment.server.ts` — store `orderNumber` in createPaymentData (AC: #5)
  - [x] In `createPaymentData()` params, `orderNumber` already exists as a parameter — confirm it is passed in
  - [x] In `db.payment.create({ data: { ... } })`: add `orderNumber,` to the data object (it's currently omitted — DEV MISTAKE FROM STORY 2.1!)
  - [x] In the `existing` early-return path: add `orderNumber: existing.orderNumber` to the returned object
  - [x] In `payment.server.test.ts`: update test fixtures to include `orderNumber` in mocked Payment DB responses
  - [x] **DO NOT** change any other function in this file

- [x] Task 3: Create `app/lib/paymentStateMachine.ts` (AC: #2)
  - [x] `PaymentStatus` type is already defined as Prisma enum — import from `@prisma/client` instead of redefining: `import type { PaymentStatus } from "@prisma/client";`
  - [x] Export type re-export: `export type { PaymentStatus };`
  - [x] Define `VALID_TRANSITIONS`:
    ```typescript
    const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
      PENDING:    ["PROCESSING", "EXPIRED"],
      PROCESSING: ["SUCCESS", "FAILED"],
      SUCCESS:    [],
      FAILED:     [],
      EXPIRED:    [],
    };
    ```
  - [x] Export function: `export function assertValidTransition(from: PaymentStatus, to: PaymentStatus): void` — throws `Error(\`Invalid payment transition: \${from} → \${to}\`)` if invalid
  - [x] This is a pure utility with zero DB/Shopify/Tingee knowledge — belongs in `lib/`

- [x] Task 4: Create `app/lib/paymentStateMachine.test.ts` (AC: #2)
  - [x] Test: PENDING → PROCESSING is valid (no throw)
  - [x] Test: PENDING → EXPIRED is valid (no throw)
  - [x] Test: PROCESSING → SUCCESS is valid (no throw)
  - [x] Test: PROCESSING → FAILED is valid (no throw)
  - [x] Test: COMPLETED → anything throws (terminal state)
  - [x] Test: FAILED → anything throws (terminal state)
  - [x] Test: PENDING → SUCCESS throws (invalid — skip PROCESSING)
  - [x] 7+ tests

- [x] Task 5: Create `app/lib/idempotency.server.ts` (AC: #1, #6)
  - [x] Import: `import db from "../db.server";`
  - [x] Import Prisma error: `import { Prisma } from "@prisma/client";`
  - [x] Export function: `export async function insertIdempotencyRecord(params: { idempotencyKey: string; topic: string; shopDomain: string; }): Promise<"inserted" | "duplicate">`
    - Try `db.processedWebhook.create({ data: { idempotencyKey, topic, shopDomain, status: "PENDING" } })`
    - Catch `Prisma.PrismaClientKnownRequestError` with `code === "P2002"` → return `"duplicate"`
    - Rethrow all other errors
  - [x] Export function: `export async function updateIdempotencyStatus(idempotencyKey: string, status: "COMPLETED" | "FAILED"): Promise<void>`
    - `db.processedWebhook.update({ where: { idempotencyKey }, data: { status } })`
  - [x] **DO NOT** use `$transaction()` — the architecture explicitly prohibits it for this pattern (holds DB lock across HTTP calls)

- [x] Task 6: Create `app/lib/idempotency.server.test.ts` (AC: #1, #6)
  - [x] Mock `db.processedWebhook.create` and `db.processedWebhook.update`
  - [x] Test: first INSERT succeeds → returns `"inserted"`
  - [x] Test: P2002 error → returns `"duplicate"` without throwing
  - [x] Test: other DB error → rethrows
  - [x] Test: `updateIdempotencyStatus` calls `db.processedWebhook.update` with correct args
  - [x] 4+ tests

- [x] Task 7: Create `app/services/order.server.ts` (AC: #4)
  - [x] Import `unauthenticated` from `"../shopify.server"`
  - [x] Import `sanitizeForLog` from `"../lib/logger.server"`
  - [x] Export function: `export async function addOrderNote(shopDomain: string, orderId: string, note: string): Promise<void>`
    - Get admin API: `const { admin } = await unauthenticated.admin(shopDomain);`
    - Call GraphQL mutation `orderUpdate` with `input: { id: orderId, note }` (Shopify API version 2025-07)
    - Mutation: `mutation orderUpdate($input: OrderInput!) { orderUpdate(input: $input) { order { id } userErrors { field message } } }`
    - If `userErrors` is non-empty: log warning via `sanitizeForLog()` but do NOT throw (order note is non-fatal per architecture)
    - If GraphQL call itself throws: log warning via `sanitizeForLog()` but do NOT throw (non-fatal)
  - [x] Export stub function: `export async function markOrderPaid(_shopDomain: string, _orderId: string): Promise<void>`
    - Body: `throw new Error("markOrderPaid not implemented — implement in Story 3.3");`
    - This is a deliberate stub; Story 3.3 replaces this body with Shopify API + retry logic
  - [x] Add comment at top of file: `// Story 3.3 will implement markOrderPaid() and add retry logic.`

- [x] Task 8: Create `app/services/order.server.test.ts` (AC: #4)
  - [x] Mock `unauthenticated` from `"../shopify.server"`: `vi.mock("../shopify.server", () => ({ unauthenticated: { admin: vi.fn() } }))`
  - [x] Test: `addOrderNote` calls admin.graphql with correct mutation + variables
  - [x] Test: `addOrderNote` with userErrors in response — logs warning but does NOT throw
  - [x] Test: `addOrderNote` when admin.graphql throws — does NOT throw (non-fatal)
  - [x] Test: `markOrderPaid` throws `Error` (confirms stub behavior)
  - [x] 4+ tests

- [x] Task 9: Add `reconcileWebhookPayment()` to `app/services/payment.server.ts` (AC: #1–#6)
  - [x] Add imports at top: `import { insertIdempotencyRecord, updateIdempotencyStatus } from "../lib/idempotency.server";`
  - [x] Add imports: `import { assertValidTransition } from "../lib/paymentStateMachine";`
  - [x] Add import: `import { addOrderNote } from "./order.server";`
  - [x] Define types in this file
  - [x] Export helper: `function extractOrderNumber(content: string): string | null`
  - [x] Export function: `export async function reconcileWebhookPayment(...): Promise<ReconciliationResult>`

- [x] Task 10: Update `app/services/payment.server.test.ts` (AC: #1–#6)
  - [x] Add mocks: `vi.mock("../lib/idempotency.server", ...)`, `vi.mock("../lib/paymentStateMachine", ...)`, `vi.mock("./order.server", ...)`
  - [x] Test: duplicate idempotency key → `{ type: "skip" }`, no DB payment query
  - [x] Test: content cannot be parsed → `{ type: "no_payment_found" }`, idempotency updated to FAILED
  - [x] Test: no Payment record found → `{ type: "no_payment_found" }`, idempotency updated to FAILED
  - [x] Test: Payment in terminal state → `{ type: "invalid_transition" }`, idempotency COMPLETED
  - [x] Test: amount mismatch → Payment.FAILED, idempotency.COMPLETED, addOrderNote called with correct message
  - [x] Test: amount mismatch + addOrderNote throws → still returns `{ type: "amount_mismatch" }` (non-fatal)
  - [x] Test: amount match → `{ type: "amount_matched" }`, Payment updated to PROCESSING
  - [x] 7+ new tests

- [x] Task 11: Update `app/routes/webhooks.tingee.tsx` — add Step 8 (AC: #1–#6)
  - [x] Add import: `import { reconcileWebhookPayment, type TingeeWebhookPayload } from "../services/payment.server";`
  - [x] After HMAC validation (Step 7), replace the existing "Step 8 — Return 200" placeholder with reconciliation logic
  - [x] **DO NOT** change Steps 1–7 — only replace the Step 8 return statement

- [x] Task 12: Update `app/routes/webhooks.tingee.test.ts` (AC: #1–#6)
  - [x] Add mock: `vi.mock("../services/payment.server", () => ({ reconcileWebhookPayment: vi.fn() }))`
  - [x] Add mock import: `import { reconcileWebhookPayment } from "../services/payment.server";`
  - [x] Test: reconcile returns `{ type: "skip" }` → route returns 200
  - [x] Test: reconcile returns `{ type: "no_payment_found" }` → route returns 200
  - [x] Test: reconcile returns `{ type: "invalid_transition" }` → route returns 200
  - [x] Test: reconcile returns `{ type: "amount_mismatch" }` → route returns 200
  - [x] Test: reconcile returns `{ type: "amount_matched" }` → route returns 200 (Story 3.3 placeholder)
  - [x] Test: malformed payload (no transactionCode) → 400
  - [x] Test: malformed payload (non-numeric amount) → 400
  - [x] All existing 10 tests pass (Steps 1–7 unchanged)
  - [x] 7+ new tests

## Dev Notes

### CRITICAL: Schema Gap — `orderNumber` Missing From Payment

The `Payment` model was created in Story 1.1 without an `orderNumber` field. The `createPaymentData()` function accepts `orderNumber` as a parameter but **currently does not store it** in the DB. This is a bug introduced in Story 2.1 that must be fixed in this story.

When Tingee webhook arrives with `content = "TINGEE 1001"`, we parse `orderNumber = "1001"` and look up `Payment` by `{ shopDomain, orderNumber: "1001" }`. Without the schema change in Task 1 and the fix in Task 2, this lookup always fails.

### Tingee Webhook Payload Shape

```typescript
// Confirmed from architecture doc + Tingee API docs
interface TingeeWebhookPayload {
  transactionCode: string;   // idempotency key, e.g. "TX_ABC123"
  amount: number;            // integer VND, e.g. 1500000 (never decimal)
  content: string;           // transfer content = "TINGEE {order_number}", e.g. "TINGEE 1001"
  transactionDate?: string;  // "yyyyMMddHHmmss" format (UTC+7) — not needed for reconciliation
  additionalData?: unknown;  // for dynamic QR (not used in Static QR flow)
}
```

**Order number extraction:**
```typescript
function extractOrderNumber(content: string): string | null {
  if (!content.startsWith("TINGEE ")) return null;
  const parts = content.split(" ");
  if (parts.length !== 2 || !parts[1]) return null;
  return parts[1]; // e.g. "1001"
}
```

The order number in the `content` field is the **Shopify order number** (human-readable, e.g. `1001` not `gid://shopify/Order/12345`). This is what was passed as `orderNumber` to `createPaymentData()` and what we need to store + match on.

### ProcessedWebhookStatus vs ProcessedWebhook Schema

The actual Prisma schema (confirmed by reading `prisma/schema.prisma`):
```prisma
enum ProcessedWebhookStatus {
  PENDING
  COMPLETED
  FAILED
}

model ProcessedWebhook {
  id             String                 @id @default(cuid())
  idempotencyKey String                 @unique @map("idempotency_key")
  status         ProcessedWebhookStatus @default(PENDING)
  topic          String
  shopDomain     String                 @map("shop_domain")
  processedAt    DateTime               @default(now()) @map("processed_at")
  payloadHash    String?                @map("payload_hash")
  @@index([shopDomain, topic])
  @@index([processedAt])
  @@map("processed_webhooks")
}
```

The architecture doc showed a schema without `status` — **the actual implemented schema HAS `status`**. Do not create a migration to add `status` — it already exists.

### PaymentStatus Enum — Import From Prisma, Don't Redefine

The `PaymentStatus` enum is already defined in Prisma and in the generated client:
```typescript
// Already in prisma/schema.prisma:
// enum PaymentStatus { PENDING, PROCESSING, SUCCESS, FAILED, EXPIRED }
```

In `paymentStateMachine.ts`, import from `@prisma/client` — do NOT create a new TypeScript type:
```typescript
import type { PaymentStatus } from "@prisma/client";
```

### Idempotency Pattern — Status-Based (NOT $transaction())

The architecture is explicit: `$transaction()` is **prohibited** for this pattern because it holds a DB lock across the Shopify API HTTP round-trip (Story 3.3), causing deadlocks under load.

The status-based pattern:
1. INSERT ProcessedWebhook (PENDING) — P2002 = already seen this transactionCode
2. Do work
3. UPDATE ProcessedWebhook (COMPLETED/FAILED) — based on outcome

This is safe because: if the process crashes between step 2 and 3, ProcessedWebhook stays PENDING. The next Tingee retry will hit P2002 and return 200 (already seen). This is **intentional** — a crashed-mid-processing webhook is treated as "already seen" and no retry occurs. The recovery path is manual (delete the PENDING record and re-fire).

### addOrderNote — Shopify API Pattern for Webhook Context

Unlike admin routes that use `authenticate.admin()`, webhook handlers have no Shopify session. Use `unauthenticated.admin()` which retrieves the stored offline session:

```typescript
import { unauthenticated } from "../shopify.server";

export async function addOrderNote(shopDomain: string, orderId: string, note: string): Promise<void> {
  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    const response = await admin.graphql(
      `mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id }
          userErrors { field message }
        }
      }`,
      { variables: { input: { id: orderId, note } } }
    );
    const data = await response.json();
    const userErrors = data?.data?.orderUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      console.warn("[WEBHOOK] addOrderNote userErrors", sanitizeForLog({ shopDomain, orderId, userErrors: userErrors.length }));
    }
  } catch (error) {
    console.warn("[WEBHOOK] addOrderNote failed (non-fatal)", sanitizeForLog({ shopDomain, orderId }));
    // Non-fatal: order note failure does not abort reconciliation
  }
}
```

The `orderId` on the Payment model is the Shopify GID: `"gid://shopify/Order/12345"`. Pass it directly to the mutation — Shopify GraphQL accepts GIDs as the `id` field on `OrderInput`.

### markOrderPaid Stub — Must Be Replaced in Story 3.3

```typescript
// order.server.ts
export async function markOrderPaid(_shopDomain: string, _orderId: string): Promise<void> {
  throw new Error("markOrderPaid not implemented — implement in Story 3.3");
}
```

**Important deployment note:** Do NOT deploy Story 3.2 to production without Story 3.3. When `reconcileWebhookPayment` returns `{ type: "amount_matched" }`, the webhook handler currently just returns 200 with the Payment in PROCESSING state and ProcessedWebhook in PENDING state. On subsequent Tingee retries, the P2002 guard returns 200 immediately — the order is never marked Paid. Story 3.3 completes this flow by implementing `markOrderPaid()`.

### Files State — What Exists vs What to Create

**Modify existing (DO NOT recreate):**
```
prisma/schema.prisma                    ← ADD orderNumber to Payment + migrate
app/services/payment.server.ts         ← ADD orderNumber to createPaymentData + ADD reconcileWebhookPayment()
app/services/payment.server.test.ts    ← ADD reconciliation tests
app/routes/webhooks.tingee.tsx         ← REPLACE Step 8 with reconciliation call
app/routes/webhooks.tingee.test.ts     ← ADD new test cases
```

**Create new:**
```
app/lib/paymentStateMachine.ts         ← NEW
app/lib/paymentStateMachine.test.ts    ← NEW
app/lib/idempotency.server.ts          ← NEW
app/lib/idempotency.server.test.ts     ← NEW
app/services/order.server.ts           ← NEW (addOrderNote + markOrderPaid stub)
app/services/order.server.test.ts      ← NEW
```

**DO NOT touch (regression risk):**
```
app/lib/hmac.server.ts                 ← Story 3.1, no changes
app/lib/rateLimit.server.ts            ← Story 3.1, no changes
app/services/tingee.server.ts          ← Story 3.1, no changes
app/routes/api.orders.$orderId.*       ← Epic 2, no changes
prisma/migrations/                     ← Only add new migration, never edit old ones
```

### Current webhooks.tingee.tsx State (Before This Story)

The route currently ends at Step 8 with a plain `return new Response(null, { status: 200 })` and a comment `// Story 3.2 adds idempotency + reconciliation logic HERE`. The `_payload` variable holds the parsed JSON but is typed as `unknown`. Tasks 11 validates `_payload` shape and calls `reconcileWebhookPayment`.

The `_payload` variable name has an underscore prefix (linter-silence for "unused variable"). After Task 11, it becomes `payload` (used). Consider renaming to remove the underscore if linting rules require it.

### Amount Match — Strict Integer Comparison

From architecture: `receivedAmount === expectedAmount` — strict integer VND, no epsilon tolerance, no decimal.

The `Payment.amount` is stored as `Int` in Prisma (PostgreSQL INTEGER), so no decimal precision issues. The webhook `payload.amount` is `number` from JSON — if Tingee ever sends `1500000.00` (float), `1500000.00 === 1500000` is `true` in JS. Safe for our use case.

Guard: If `typeof payload.amount !== "number"` → return 400 (validation in route, Task 11).

### Pact Contract — No Changes Needed

Story 3.1 already ran Pact provider verification for `GET /api/orders/:orderId/payment-status`. Story 3.2 does NOT modify that endpoint — no re-verification needed.

### Prior Story Learnings Applied

From Story 3.1 review:
- `sanitizeForLog()` is **shallow** — never pass `secretToken`, `amount` in sensitive contexts directly; pass only metadata (`shopDomain`, `transactionCode`, `orderId`)
- Log message prefix convention: `"[SECURITY]"` for auth failures, `"[WEBHOOK]"` for processing issues
- Test pattern: `vi.mock()` calls before imports, `vi.mocked()` for typed mock access, `beforeEach(() => vi.clearAllMocks())`
- `beforeEach` must be called in every test file

From deferred-work.md (Story 3.1):
- Rate limiter trusts `x-forwarded-for` — pre-existing pattern, do NOT change in this story
- Future timestamps bypass replay window — Story 3.1 already fixed (added `tsMs > Date.now()` guard)

### Testing Patterns — Follow These

**Mock pattern from `webhooks.tingee.test.ts`:**
```typescript
// Module-level vi.mock before ANY imports from those modules
vi.mock("../services/payment.server", () => ({
  reconcileWebhookPayment: vi.fn(),
}));

// Then normal imports
import { reconcileWebhookPayment } from "../services/payment.server";
```

**Integration test helper pattern from `test/helpers/db.ts`:**
- Use Testcontainers PostgreSQL for integration tests (if adding integration tests)
- Unit tests: mock `db` via `vi.mock("../db.server", () => ({ default: { processedWebhook: { create: vi.fn(), update: vi.fn() }, payment: { findFirst: vi.fn(), update: vi.fn() } } }))`

**Factory function pattern:**
```typescript
const makeValidPayload = (overrides = {}): TingeeWebhookPayload => ({
  transactionCode: "TX_TEST_123",
  amount: 1500000,
  content: "TINGEE 1001",
  ...overrides,
});
```

### References

- [Source: epics.md#Story 3.2] — Full acceptance criteria
- [Source: epics.md#FR-12] — Exact Amount Match, Order Note when mismatch
- [Source: epics.md#FR-13] — Idempotency, retry prevention
- [Source: epics.md#NFR-6] — Idempotency table `processed_webhooks` unique constraint on `transactionCode`
- [Source: architecture.md#Idempotency — Status-Based Pattern] — Prohibits `$transaction()`, status-based flow
- [Source: architecture.md#Exact Amount Match — Tolerance] — Strict integer VND, no epsilon
- [Source: architecture.md#Tingee Webhook Payload] — `transactionCode`, `amount`, `content`, `additionalData`
- [Source: architecture.md#`lib/` vs `services/` rule] — `paymentStateMachine.ts` and `idempotency.server.ts` in `lib/`
- [Source: app/routes/webhooks.tingee.tsx] — Current Step 8 placeholder to replace
- [Source: prisma/schema.prisma] — `ProcessedWebhookStatus` enum (PENDING/COMPLETED/FAILED) already exists; `PaymentStatus` enum already exists
- [Source: app/services/payment.server.ts] — `createPaymentData()` has `orderNumber` param but does NOT store it — bug to fix in Task 2
- [Source: app/services/tingee.server.ts] — `verifyWebhookHMAC()` already implemented (Story 3.1)
- [Source: app/lib/idempotency.server.ts] — Story 3.1 noted this file must be created in 3.2
- [Source: app/lib/paymentStateMachine.ts] — Story 3.1 noted this file must be created in 3.2

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Schema: Added `orderNumber String @map("order_number")` to Payment model + `@@index([shopDomain, orderNumber])`. Applied via `prisma db push` (no migrations folder existed — project uses push-based workflow).
- Bug fix: `createPaymentData()` now stores `orderNumber` in DB (was silently dropped since Story 2.1).
- New file `app/lib/paymentStateMachine.ts`: pure state machine for PaymentStatus transitions, imports enum from `@prisma/client`.
- New file `app/lib/idempotency.server.ts`: P2002-based idempotency using INSERT-then-UPDATE pattern (no `$transaction()` per architecture constraint).
- New file `app/services/order.server.ts`: `addOrderNote()` via `unauthenticated.admin()` for webhook context; `markOrderPaid()` stub throws to prevent accidental use before Story 3.3.
- `reconcileWebhookPayment()` added to `payment.server.ts`: orchestrates idempotency → state machine → amount check → order note flow as per AC #1–#6.
- Route `webhooks.tingee.tsx` now validates payload shape (400 on missing/invalid fields) and calls `reconcileWebhookPayment()`.
- All 5 pre-existing failures (app.settings + usePaymentStatus) confirmed pre-existing via `git stash` — not introduced by this story.
- 221 tests pass, 5 pre-existing failures.

### File List

- `prisma/schema.prisma` — added `orderNumber` field + index to Payment model
- `app/services/payment.server.ts` — store orderNumber, add reconcileWebhookPayment() + types
- `app/services/payment.server.test.ts` — updated fixtures + 7 new reconciliation tests
- `app/routes/webhooks.tingee.tsx` — replaced Step 8 with payload validation + reconciliation
- `app/routes/webhooks.tingee.test.ts` — updated VALID_BODY + 7 new route tests
- `app/lib/paymentStateMachine.ts` — NEW: PaymentStatus state machine
- `app/lib/paymentStateMachine.test.ts` — NEW: 8 state machine tests
- `app/lib/idempotency.server.ts` — NEW: idempotency INSERT/UPDATE helpers
- `app/lib/idempotency.server.test.ts` — NEW: 4 idempotency tests
- `app/services/order.server.ts` — NEW: addOrderNote() + markOrderPaid() stub
- `app/services/order.server.test.ts` — NEW: 4 order service tests

### Review Findings

- [x] [Review][Patch] amount_matched path: add AWAITING_MARK_PAID to ProcessedWebhookStatus enum and update idempotency record on amount_matched — resolved decision: Option 2, thêm trạng thái trung gian để DB phản ánh đúng trạng thái hệ thống [prisma/schema.prisma + app/lib/idempotency.server.ts + app/services/payment.server.ts]

- [x] [Review][Patch] orderNumber NOT NULL column has no default — will fail migration if any existing Payment rows exist [prisma/schema.prisma]
- [x] [Review][Patch] extractOrderNumber not exported — spec (Task 9) mandates export keyword [app/services/payment.server.ts]
- [x] [Review][Patch] payload.content not validated in Step 8 — missing content field causes TypeError in extractOrderNumber (undefined.startsWith) [app/routes/webhooks.tingee.tsx]
- [x] [Review][Patch] extractOrderNumber too strict — parts.length !== 2 rejects "TINGEE 1001 extra" content; use content.slice(7).trim() instead [app/services/payment.server.ts]
- [x] [Review][Defer] AC#2 and AC#5: Sentry not called — Sentry not installed in project; added TODO comments in code; requires adding @sentry/node as project dependency [app/services/payment.server.ts] — deferred, Sentry not yet in stack
- [x] [Review][Patch] Uncaught DB exceptions in reconcileWebhookPayment propagate as 500 and strand idempotency record in PENDING — add top-level try/catch [app/services/payment.server.ts]
- [x] [Review][Patch] addOrderNote uses orderUpdate mutation which replaces entire note field — existing merchant notes silently destroyed; should fetch + append [app/services/order.server.ts]
- [x] [Review][Patch] Payment updated to PROCESSING before amount check — on mismatch causes two DB writes (PROCESSING then FAILED) with brief incorrect intermediate state; move amount check before Step 5 [app/services/payment.server.ts]
- [x] [Review][Patch] Whitespace-only transactionCode (e.g. "   ") is truthy and passes Step 8 — add .trim() check [app/routes/webhooks.tingee.tsx]
- [x] [Review][Patch] updateIdempotencyStatus failure uncaught in all error paths — DB blip during status update causes 500 even after primary logic completed [app/services/payment.server.ts]

- [x] [Review][Defer] Race condition: two different transactionCodes for the same order can both pass idempotency and both update Payment from PENDING → PROCESSING — requires DB-level atomic compare-and-swap (UPDATE WHERE status='PENDING'); architectural gap beyond Story 3.2 scope — deferred, pre-existing

## Change Log

- 2026-06-29: Story 3.2 created — Payment Reconciliation & Idempotency
- 2026-06-29: Story 3.2 implemented — all 12 tasks complete, 221/226 tests pass (5 pre-existing failures)
