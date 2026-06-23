
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
