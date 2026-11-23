# Cloudflare deploy

Một Cloudflare Worker `chiakeo` chạy Hono từ `backend/src/index.ts` và phục
vụ bản Vite build trong `dist/`. Production dùng Turso/libSQL; local và E2E
sử dụng D1. Xem [kiến trúc](architecture.md) và [hợp đồng API](openapi.md).

## Routing và bindings

Nguồn cấu hình là `wrangler.toml`:

- `run_worker_first = ["/api/*", "/share/*"]`: API và metadata share đi qua
  Worker; phần còn lại dùng static assets với SPA fallback.
- `workers_dev = false`: truy cập qua custom domain `chiakeo.huyab.cfd`.
- `DB`: binding D1 dự phòng/local; `MAILER`: service binding tới Worker mailer.
- `nodejs_compat`: hỗ trợ các Node built-ins mà dependency cần.

## Deploy

Workers Builds kết nối repo `nguyenhuy158/chiakeo`, nhánh production `main`.
Merge PR sau khi Check và E2E đạt; Workers Builds tự build và deploy.
Không deploy từ máy local. Lệnh build của repo là `pnpm build`; cấu hình
Builds trên Cloudflare là nguồn xác định lệnh đang chạy thực tế.

`scripts/build-info.mjs` lấy commit từ `WORKERS_CI_COMMIT_SHA` và nhánh từ
`WORKERS_CI_BRANCH`. Sau deploy, đối chiếu commit và sức khỏe DB:

```sh
curl -fsS https://chiakeo.huyab.cfd/api/version
curl -fsS https://chiakeo.huyab.cfd/api/health
```

CI xanh chưa chứng minh production chạy commit mới. Health kiểm bảng user
và các cột ngày chơi trên chính DB do `createDb` chọn.

## Cấu hình nhạy cảm

Chỉ tham chiếu tên; không đưa giá trị vào Git, log hay tài liệu:

- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`: chọn và truy cập Turso production.
- `BETTER_AUTH_SECRET`: session Better Auth và mã hóa device flow.
- `MAILER_KEY`: xác thực service mailer.
- `GEMINI_API_KEY`: AI/OCR tùy chọn; `SEPAY_API`: thanh toán tùy chọn.

`BETTER_AUTH_URL`, `ALLOWED_ORIGINS`, `GEMINI_MODEL`, `SEPAY_API_BASE` được
khai báo trong `backend/src/env.ts`; xem `wrangler.toml` cho giá trị mặc định
đã cấu hình. Google đăng nhập qua SSO chung `auth.huyab.cfd`; app không giữ
OAuth client Google riêng.

## Migration

Schema: `backend/src/adapters/d1/schema.ts`. Migrations: `drizzle-shared/`.

- Local D1: `pnpm db:migrate:local` chạy Wrangler với `--local`.
- Production Turso: `.github/workflows/migrate.yml` chạy khi các file
  migration/config liên quan lên main, sử dụng repo secrets `TURSO_*` rồi
  gọi `pnpm db:migrate:remote` (`drizzle-kit migrate`).
- Chỉ chạy migration thủ công khi workflow hỏng và đã kiểm đúng DB/quyền.
  `wrangler d1 migrations apply --remote` không migrate Turso.

Pipeline deploy và migration độc lập. Ship thay đổi additive trước, kiểm
migration thành công, rồi ship code dùng cột/bảng mới. Rollback code giữ
schema additive; không drop dữ liệu. Không áp `drizzle/` hoặc `migrations/`
lịch sử lên DB chung. D1 giữ lại không tự đồng bộ dữ liệu từ Turso; không
xóa secrets Turso để rollback mà chưa kiểm độ mới của dữ liệu và phê duyệt.
