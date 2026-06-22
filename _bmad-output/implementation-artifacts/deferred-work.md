
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
