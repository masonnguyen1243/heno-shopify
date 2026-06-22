---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-06-22'
inputDocuments:
  - planning-artifacts/briefs/brief-Tingee-Shopify-App-2026-06-22/brief.md
  - planning-artifacts/prds/prd-Tingee-Shopify-App-2026-06-22/prd.md
  - planning-artifacts/ux-designs/ux-Tingee-Shopify-App-2026-06-22/DESIGN.md
  - planning-artifacts/ux-designs/ux-Tingee-Shopify-App-2026-06-22/EXPERIENCE.md
  - https://developers.tingee.vn/docs/banking/
  - https://developers.tingee.vn/sdk/
  - https://shopify.dev/docs/api/shopify-cli
  - https://shopify.dev/docs/api
workflowType: 'architecture'
project_name: 'Tingee-Shopify-App'
user_name: 'Cuong'
date: '2026-06-22'
constraints:
  - "Tingee API: dùng Production URL (không dùng UAT/staging). Mọi integration call, webhook endpoint đăng ký, và credential đều nhắm thẳng vào môi trường Production của Tingee."
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

14 FRs tổ chức trong 4 nhóm:

- **Nhóm 1 — Cài đặt & OAuth (FR-1, FR-2):** Shopify OAuth flow, uninstall cleanup + GDPR data deletion trong 48h.
- **Nhóm 2 — Cấu hình Credential (FR-3, FR-4, FR-5):** Nhập/validate/lưu Client ID + Secret Token, tự động đăng ký Manual Payment Method "Thanh toán qua Tingee QR".
- **Nhóm 3 — Order Status Extension (FR-6 đến FR-10b):** Hiển thị Static QR + Deeplink (mobile only, < 768px), polling 5s tối đa 15 phút, countdown timer, expired state với hướng dẫn đặt lại đơn.
- **Nhóm 4 — Webhook Handler & Reconciliation (FR-11 đến FR-14):** HMAC-SHA512 validation, Exact Amount Match, retry 3 lần với exponential backoff (1s/5s/30s), cập nhật Shopify Order sang Paid. Order Note khi amount mismatch.

**Non-Functional Requirements:**

| NFR | Constraint | Kiến trúc bị ảnh hưởng |
|---|---|---|
| Webhook response ≤ 5s | Hard limit Tingee | Webhook handler phải async (DB queue) |
| Admin load < 2s | UX requirement | Frontend caching, lazy load |
| Order Status Extension ≤ 500ms | UX requirement | QR/Deeplink pre-generated tại order time |
| Secret Token không bao giờ expose | Security | Backend-only decryption |
| HMAC-SHA512 validation | Security | Middleware cho inbound webhook |
| Rate limit webhook endpoint | Security | ≥ 1000 req/phút từ cùng IP → throttle |
| Shopify API version ≥ 2025-07 | Compliance | Pinned trong config |
| GDPR webhooks (3 loại) | Compliance | Mandatory endpoint handlers |
| AES-256 cho Credential storage | Security | Encrypted fields tại DB |

**Scale & Complexity:**

- Primary domain: Full-stack Node.js (Backend API + Shopify Checkout UI Extension + Polaris Admin UI)
- Complexity level: **Medium**
- Estimated architectural components: 6 (Backend API, Credential Store, Webhook Handler, QR/Deeplink Service, Admin UI, Order Status Extension)
- Multi-tenancy: Yes — shop-scoped isolation bắt buộc trên mọi DB query
- Pilot scale: ~100 merchants, ~0.7 webhook events/phút steady, peak ~5–10 events/phút

### Technical Constraints & Dependencies

| Dependency | Role | Constraint |
|---|---|---|
| `@tingee/sdk-node` | HMAC auth + QR/Deeplink/API calls | Node.js ≥ 18; project dùng 22.12+. Pin exact version — không dùng `^` hay `~` |
| Tingee API | Banking, QR, Deeplink, Webhook IPN | **Production URL only — không có UAT/sandbox** |
| Tingee webhook SLA | Hard 5s response window | **SLA chưa được xác nhận** — cần escalate với Tingee trước khi launch |
| Shopify GraphQL Admin API | Đăng ký payment method, cập nhật order | Version ≥ 2025-07 |
| Shopify Checkout UI Extension | Order Status Extension | Phải pass Shopify Extension review |
| Shopify App Store | Distribution | App Review: ~2-4 tuần — cần tính vào timeline |
| Shopify OAuth | App install & auth | Scopes: `write_orders`, `read_orders`, `write_payment_gateways`, `read_payment_gateways` |

### Cross-Cutting Concerns Identified

1. **Security** — HMAC-SHA512 (inbound webhook + outbound Tingee API), AES-256 (credential storage), rate limiting: ảnh hưởng Webhook Handler, Credential Service, mọi API layer.
2. **Multi-tenancy** — Mọi DB query, cache key, và API call phải scoped theo `shop_domain`. Shared schema + row-level isolation là quyết định đúng với scale này.
3. **Async webhook processing** — Webhook phải ACK trong 5s → toàn bộ processing logic (Shopify API call, retry, DB update) chạy async qua DB queue.
4. **Error handling & Retry** — Exponential backoff (1s/5s/30s) cho Shopify API calls; Dead Letter Queue cho orders không confirm được sau 3 lần retry.
5. **Logging & Observability** — Security events (invalid HMAC, rate limit hit), retry failures, amount mismatch, Tingee API response times: cần thu thập từ Day 1 pilot để tự define SLA.
6. **Environment config** — Tingee Production URL, Shopify API version, AES key, timeout values: tập trung tại một config layer, không hardcode.
7. **Polling lifecycle** — Order Status Extension phải cleanup interval đúng cách (`useEffect` + `clearInterval` on unmount, Visibility API để pause khi tab hidden, `AbortController` cho in-flight fetch).

### Async Webhook Architecture Decision

**Quyết định:** DB-backed queue dùng **PostgreSQL + `pg-boss`**.

- Webhook endpoint: validate HMAC (< 50ms) → enqueue job → return `200 OK` (tổng < 200ms)
- Background worker: xử lý Shopify API call, retry logic, DLQ
- Lý do: Volume ~0.7 events/phút không justify Redis/BullMQ. PostgreSQL đủ dùng, không thêm infrastructure dependency.
- Upgrade path: migrate sang BullMQ + Redis khi volume > 10,000 events/ngày.

### Operational Resilience

- **Circuit breaker:** Cần thiết kế phòng khi Tingee API degrade — slow response, partial failure, hoặc silent drop.
- **Idempotency key:** Mọi call đến Tingee phải idempotent — tracking state phía app trước khi call để tránh duplicate QR/transaction khi retry.
- **Dead Letter Queue:** Failed jobs sau 3 attempts → DLQ. Manual review trong Shopify Admin. Alert cho team qua Slack/email.

### Test Strategy (No-UAT Environment)

Vì Tingee không có UAT environment:

- **Contract testing (Pact):** Pin JSON schema của Tingee webhook payload. Chạy `pact verify` trước mỗi merge. Catch breaking changes mà không cần live env.
- **Production-mirror integration tests:** Mock Tingee delay 3s/5s/8s, retry exhaustion, duplicate webhook IDs (idempotency), timeout scenarios.
- **Observability từ Day 1:** Thu thập `tingee.api.response_time` histogram trong 2 tuần đầu pilot → dùng P95 để negotiate SLA với Tingee.

### Load Thresholds (100 Merchant Pilot)

```yaml
steady_state_rps: 0.3
peak_rps: 5
p95_response_ms: 2000
p99_response_ms: 5000
error_rate_max: 1%
queue_depth_alert: 500
```

### Open Risks

| Risk | Severity | Hành động |
|---|---|---|
| Tingee webhook SLA chưa xác nhận | P0 | Lấy SLA document từ Tingee trước khi code |
| Production-only Tingee — không debug được bằng staging | P0 | Contract testing + capture/replay production payloads |
| Shopify App Store review ~2-4 tuần | Medium | Submit sớm, tính vào timeline |
| AES-256 key management chưa quyết định | P1 | Quyết định trong bước kiến trúc tiếp theo |

---

## Starter Template Evaluation

### Primary Technology Domain

Shopify App — Full-stack Node.js/TypeScript. Yêu cầu Shopify-specific infrastructure (OAuth, App Bridge, Extension system) — không dùng generic web starters.

### Starter Options Considered

| Option | Verdict |
|---|---|
| **Shopify CLI — React Router 7 template** | ✅ Chọn |
| Extension-only template | ❌ Không có backend |
| Next.js custom | ❌ Phải tự build OAuth/session từ đầu |
| Remix template (cũ) | ❌ Deprecated, đã migrate sang React Router 7 |

### Selected Starter: Shopify App — React Router 7 Template

**Rationale:** Official Shopify template, maintained bởi Shopify team, cung cấp đầy đủ boilerplate OAuth, session, App Bridge, Extension scaffolding.

**Initialization Command:**

```bash
npm create @shopify/app@latest
# Chọn: "Build a React Router app"
# Sau khi scaffold xong, thêm Order Status Extension:
shopify app generate extension --type checkout_ui_extension
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- TypeScript (85%+ codebase), Node.js 22.12+
- `tsconfig.json` pre-configured

**Framework & Routing:**
- React Router 7+ — server-side rendering, file-based routing tại `/app`
- App Bridge pre-configured — `@shopify/app-bridge-react` cho embedded Admin UI

**Database & ORM:**
- Prisma ORM — schema tại `prisma/schema.prisma`
- Default SQLite → **migrate sang PostgreSQL ngay bước đầu tiên sau scaffold**

**Authentication:**
- Shopify OAuth pre-configured qua `shopify` constant tại `/app/shopify.server.ts`
- Admin routes dùng `authenticate.admin()`, Extension API dùng `authenticate.public.checkout()` — **hai path khác nhau, không được nhầm**

**Webhook Handling:**
- Boilerplate webhook handler có sẵn
- **Phase 1: xử lý synchronous** — validate HMAC → gọi Shopify API → trả 200. Ở scale 100 merchants (~0.7 webhook/phút), tổng thời gian ~200–800ms, nằm thoải mái trong 5 giây Tingee limit
- Upgrade path: add pg-boss khi p99 > 3s hoặc merchants > 500

**Project Structure:**
```
/app          → Routes, server logic, Admin Surface
/extensions   → Order Status Extension (Checkout UI Extension)
/prisma       → DB schema
/public       → Static assets
shopify.app.toml → App config, scopes, extensions
```

### Deployment: Fly.io

**Lý do chọn Fly.io:**
- Managed PostgreSQL cùng region — latency thấp
- Persistent process (không sleep như Render free tier)
- `fly scale count 2` khi cần HA đơn giản
- Chi phí ~$5–10/tháng phù hợp pilot

**Loại bỏ:** Railway (restart container thường xuyên có thể interrupt webhook processing), Render (cần paid tier), AWS/GCP (overkill cho 100 merchants).

### Post-Scaffold Checklist (6 items)

1. **Migrate Prisma SQLite → PostgreSQL** — đổi `datasource provider`, xóa `prisma/migrations/`, chạy lại `prisma migrate dev --name init_postgres`. Dùng `String @id @default(uuid())` thay `autoincrement()`
2. **Environment validation schema** — `app/lib/env.server.ts` dùng Zod, fail-fast với message rõ ràng
3. **PostgreSQL connection pool config** — `DATABASE_URL` include `?connection_limit=10&pool_timeout=20`
4. **Generate Order Status Extension** — `shopify app generate extension --type checkout_ui_extension`
5. **Pin `@tingee/sdk-node` exact version** — không dùng `^` hay `~` trong `package.json`
6. **Audit `shopify.app.toml` scopes** — chỉ giữ `read_orders,write_orders,read_payment_gateways`. Scope thừa sẽ bị App Store review flag

### Testing Stack (Add Ngay Sau Scaffold)

```
vitest + @vitest/coverage-v8        # Test runner, ESM native
@testing-library/react              # Component test
msw v2                              # Mock HTTP layer (Tingee + Shopify API)
@testcontainers/postgresql          # Real PostgreSQL cho integration test
@pact-foundation/pact               # Contract testing với Tingee API
```

**Bắt buộc build trước khi viết bất kỳ loader nào:** `test/helpers/shopify-session.ts` — fixture mock Shopify session cho loader/action tests.

**Order Status Extension test approach:**
- Unit: `@shopify/ui-extensions-react/testing` — mock hooks, test business logic và state machine
- Contract: Pact — Extension là consumer của Order data từ Shopify
- Manual: Smoke test checklist mỗi release (không dùng Playwright ở Phase 1)

**Note:** Project initialization using the command above should be the first implementation story.

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical (Block Implementation):**
- AES-256 single master key — `ENCRYPTION_KEY` env var, key version scheme trong DB
- `processed_webhooks` idempotency table — bắt buộc trước khi viết webhook handler
- Two-endpoint API pattern cho Order Status Extension
- QR server-side generated, Extension render `<img>`
- Webhook synchronous processing (không queue Phase 1)

**Important (Shape Architecture):**
- Rate limiting middleware trên webhook endpoint
- GitHub Actions CI/CD + `fly deploy`
- Sentry + Fly.io logs cho monitoring

**Deferred (Post-MVP):**
- Async queue (pg-boss): khi p99 Shopify API > 3s hoặc > 500 merchants
- Envelope encryption / KMS: khi scale justify
- Edge-level rate limiting (Cloudflare): khi có attack pattern thực tế
- Business-level observability dashboard: trước merchant thứ 200

### Data Architecture

**AES-256 Key Management:**
- Approach: Single master key (`ENCRYPTION_KEY` env var trên Fly.io secrets)
- Encrypted value schema: `{ version: number, iv: string, tag: string, data: string }` — JSON column trong Prisma
- Key version phải được lưu để support rotation về sau
- Rotation runbook cần document trước khi onboard merchant thứ 200
- Upgrade path: Envelope encryption khi scale > 500 merchants hoặc có KMS

**Multi-tenancy:**
- Shared PostgreSQL schema, row-level isolation bằng `shop_domain`
- Convention bắt buộc: mọi DB query phải có `WHERE shop_domain = ?`

**Idempotency (Webhook):**
- Table: `processed_webhooks` với unique constraint trên `idempotency_key`
- Key format: `tingee:{transactionCode}` — dùng `transactionCode` từ Tingee payload
- Rollback record nếu business logic fail → cho phép Tingee retry thành công
- Tingee retry tối đa **5 lần** (correction từ PRD FR-13 ghi 3 lần)
- Cleanup job: xóa records > 30 ngày

```prisma
model ProcessedWebhook {
  id             String   @id @default(cuid())
  idempotencyKey String   @unique @map("idempotency_key")
  topic          String
  shopDomain     String   @map("shop_domain")
  processedAt    DateTime @default(now()) @map("processed_at")
  statusCode     Int      @map("status_code")
  payloadHash    String?  @map("payload_hash")

  @@index([shopDomain, topic])
  @@index([processedAt])
  @@map("processed_webhooks")
}
```

### Authentication & Security

**Shopify OAuth:** Handled bởi React Router 7 template (`@shopify/shopify-app-remix`)

**Tingee Webhook Validation:**
- Header `x-signature` = `HMAC_SHA512(x-request-timestamp + ":" + json_body, secretToken)`
- Header `x-request-timestamp` format: `yyyyMMddHHmmssSSS` (UTC+7)
- Validate HMAC **trước** mọi xử lý — reject 401 nếu invalid, không ghi idempotency record
- Replay attack: reject payload có `x-request-timestamp` cũ hơn 5 phút

**Rate Limiting:**
- Library: middleware trong app (express-rate-limit hoặc tương đương)
- Scope: `/webhook/tingee` endpoint
- Threshold: 100 req/15 phút per IP

**Extension Endpoints Auth:**
- Admin routes: `authenticate.admin()` — Shopify embedded session
- Extension API (`/api/orders/*`): `authenticate.public.checkout()` — **không được nhầm hai path này**
- IDOR protection: verify `shop_domain` match trên mọi order query

**Security Tests bắt buộc:**
- Key không xuất hiện trong logs/error responses
- Raw DB value phải là ciphertext (Testcontainers assertion)
- Invalid HMAC → 401, zero DB write
- IDOR: merchant A không đọc được order của merchant B

### API & Communication Patterns

**Tingee Webhook Payload (confirmed):**

| Field | Type | Mô tả |
|---|---|---|
| `transactionCode` | string | Idempotency key |
| `amount` | number | Số tiền thực tế |
| `content` | string | Nội dung chuyển khoản |
| `additionalData` | array | Có `billId` cho dynamic QR |
| `transactionDate` | string | `yyyyMMddHHmmss` |

**Order Status Extension — Two-endpoint pattern:**

```
// Load lần đầu khi Extension mount:
GET /api/orders/:orderId/tingee-data
→ { qrImageUrl, deeplinkUrl, amount, currency: 'VND', status, expiresAt }

// Polling mỗi 5s (dừng khi terminal state):
GET /api/orders/:orderId/payment-status
→ { status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED', paidAt? }
```

- Rate limiting trên polling endpoint: chống self-DoS từ 100 merchants × 5s
- `expiresAt` trong `/tingee-data` response để Extension tự tính countdown
- Polling dừng khi reach terminal state: `COMPLETED` hoặc `EXPIRED`

**Error response format:**
```json
{ "error": "string", "code": "string" }
```

**Tingee API fallback:** Nếu Tingee API down khi tạo QR/Deeplink → `/tingee-data` trả cached data nếu có, hoặc error state rõ ràng — Extension hiển thị fallback UI thay vì crash.

### Frontend Architecture

**QR Code Rendering:**
- Server-side generate tại order time (PNG hoặc SVG)
- Serve từ cùng app domain để tránh CORS issue với Extension
- Extension: chỉ render `<img src={qrImageUrl} />`
- Cache: QR URL gắn với `orderId` — 1-to-1, cache ở server response layer

**Order Status Extension State Machine:**
```
LOADING → PENDING → COMPLETED (terminal, polling dừng)
                 → EXPIRED (terminal, hiển thị "Quay lại cửa hàng")
                 → FAILED (terminal, hiển thị lỗi)
```

**Polling lifecycle (bắt buộc):**
- `useEffect` cleanup: `clearInterval` on unmount
- Visibility API: pause polling khi tab hidden
- `AbortController`: cancel in-flight fetch on cleanup

### Infrastructure & Deployment

**Platform:** Fly.io
- Single Machine: web server (React Router 7) chạy in-process
- Database: Fly Postgres, cùng region với app
- `fly.toml` release command: `npx prisma migrate deploy` (chạy trước app start)
- Scaling: `fly scale count 2` khi cần HA

**CI/CD: GitHub Actions**
```yaml
on: push to main
jobs:
  test:   vitest + pact verify + lint
  deploy: flyctl deploy --remote-only
```
- Migration backward compatibility là team rule bắt buộc
- Rollback = `fly deploy --image <previous-image>` (DB schema không rollback được)

**Monitoring:**
- Error tracking: Sentry (free tier)
- Logs: Fly.io built-in log streaming
- Metrics thu thập từ Day 1: `tingee.api.response_time`, `webhook.processing_time`, `webhook.retry_count`, `webhook.dlq_count`
- Dùng P95 `tingee.api.response_time` sau 2 tuần pilot để negotiate SLA với Tingee

### Decision Impact Analysis

**Implementation Sequence:**
1. Scaffold (`shopify app init`) + migrate Prisma sang PostgreSQL
2. Add `processed_webhooks` table + env validation schema
3. Shopify OAuth + Admin Surface (Credential form)
4. Webhook handler (HMAC validate + idempotency + Exact Amount Match)
5. QR/Deeplink generation service
6. Order Status Extension (polling + state machine)
7. GDPR webhook handlers
8. CI/CD pipeline + Sentry integration

**Cross-Component Dependencies:**
- `ENCRYPTION_KEY` phải có trước khi implement Credential storage
- `transactionCode` idempotency phải có trước khi implement Webhook handler
- QR generation phải stable trước khi implement Extension polling
- `authenticate.public.checkout()` setup trước khi implement `/api/orders/*` endpoints

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** Toàn bộ tech stack tương thích — Node.js 22 ≥ yêu cầu `@tingee/sdk-node`, React Router 7 là official Shopify template, Prisma + PostgreSQL nhất quán, Vitest/MSW/Testcontainers/Pact không conflict với nhau.

**Pattern Consistency:** `lib/` vs `services/` boundary rõ ràng (1 rule), `*.server.ts` suffix nhất quán, `requireShopSession()` guard pattern enforceable qua PR checklist, `sanitizeForLog()` documented.

**Inconsistency đã correct:** Section "Async Webhook Architecture Decision" ban đầu ghi "DB-backed queue dùng pg-boss" — đây là quyết định trung gian đã được override. **Final decision là synchronous webhook processing** (không queue Phase 1). pg-boss bị loại hoàn toàn khỏi Phase 1.

### Requirements Coverage Validation ✅

**Functional Requirements:** 14/14 FRs covered — xem FR → Files mapping trong Project Structure section.

**Non-Functional Requirements:** 9/9 NFRs covered — webhook ≤ 5s (synchronous ~200-800ms), extension ≤ 500ms (QR pre-generated), Secret Token never exposed (AES-256 + sanitizeForLog), HMAC-SHA512 (lib/hmac.server.ts middleware), rate limit (lib/rateLimit.server.ts), Shopify API 2025-07 (pinned), GDPR x3 (routes/webhooks.tsx), AES-256 (lib/encryption.server.ts).

**App Store Requirements:** Privacy Policy route (`app/privacy.tsx`) và meaningful app home (`app.tsx`) đã được thêm vào scope.

### Implementation Readiness Validation

**Critical specifications bổ sung từ validation — bắt buộc trước khi implementation bắt đầu:**

#### 1. Tingee SDK Timeout

```
ENV: TINGEE_SDK_TIMEOUT_MS (default: 4000ms)
```
Phải pass explicitly vào mọi `@tingee/sdk-node` call. Không set timeout → handler có thể treo indefinitely khi Tingee upstream spike, vi phạm 5s webhook limit.

Synchronous webhook hard ceiling: ~10-15 concurrent requests trước khi Prisma connection pool saturate. Upgrade trigger: khi p99 > 3s hoặc merchants > 500 → add async queue.

#### 2. Idempotency — Status-Based Pattern (không dùng `$transaction()`)

`$transaction()` không phù hợp vì giữ DB lock trong suốt Shopify API HTTP round-trip → deadlock dưới load. Pattern đúng:

```
1. INSERT ProcessedWebhook { idempotencyKey, status: 'PENDING' }
   → Nếu P2002 (duplicate key): return 200 (đã xử lý)
2. assertValidTransition(current, incoming)
3. CALL Shopify Admin API (markOrderPaid)
   → Nếu 4xx: UPDATE ProcessedWebhook { status: 'FAILED' }, return 200 (không retry)
   → Nếu 429/5xx: UPDATE ProcessedWebhook { status: 'FAILED' }, return 202 (Tingee retry)
   → Nếu success: UPDATE ProcessedWebhook { status: 'COMPLETED' }, return 200
```

#### 3. Shopify API Retry (phòng "ghost orders")

Nếu Shopify trả 429 và không có retry phía app → Tingee tiếp tục retry → vòng loop → orders Tingee báo paid nhưng Shopify vẫn pending ("ghost orders"). Required:

```
Shopify Admin API call: exponential backoff
  429/5xx: retry tối đa 3 lần, backoff 1s/3s/10s
  4xx khác: KHÔNG retry, mark FAILED ngay
```

#### 4. `/api/orders/:orderId/tingee-data` Response Schema

```typescript
// Success response
{
  qrImageUrl: string,       // URL đến PNG QR code (server-generated)
  deeplinkUrl: string,      // Tingee deeplink URL (mobile only)
  amount: number,           // Số tiền VND (integer)
  currency: 'VND',
  status: PaymentStatus,    // 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED'
  expiresAt: string,        // ISO 8601 UTC
  orderId: string
}

// Error response
{ "error": string, "code": string }
// Codes: ORDER_NOT_FOUND | TINGEE_UNAVAILABLE | INVALID_SESSION
```

#### 5. `/api/orders/:orderId/payment-status` Polling Contract

```typescript
// Response
{ status: PaymentStatus, paidAt?: string /* ISO 8601, chỉ có khi COMPLETED */ }

// Polling behavior (Extension)
Initial delay: 0ms (poll ngay khi mount)
Base interval: 5000ms
Backoff: sau 3 consecutive failures → 10s → 20s → 30s (cap)
Stop conditions: status COMPLETED | EXPIRED | FAILED, hoặc HTTP 4xx
Max silent failures trước khi show toast: 6
```

#### 6. Exact Amount Match — Tolerance

**Strict match:** `receivedAmount === expectedAmount` (integer VND, không có decimal).

Nếu amount mismatch → ghi Order Note "Tingee received {amount} VND, expected {expected} VND" + không mark paid + return 200. Merchant review thủ công. Không có epsilon tolerance — design decision đã được PM chấp nhận (trade-off của Static QR).

#### 7. `keyVersion` Decryption Pseudocode

```
// Encrypt khi lưu:
{ version: currentKeyVersion, iv, tag, data } = aes256Encrypt(plaintext, ENCRYPTION_KEY)
// Store JSON string vào MerchantCredential.encryptedSecretToken

// Decrypt khi đọc:
{ version, iv, tag, data } = JSON.parse(encryptedValue)
// Phase 1: version luôn = 1, dùng ENCRYPTION_KEY
// Phase 2 (rotation): lookup key by version từ ENCRYPTION_KEY_V{N} env vars
plaintext = aes256Decrypt(iv, tag, data, getKeyByVersion(version))
```

Key rotation Phase 1: single key, `keyVersion = 1`. Rotation runbook cần document trước merchant thứ 200 (thêm `ENCRYPTION_KEY_V2`, re-encrypt tất cả credentials, update `keyVersion`).

### CSS — `all: revert` Compatibility Fix

`all: revert` không support trên Chromium < 84 (phổ biến tại VN trên device tầm 2-3 triệu 2020-2021). Replace bằng explicit resets:

```css
[data-tng-extension] .tng-payment-container {
  box-sizing: border-box !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
  font-size: 16px !important;
  line-height: 1.5 !important;
  color: #111 !important;
  background: #fff !important;
  margin: 0 !important;
  padding: 16px !important;
}
[data-tng-extension] .tng-payment-container img {
  width: 200px !important; height: 200px !important;
  max-width: none !important; display: block !important;
}
```

### Static QR Expired UX — Clarification Required

**⚠️ Cần confirm với Tingee trước khi implement expired flow:**

Static QR không thay đổi khi re-fetched. Nếu refetch `/tingee-data` trả về cùng QR URL → đừng simulate "refresh". Behavior khi expired:

- Overlay trên QR: "Phiên thanh toán đã kết thúc"
- CTA button: "Quay lại cửa hàng" (redirect về cart/checkout)
- Không show spinner hay animate fake refresh

Nếu Tingee hỗ trợ tạo QR mới cho cùng order → update spec này sau khi confirm.

### Payment State Persistence (Re-mount Safety)

Extension component có thể re-mount bất ngờ do Shopify theme. `usePaymentStatus` phải rehydrate state từ `sessionStorage`:

```typescript
const STORAGE_KEY = `tng_payment_${orderId}`;
// On mount: read cached status nếu < 30s tuổi
// On status update: write to sessionStorage
// On terminal state (COMPLETED/EXPIRED): schedule cleanup sau 5 phút
```

30s window đủ để survive Shopify theme re-render cycle mà không stale.

### Deeplink Timeout — iOS vs Android

```typescript
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const DEEPLINK_TIMEOUT_MS = isIOS ? 3500 : 2000;

window.location.href = deeplinkUrl;
const fallbackTimer = setTimeout(showQRFallback, DEEPLINK_TIMEOUT_MS);

// Cancel fallback nếu user quay lại tab (đã mở app ngân hàng xong)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    clearTimeout(fallbackTimer);
    pollImmediately(); // poll ngay thay vì đợi interval
  }
}, { once: true });
```

### Fly Postgres Connection Pool — Corrected Config

```
connection_limit=5 per instance (không phải 10)
```
2 instances × 5 = 10 connections + overhead — an toàn trong Fly Postgres free tier (max 25 connections). Xem xét pgbouncer khi scale lên 3+ instances.

Verify `fly.toml` release command chạy **một lần per deploy** (không per-machine) để tránh race condition khi `fly scale count 2`.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (100 merchants, 0.7 webhook/phút)
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status: READY FOR IMPLEMENTATION**

**Confidence Level:** High

**Key Strengths:**
- Multi-tenancy guard rõ ràng và enforceable (`requireShopSession()` + shop param)
- Idempotency design solid (`transactionCode` confirmed từ live docs, status-based pattern)
- Security-first: HMAC verify trước mọi processing, `sanitizeForLog()` bắt buộc, AES-256 với keyVersion
- Test strategy không cần UAT (Pact + Testcontainers + capture/replay)
- App Store requirements covered (privacy page, GDPR x3, meaningful app home)
- Polling lifecycle fully specified (backoff, stop conditions, re-mount safety, deeplink fallback)

**Areas for Future Enhancement (Post-Phase 1):**
- Async queue (pg-boss) khi p99 Shopify API > 3s hoặc > 500 merchants
- Envelope encryption / KMS khi > 500 merchants
- Key rotation runbook trước merchant thứ 200
- `WebhookLog` model cho audit trail nếu cần production debugging
- `ApiResponse<T>` discriminated union khi API surface ổn định
- Phase 2: `paymentSessionModal` GraphQL mutation (cần Shopify Payments Partner status)

### Open Risks (Còn Lại)

| Risk | Priority | Action |
|---|---|---|
| Tingee webhook SLA chưa xác nhận | P0 | Lấy SLA document từ Tingee trước khi launch |
| Static QR behavior khi expired chưa confirm | P0 | Clarify với Tingee: QR có thay đổi không? |
| Shopify App Review timeline 2-4 tuần | Medium | Submit sớm, tính vào launch timeline |
| Key rotation runbook chưa có | P1 | Document trước merchant thứ 200 |

### Implementation Handoff

**AI Agent Guidelines:**
- Follow tất cả architectural decisions trong document này
- Mọi loader/action phải gọi `requireShopSession()` đầu tiên
- Mọi Prisma query phải include `shop_domain` / `merchant_id` filter
- Mọi log call phải qua `sanitizeForLog()` trước
- `authenticate.admin()` cho Admin routes, `authenticate.public.checkout()` cho Extension API — không được nhầm
- Tingee API: Production URL only, không có UAT/sandbox

**First Implementation Story:**
```bash
npm create @shopify/app@latest
# Chọn: "Build a React Router app"
shopify app generate extension --type checkout_ui_extension
# Sau scaffold: migrate Prisma SQLite → PostgreSQL
# Chạy post-scaffold checklist (6 items) trong architecture doc
```

---

## Project Structure & Boundaries

### Complete Project Directory Structure

```
ting-shop/
├── .github/
│   └── workflows/
│       └── ci.yml                          # vitest + pact verify + flyctl deploy
├── .env.example
├── .gitignore
├── fly.toml                                # release_command: npx prisma migrate deploy
├── package.json
├── tsconfig.json
├── shopify.app.toml                        # Scopes, extensions, app config
│
├── prisma/
│   ├── schema.prisma                       # Merchant, MerchantCredential, Payment, ProcessedWebhook
│   └── migrations/
│
├── app/
│   ├── root.tsx                            # App shell, Polaris AppProvider
│   ├── entry.server.tsx
│   ├── shopify.server.ts                   # Shopify OAuth constant (starter-generated, không sửa)
│   │
│   ├── routes/
│   │   ├── auth.tsx                        # OAuth entry
│   │   ├── auth.$.tsx                      # OAuth callback
│   │   ├── app.tsx                         # Admin layout + Getting Started hub (meaningful content)
│   │   ├── app.settings.tsx                # Credential form + connection status
│   │   ├── app.settings.test.ts
│   │   ├── app.privacy.tsx                 # Privacy Policy page (bắt buộc — App Store review)
│   │   ├── webhooks.tsx                    # Shopify: APP_UNINSTALLED + GDPR x3 (customers/data_request, customers/redact, shop/redact)
│   │   ├── webhooks.tingee.tsx             # Tingee IPN webhook (HMAC → idempotency → state machine → Shopify)
│   │   ├── webhooks.tingee.test.ts
│   │   ├── api.orders.$orderId.tingee-data.tsx     # GET — initial load (QR + Deeplink + expiresAt)
│   │   └── api.orders.$orderId.payment-status.tsx  # GET — polling (PENDING/COMPLETED/EXPIRED)
│   │
│   ├── lib/                                # Pure utilities — không biết Shopify/Tingee domain
│   │   ├── auth.server.ts                  # requireShopSession() — chỉ extract/validate session, KHÔNG query DB
│   │   ├── encryption.server.ts            # AES-256 encrypt/decrypt (generic, không biết về credentials)
│   │   ├── hmac.server.ts                  # HMAC-SHA512 verify utility
│   │   ├── idempotency.server.ts           # ProcessedWebhook check-before-insert logic
│   │   ├── env.server.ts                   # Zod env validation, fail-fast
│   │   ├── errors.ts                       # TingeeWebhookError (retryable flag)
│   │   ├── logger.server.ts                # sanitizeForLog(), Sentry wrapper
│   │   ├── paymentStateMachine.ts          # PaymentStatus type + assertValidTransition()
│   │   └── rateLimit.server.ts             # Rate limit middleware (100 req/15min per IP)
│   │
│   ├── services/                           # Business logic — biết Tingee + Shopify domain
│   │   ├── credential.server.ts            # Save/load/validate MerchantCredential (AES-256 via lib/encryption)
│   │   ├── tingee.server.ts                # @tingee/sdk-node wrapper — CHỈ HTTP calls, không business logic
│   │   ├── payment.server.ts               # Orchestration: DB → tingee → state update → Shopify
│   │   └── order.server.ts                 # Shopify GraphQL: registerPaymentMethod, markOrderPaid
│   │                                       # (tên rõ ràng, phân biệt với starter shopify.server.ts)
│   └── components/
│       └── CredentialForm.tsx              # Client ID + Secret Token form + connection status indicator
│
├── extensions/
│   └── order-status-ui/
│       ├── shopify.extension.toml
│       └── src/
│           ├── index.tsx                   # Extension entry point
│           ├── api/
│           │   └── client.ts               # Thin fetch wrapper cho /api/orders/* endpoints
│           ├── components/
│           │   ├── PaymentCard.tsx         # Container
│           │   ├── QRDisplay.tsx           # <img> wrapper + QR refresh trigger khi expired
│           │   ├── DeeplinkButton.tsx      # Mobile-only CTA + openDeeplink() với QR fallback
│           │   ├── StatusBadge.tsx         # PENDING / COMPLETED / EXPIRED / FAILED
│           │   └── CountdownTimer.tsx      # Monospace, 15-min countdown, trigger expired state
│           ├── hooks/
│           │   ├── usePaymentStatus.ts     # Polling + backoff + cleanup + AbortController
│           │   └── useMobileDetect.ts      # 2/3 signal voting (touch + screen + UA)
│           └── utils/
│               ├── constants.ts            # EXPIRED_TIMEOUT_MS, POLL_INTERVAL_MS, POLL_MAX_INTERVAL_MS
│               └── deeplink.ts             # openDeeplink() + 2s timeout fallback → showQRFallback()
│
└── test/
    ├── helpers/
    │   ├── shopify-session.ts              # Mock Shopify session fixture
    │   ├── tingee-webhook.ts               # Factory: valid/invalid Tingee webhook payloads
    │   ├── crypto.ts                       # Generate valid/invalid HMAC-SHA512 signatures
    │   ├── encryption.ts                   # Encrypt/decrypt test credentials helper
    │   └── db.ts                           # Testcontainers PostgreSQL setup/teardown + transaction helpers
    └── contracts/
        ├── tingee-webhook.pact.ts          # Pact consumer: webhook payload schema
        └── tingee-api.pact.ts              # Pact consumer: QR/Deeplink API schema
```

### Prisma Schema — Models

| Model | Purpose |
|---|---|
| `Merchant` | shopDomain, installedAt, uninstalledAt |
| `MerchantCredential` | encryptedClientId, encryptedSecretToken, keyVersion, merchantId FK |
| `Payment` | orderId, shopDomain, status (PaymentStatus), qrImageUrl, deeplinkUrl, amount, expiresAt |
| `ProcessedWebhook` | idempotencyKey (unique), shopDomain, topic, processedAt, statusCode, payloadHash |

`MerchantCredential` tách riêng khỏi `Merchant` để support key rotation (keyVersion field) và separation of concerns.

`WebhookLog` **không** tạo Phase 1 — `ProcessedWebhook` đủ cho idempotency; audit trail dùng Sentry + Fly logs.

### Architectural Boundaries

**Auth boundaries (không được nhầm):**
- Admin routes: `authenticate.admin()` — Shopify embedded session
- Extension API (`/api/orders/*`): `authenticate.public.checkout()` — khác hoàn toàn
- Tingee webhook: HMAC-SHA512 header verify — không dùng Shopify session

**`lib/` vs `services/` rule (1 câu):**
> "File này có thể copy sang project không liên quan đến Tingee mà vẫn dùng được không?" → Có: `lib/`. Không: `services/`.

**`tingee.server.ts` vs `payment.server.ts` (comment đầu file):**
- `tingee.server.ts` — chỉ HTTP client calls đến Tingee API. Zero business logic.
- `payment.server.ts` — chỉ orchestration: đọc DB → gọi tingee → update state → gọi Shopify.

### Requirements → Files Mapping

| FR | File(s) |
|---|---|
| FR-1: OAuth install | `routes/auth.tsx`, `routes/auth.$.tsx` |
| FR-2: Uninstall + GDPR (3 webhooks) | `routes/webhooks.tsx` |
| FR-3: Credential input | `routes/app.settings.tsx`, `components/CredentialForm.tsx` |
| FR-4: Credential validate + connection status | `services/credential.server.ts`, `services/tingee.server.ts` |
| FR-5: Register payment method | `services/order.server.ts` |
| FR-6: QR display | `extensions/.../QRDisplay.tsx`, `api.orders.*.tingee-data.tsx` |
| FR-7: Deeplink (mobile) | `extensions/.../DeeplinkButton.tsx`, `hooks/useMobileDetect.ts` |
| FR-8: Polling | `hooks/usePaymentStatus.ts`, `api.orders.*.payment-status.tsx` |
| FR-9: Countdown | `CountdownTimer.tsx`, `utils/constants.ts` |
| FR-10: Expired + refresh | `QRDisplay.tsx` (refresh trigger), `usePaymentStatus.ts` |
| FR-11: HMAC validate | `lib/hmac.server.ts`, `routes/webhooks.tingee.tsx` |
| FR-12: Exact Amount Match | `services/payment.server.ts` |
| FR-13: Idempotency (5 retries) | `lib/idempotency.server.ts`, `prisma/schema.prisma` ProcessedWebhook |
| FR-14: Mark order paid | `services/order.server.ts` |
| App Store required | `routes/app.privacy.tsx`, `routes/app.tsx` (meaningful content) |

### Integration Points

**Data Flow — Payment Happy Path:**
```
Buyer checkout → Shopify Order created
  → Extension mounts → api/client.ts → GET /api/orders/:orderId/tingee-data
    → payment.server.ts → tingee.server.ts → Tingee API (QR + Deeplink)
    → Response: { qrImageUrl, deeplinkUrl, amount, expiresAt, status: PENDING }
  → Buyer quét QR → Tingee processes payment
  → POST /webhooks/tingee (IPN, up to 5 retries)
    → lib/hmac.server.ts verify
    → lib/idempotency.server.ts check (transactionCode key)
    → paymentStateMachine assertValidTransition(PENDING → PROCESSING)
    → services/order.server.ts markOrderPaid()
    → paymentStateMachine assertValidTransition(PROCESSING → SUCCESS)
    → Return 200
  → usePaymentStatus.ts poll → GET /payment-status → { status: COMPLETED }
  → Stop polling, show success UI
```

**External Services:**

| Service | Direction | Module |
|---|---|---|
| Tingee API (Production only) | Outbound | `services/tingee.server.ts` |
| Shopify GraphQL Admin API | Outbound | `services/order.server.ts` |
| Shopify Webhook (inbound) | Inbound | `routes/webhooks.tsx` |
| Tingee IPN (inbound) | Inbound | `routes/webhooks.tingee.tsx` |
| Sentry | Outbound | `lib/logger.server.ts` |
| Fly Postgres | Internal | Prisma client (all services) |

---

## Implementation Patterns & Consistency Rules

### Naming Conventions

**Database (Prisma → PostgreSQL):**
- Prisma model fields: `camelCase`
- PostgreSQL columns: `snake_case` via `@map("snake_case")`
- Table names: `snake_case` via `@@map("table_name")`
- Convention: `id String @id @default(cuid())` — không dùng `autoincrement()`

**API Routes:**
- Pattern: plural nouns, camelCase params — `/api/orders/:orderId/payment-status`
- HTTP verbs: `GET` cho read, `POST` cho action (tạo payment request)
- Error response format chuẩn: `{ "error": "string", "code": "string" }`

**Files & Modules:**
- Server-only files: suffix `*.server.ts` — không import ở client
- React Router routes: dot-notation `app.settings.tsx` → `/app/settings`
- Co-located tests: `webhook.server.test.ts` bên cạnh `webhook.server.ts`
- Constants: `SCREAMING_SNAKE_CASE` (e.g. `EXPIRED_TIMEOUT_MS`)
- Enum values: `PascalCase` (e.g. `PaymentStatus.PENDING`)

**`lib/` vs `services/` — một rule:**
> "File này có thể copy sang project không liên quan đến Tingee mà vẫn dùng được không?" → Có: `lib/`. Không: `services/`.

Ví dụ: `lib/hmac.ts` (pure crypto), `lib/encryption.ts` (AES-256 wrapper) vs `services/tingee.ts` (biết về `transactionCode`), `services/payment.ts` (orchestrate Shopify + Tingee).

### Multi-Tenancy Guard

```typescript
// app/lib/auth.server.ts
export async function requireShopSession(request: Request) {
  const { admin, session } = await authenticate.admin(request);
  if (!session?.shop) throw redirect("/auth");
  return { admin, session, shop: session.shop };
}
```

**Convention bắt buộc:** Mọi loader/action trong `app/routes/` gọi `requireShopSession()` đầu tiên. `shop` string truyền xuống service qua function parameter — không dùng global, không dùng DI container. Mọi Prisma query sau đó include `WHERE merchant_id/shop_domain = ?`. Enforce qua code review checklist.

### Payment State Machine

```typescript
// app/lib/paymentStateMachine.ts
export type PaymentStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "EXPIRED";

const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING:    ["PROCESSING", "EXPIRED"],
  PROCESSING: ["SUCCESS", "FAILED"],
  SUCCESS: [], FAILED: [], EXPIRED: [], // terminal states
};

export function assertValidTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!VALID_TRANSITIONS[from].includes(to))
    throw new Error(`Invalid transition: ${from} → ${to}`);
}
```

Gọi trong webhook handler trước khi update DB. Nếu throw (out-of-order webhook) → log + return 200 (idempotency, Tingee không cần retry).

### Logging & Sensitive Data

```typescript
// app/lib/logger.server.ts
const SENSITIVE_KEYS = new Set(["secretToken", "accessToken", "webhookSecret"]);

export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, SENSITIVE_KEYS.has(k) ? "[REDACTED]" : v])
  );
}
```

Shallow sanitize — đủ cho Phase 1. Gọi trước mọi `logger.error()` hoặc Sentry capture.

### Error Handling

```typescript
// app/lib/errors.ts
export class TingeeWebhookError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "TingeeWebhookError";
  }
}
```

Webhook handler catch pattern:
- `retryable: true` → return 202 (Tingee sẽ retry)
- `retryable: false` → log với `sanitizeForLog()` + return 200 (tránh bị spam retry)
- Standard `Error` cho mọi trường hợp khác

_TODO P1: Define `ApiResponse<T>` discriminated union khi API surface ổn định._

### Buyer Surface (Order Status Extension)

**CSS Isolation:**
- Strategy: BEM prefix `tng-` + specificity shield (không dùng Shadow DOM — Shopify Extension không cho own shadow root)
- Pattern:
```css
[data-tng-extension] .tng-payment-container {
  all: revert; /* cắt đứt inheritance từ merchant theme */
  /* define lại từ đầu */
}
.tng-payment-container__qr-code { }
.tng-payment-container__deeplink-btn { }
.tng-payment-container--expired { }
```
- Không dùng `!important` — tạo debt và conflict với merchant theme cũng dùng `!important`

**Smart Polling Backoff:**
```
Interval schedule:   5s → 5s → 5s → 10s → 20s → 30s (cap)
Trigger backoff:     Sau 3 consecutive failures
HTTP 4xx:            STOP ngay (401/404 = không có gì để poll)
HTTP 5xx:            Count as failure, backoff
COMPLETED/EXPIRED:   Stop polling (terminal state)
Fail 6+:             Toast nhỏ "Đang kiểm tra kết nối..."
Constant:            EXPIRED_TIMEOUT_MS = 15 * 60 * 1000
```

Cleanup bắt buộc: `clearTimeout` trong `useEffect` cleanup — Shopify Extension có thể unmount component mà không notify rõ ràng.

**Mobile Detection (Deeplink):**
```typescript
const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const isSmallScreen = window.innerWidth < 768;
const isMobileUA = navigator.userAgentData?.mobile ?? /Mobi|Android/i.test(navigator.userAgent);
const isMobile = [isTouchDevice, isSmallScreen, isMobileUA].filter(Boolean).length >= 2;
```
2/3 signal voting — handles Cốc Cốc/UC Browser (phổ biến tại VN), iPad Pro, Samsung DeX.

**Deeplink Fail Fallback (quan trọng cho VN market):**
```typescript
window.location.href = deeplinkUrl;
setTimeout(() => { if (/* still on page */) showQRFallback(); }, 2000);
```
Khi user chưa cài app ngân hàng, browser bị treo — phải fallback về QR thay vì để user stuck.
