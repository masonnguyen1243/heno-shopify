
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
