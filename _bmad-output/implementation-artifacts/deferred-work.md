
## Deferred from: code review of 3-3-shopify-order-update-retry-mechanism-and-monitoring (2026-06-30)

- Stale admin session after 14s retry window: `unauthenticated.admin(shopDomain)` called once before retry loop; session may expire during backoffs (1s+3s+10s); retry with stale token will fail — revisit when hardening auth boundary
- RETRY_DELAYS_MS array not bounds-checked against MAX_ATTEMPTS: if MAX_ATTEMPTS is ever increased beyond 4 without extending RETRY_DELAYS_MS, setTimeout fires with undefined (0ms delay) — add guard if constants ever change
- reconcileWebhookPayment throw before amount_matched dispatch not caught: if payment.server.ts throws (DB failure after inserting idempotency record), route returns 500 and Tingee retries — subsequent retry hits P2002 duplicate path and skips; payment stuck permanently
- updateIdempotencyStatus failure in success path leaves ProcessedWebhook stuck in AWAITING_MARK_PAID: best-effort design accepted per Prior Story Learnings; no alerting path for stuck records — add monitoring query when observability tooling is in place

## Deferred from: code review of 3-2-payment-reconciliation-and-idempotency (2026-06-29)

- Race condition: two different transactionCodes for the same order can both pass idempotency guard and both update Payment PENDING → PROCESSING — requires DB-level atomic compare-and-swap (`UPDATE payments SET status='PROCESSING' WHERE id=? AND status='PENDING'` with row-count check); architectural gap, fix when hardening concurrent webhook delivery
- Sentry not integrated: AC#2 and AC#5 specify Sentry logging for invalid_transition and no_payment_found; currently uses console.warn/error with TODO comments; requires adding @sentry/node to the project

## Deferred from: code review of 3-1-tingee-webhook-endpoint-and-hmac-validation (2026-06-29)

- Rate limiter trusts attacker-controlled `x-forwarded-for` — pre-existing pattern matching `pollingRateLimiter`; revisit when hardening auth boundary or adding IP allowlist for Tingee egress
- "unknown" shared rate bucket collapses all proxy-less requests — deployment concern; ensure Fly.io always sets `x-forwarded-for` or fall back to `cf-connecting-ip`/`x-real-ip`
- Shop-existence timing oracle via credential lookup latency — `getDecryptedCredential` is called before HMAC verify; both 400 paths return same status but DB latency distinguishes them; revisit if enumeration becomes a concern
- Test coverage gap for h<7 timestamps (midnight–06:59 UTC+7) — `parseTimestampUTC` math is correct (Date.UTC handles negative hours by rolling to previous day); add boundary test when time permits
- `parseTimestampUTC` weak non-digit input handling — mixed-digit timestamps of correct length (e.g. "2026AB29143052123") produce wrong-but-safe epochs via parseInt NaN chain; code reaches correct `false` outcome via accidental path; add explicit digit-only validation if Tingee timestamp format is ever loosened

## Deferred from: code review of 2-5-real-time-polling-status-updates-and-offline-resilience (2026-06-26)

- No maximum retry count or wall-clock timeout for permanently PENDING orders — polling backs off to 30s but never stops; `EXPIRED_TIMEOUT_MS` constant exists in constants.ts but unused by hook
- `readCache` called twice during hook init (duplicate sessionStorage read + JSON.parse for `status` and `paidAt` state initializers)
- `writeCache` silently swallows all errors — sessionStorage quota or block failures are unobservable
- Backoff test timing assertions hardcode interval values instead of importing `POLL_INTERVAL_MS`/`BACKOFF_STEPS` constants — test semantics break silently if constants change
- `aria-live="polite"` applied to all `StatusBadge` instances including static terminal-state badges — screen readers announce static content unnecessarily on mount; scope Story 2.6
- URL encoding inconsistency — `fetchPaymentStatus` uses `encodeURIComponent(orderId)` but prior `fetchTingeeData` URL construction not in diff; investigate if orderId can contain special chars
- Shopify `gid://shopify/Order/...` orderId format written raw to sessionStorage key `tng_payment_{orderId}` — potential key collision if callers encode/decode orderId differently
- `financialStatus === "PAID"` bypass in PaymentCard may flicker — shows COMPLETED badge during loading then switches to PENDING/QR if Tingee disagrees; pre-existing behavior from Story 2.4
- `consecutiveFailuresRef` not reset on visibility hide/show cycle — toast threshold fires sooner after tab restore if failures were already accumulating before hide
- `fetchPaymentStatus` calls `response.json()` on 2xx without guarding empty body — proxy edge case could produce SyntaxError and trigger backoff path; backend spec guarantees JSON
- `SESSION_CACHE_TTL_MS = 30s` may be too short — completed payment status re-fetched from server after 30s; consider using Infinity TTL for terminal states

## Deferred from: code review of 2-4-qr-display-deeplink-button-and-mobile-detection (2026-06-26)

- `useMobileDetect` không subscribe `resize`/`orientationchange` — isMobile value không cập nhật khi user xoay màn hình; cần thêm event listener + cleanup trong useEffect
- `window.location.href` deeplink trong iframe embedded context — custom-scheme URL assignment có thể bị block trong một số browser/WebView khi chạy trong iframe; fallback timer sẽ kích hoạt nhưng initial deeplink navigation có thể fail silently; cần test thực tế trong Shopify customer-account extension iframe

## Deferred from: code review of 2-3-order-status-extension-foundation-and-loading-state (2026-06-25)

- No polling — `POLL_INTERVAL_MS` constant defined but never used; payment status never updates after initial fetch. Story 2.5 (real-time polling) sẽ implement setInterval + clearInterval pattern
- QR expiry không enforce client-side — `expiresAt` field received but never checked; expired QR displayed without feedback. Story 2.5-2.6 (countdown timer, expiry state)
- No fetch timeout / retry — `fetchTingeeData` hangs indefinitely on slow/offline network; skeleton renders forever. Story 2.5 (offline resilience) sẽ xử lý với AbortController + backoff
- DEEPLINK constants (`DEEPLINK_TIMEOUT_IOS_MS`, `DEEPLINK_TIMEOUT_ANDROID_MS`) unused — defined in constants.ts but no deeplink logic yet. Story 2.4 sẽ implement deeplink button + mobile detection
- `tWithArgs` exported but unused — `qrAltText` function key exists in i18n.ts but PaymentCard.tsx uses hardcoded template instead. Story 2.4/2.5 sẽ dùng đúng
- `parseFloat` NaN nếu `order.totalPrice.amount` không phải numeric string — Shopify API đảm bảo numeric string; edge case lý thuyết không xảy ra trong practice
- `amount=0` gọi Tingee API với zero amount — Tingee API behavior cho zero amount không xác định; separate concern ngoài scope
- `qrImageUrl` null/absent trong PENDING state ẩn QR section không có giải thích cho user — edge case khi backend trả partial response; ngoài scope story 2.3

## Deferred from: code review of 2-2-payment-status-polling-endpoint (2026-06-25)

- In-memory rate limiter resets on server restart — by design for single-instance pilot; revisit when scaling beyond single instance
- `dest.replace("https://", "")` fragile (no `.myshopify.com` validation, no URL parsing) — inherited from Story 2.1, systemic; fix when hardening auth boundary
- `paidAt` sourced from `updatedAt` can shift if Payment row is updated after SUCCESS — schema frozen in Story 1.1; revisit with a dedicated `succeededAt` column migration
- No `Cache-Control` or `Retry-After` hints on 200 polling responses — belongs to Story 2.5 (real-time polling & offline resilience)
- `expiresAt < new Date()` uses non-injectable wall clock — minor test robustness concern, not a production bug; low priority
- `authenticate.public.checkout` throws not caught — Shopify SDK handles auth errors; consistent with established codebase pattern

## Deferred from: code review of 2-1-tingee-service-interface-and-payment-data-api (2026-06-24)

- Ba `TingeeClient` instances per request: `getMerchantAccountInfo`, `generateQR`, `generateDeeplink` mỗi hàm tạo TingeeClient riêng — optimization để refactor sang shared client, không phải bug
- `(client as any)` casts: SDK chưa export typed method signatures cho `bank.generateVietQr`, `deepLink.generate`, `merchant.getPaging`, `bank.getVaPaging` — deferred cho khi SDK nâng cấp types
- VA pagination giới hạn 10 records: `maxResultCount: 10` không có stable ordering, active VA có thể nằm ngoài page đầu — cần investigate Tingee API pagination contract
- `TINGEE_SDK_TIMEOUT_MS` type coercion: env var có thể là string nếu `env.server.ts` không parse sang number — fix trong env.server.ts scope
- `merchantId` assumed number type: `const merchantId: number = merchantResult.data.items[0].id` — nếu Tingee API trả string thì TypeScript cast không coerce, cần `Number(...)` — deferred khi có API spec
- `content` field duplication: `generateQR` tự build `` `TINGEE ${params.orderNumber}` ``, caller cũng build để pass vào `generateDeeplink` — cosmetic, không ảnh hưởng correctness
- AC1 `verifyWebhookHMAC` stub intact: cần verify manually trong full `tingee.server.ts` file (ngoài diff scope) rằng stub không bị xóa hay restructure

## Deferred from: code review of 1-6-app-uninstall-and-gdpr-compliance (2026-06-23)

- APP_UNINSTALLED partial failure acceptable: nếu `deleteCredential` hoặc `session.deleteMany` throw sau `updateMany`, merchant được mark uninstalled nhưng credential/session còn lại — GDPR 48h window xử lý; Shopify không retry webhook này
- unregisterPaymentMethod failure swallowed: nếu Shopify đã revoke token trước khi webhook fire, unregister sẽ throw 401 → logged + swallowed; payment gateway có thể còn hiển thị trong Shopify admin cho đến khi cleanup thủ công
- Race condition concurrent app/uninstalled deliveries: Shopify có thể deliver duplicate — hai concurrent requests đều pass `session?.accessToken` check trước khi session bị xóa; `unregisterPaymentMethod` gọi 2 lần → lần 2 có thể 404; `deleteMany` calls idempotent nên DB OK
- unregisterPaymentMethod không treat 404 DELETE là "already gone": order.server.ts throw khi DELETE 404 — nếu gateway đã bị xóa bởi concurrent request, lần 2 log spurious error
- unregisterPaymentMethod không handle non-JSON response: `listRes.json()` không wrap try/catch — malformed Shopify response propagates as SyntaxError
- Merchant row không tồn tại khi uninstall: `updateMany` silently returns count:0; không có warning log — acceptable by design
- AC2 empty response body: Shopify data_request webhook chỉ cần 200 ACK; body không bắt buộc per Shopify docs

## Deferred from: code review of 1-5-credential-update-and-deletion (2026-06-23)

- session.shop vs shop inconsistency: unregisterPaymentMethod gọi session.shop, deleteCredential gọi shop — functionally equivalent nhưng lệch pattern codebase
- CSRF không có secondary guard trên delete action: Shopify session cookie mitigate; không có idempotency key hay re-auth bổ sung
- AbortSignal.timeout không có trên Node.js < 17.3: pattern pre-existing từ registerPaymentMethod, cần confirm Node runtime version
- Gateway name exact-match có thể miss nếu Shopify normalize Unicode hoặc merchant đổi tên gateway trong admin: unregisterPaymentMethod skip silently → credential bị xóa nhưng gateway còn lại
- localHasCredential không sync khi parent re-render với prop mới: useState(hasCredential) chỉ dùng prop làm initial value — pattern pre-existing
- Error Banner tone "critical" chưa verify trực tiếp trong diff: errorMessage được pass vào Banner pre-existing, tone prop không đổi trong story này

## Deferred from: code review of 1-4-credential-validation-encryption-and-payment-method-registration (2026-06-23)

- AC2 integration test (Testcontainers): Chưa viết test thực sự connect DB để assert encryptedSecretToken là ciphertext — đánh dấu optional Task 10, cần @testcontainers/postgresql setup
- Race condition duplicate gateway: Hai concurrent saves từ cùng shop đều read isFirstSave=true → registerPaymentMethod gọi 2 lần → Shopify tạo 2 payment gateway trùng tên. Cần per-shop mutex hoặc check existing gateways trước khi POST
- decrypt không validate version field: Nếu có key rotation sau này và version 2 payload được load, decrypt version-1 logic sẽ chạy sai. Cần thêm version check và throw nếu không biết version
- decrypt không wrap JSON.parse: Nếu DB bị corrupt và cipherJson không phải JSON hợp lệ, sẽ throw SyntaxError raw không có domain context. Nên wrap trong try/catch với message có ý nghĩa
- sanitizeForLog chỉ shallow-redact: Nested objects với sensitive keys (e.g., { context: { secretToken: "abc" } }) không được redact. Hiện tại không có caller nào pass nested sensitive objects nhưng nên document
- registerPaymentMethod embeds raw Shopify error body vào Error.message: Có thể chứa Shopify metadata/HTML. Nên truncate hoặc chỉ log status code

## Deferred from: code review of 1-3-admin-settings-ui-credential-form (2026-06-23)

- AC7 error states chưa implement trong CredentialForm — TextField chưa có `error` prop hoặc error state management; thuộc phạm vi Story 1.4 khi có save action
- Không có `ErrorBoundary` trên `app.settings.tsx` — `boundary.headers` không pair với `boundary.error`; DB failure propagates lên parent boundary mà không có context cụ thể
- Không có max-length validation trên Client ID / Secret Token fields — defer sang Story 1.4 khi implement save action
- `clientId`/`secretToken` trim khi check disabled nhưng sẽ submit raw — fix khi Story 1.4 thêm action
- Non-Response error branch trong `requireShopSession` không được test — silent redirect to /auth có thể mask real failures

## Deferred from: code review of 1-2-shopify-oauth-app-installation (2026-06-22)

- Race condition khi concurrent installs cùng shop: cả hai request có thể đọc "không có row" và cùng INSERT → unique constraint violation. Cần xử lý `P2002` hoặc dùng raw upsert query
- Upsert ghi `UPDATE uninstalledAt = null` trên mọi request authenticated, không chỉ khi reinstall — unnecessary write load ở scale cao
- DB failure trong `app.tsx` loader không được xử lý hay log — Prisma error propagates đến `boundary.error()` nhưng không có alert path

## Deferred from: code review of 1-1-app-scaffold-database-schema-and-cicd-foundation (2026-06-22)

- application_url/redirect_urls = https://example.com trong shopify.app.toml — scaffold placeholder, Shopify CLI tự cập nhật khi deploy thực tế
- entry.server.tsx: onError mutates responseStatusCode sau resolve() — scaffolded template code từ React Router 7, ngoài scope story này
- entry.server.tsx: setTimeout abort không gọi reject() — scaffolded template code
- Payment không có FK đến Merchant (dùng shopDomain string) — intentional per Dev Notes và architecture doc
- Payment.expiresAt không có DB-level check constraint — enforcement dự kiến ở Epic 2 application logic
- env.server.ts process.exit(1) at module eval — đã được workaround trong tests bằng cách không import module
- CI test job thiếu DATABASE_URL/Postgres service — test hiện tại tránh import env.server.ts; cần xem xét khi story sau thêm integration tests
- ProcessedWebhook.processedAt ghi lúc tạo row, không phải lúc xử lý xong — semantic concern, giải quyết ở Epic 3
- fly.toml: migration deploy trước khi old machines dừng — backward-compat concern cho future migrations, không ảnh hưởng init migration
- container/prisma singletons trong test/helpers/db.ts — vấn đề chỉ xảy ra khi parallel workers, không phải default vitest config
- automatically_update_urls_on_dev=true + include_config_on_deploy=true — standard Shopify template behavior

## Deferred from: code review of 2-6-countdown-timer-and-qr-expiry-state (2026-06-28)

- Hard-coded URLs `/pages/contact` và `/` có thể 404 trên non-standard Shopify URL config (PaymentCard.tsx) — Phase 1 acceptable per Dev Notes; cần dynamic shopUrl prop khi Extension nhận thêm props
- >99min expiresAt gây 3+ chữ số phút trong CountdownTimer MM:SS format (CountdownTimer.tsx:14) — không applicable với 15-min QR, nhưng cần cap nếu hook được tái sử dụng
- CSS `line-height: 44px` break khi text wrap trên viewport hẹp (PaymentCard.css) — label text đủ ngắn hiện tại; fix nếu bổ sung locales với string dài hơn
