# Kiến trúc

Project dùng hexagonal architecture (ports & adapters) cho cả frontend và
worker, với một domain kernel dùng chung ở `shared/`. Mục tiêu: thay được từng
mảnh (DB, AI provider, QR provider, HTTP client) bằng cách viết một adapter
mới, không đụng vào business logic.

```text
shared/                      # Domain kernel dùng chung FE + worker (thuần, không IO)
  split.ts                   #   Rule chia tiền, balance, settlement, computeSplitRows
  schemas.ts                 #   Zod schema input + hằng số domain
  ai.ts                      #   Chuẩn hóa/resolve gợi ý AI (thuần)
  api-types.ts               #   DTO trao đổi giữa FE và worker
  rate-limit.ts              #   Logic rate limit thuần

frontend/src/                         # Hexagon frontend
  core/
    domain/money.ts          #   Format/parse VND
    ports/game-api.ts        #   Port gọi backend
    ports/qr-provider.ts     #   Port sinh QR chuyển khoản
    container.ts             #   DI tối giản: provide*/get* cho từng port
  adapters/
    browser/http-game-api.ts #   Adapter fetch cho GameApiPort
    browser/vietqr.ts        #   Adapter VietQR cho QrProviderPort
    browser/auth-client.ts   #   Better Auth client (dùng trực tiếp ở UI)
    browser/theme.ts         #   localStorage + matchMedia cho theme
    react-query/queries.ts   #   Hook React Query bọc GameApiPort (driving adapter)
  components/, routes/       #   Presentation
  main.tsx                   #   Composition root: cắm adapter vào port

backend/src/                  # Hexagon backend
  core/
    ports/game-repository.ts #   Port lưu trữ (row types + interface)
    ports/ai-provider.ts     #   Port model AI sinh JSON
    application/             #   Use case + policy (ownership, realloc, transfer...)
      errors.ts              #     NotFound/InvalidInput/AiProvider error
      game-detail.ts         #     Assembly ApiGameDetail + summary
      games.ts, participants.ts, expenses.ts, share-links.ts, ai-suggestions.ts
  adapters/
    d1/schema.ts             #   Drizzle schema (nguồn cho drizzle-kit)
    d1/game-repository.ts    #   Adapter Drizzle cho Turso/libSQL và D1
    gemini/gemini.ts         #   Adapter Gemini cho AiProvider
  routes/                    #   Driving adapter HTTP (Hono): parse -> use case -> JSON
  lib/                       #   Hạ tầng nhỏ: http helper, ids, require-user, rate limit
  auth.ts, env.ts, index.ts  #   Better Auth, kiểu Env, app + middleware
```

## Chiều phụ thuộc hợp lệ

```text
UI/routes -> adapters -> core -> shared
UI/routes -> core (ports, container, domain)
worker routes -> application -> ports <- adapters (d1, gemini)
```

Không làm:

- `core` (FE lẫn worker) import từ `adapters`.
- `core` gọi `fetch`, `window`, `document`, driver DB hay SDK service ngoài.
- Business rule mới đặt trong component React hoặc route Hono.
- `shared/` import bất cứ thứ gì ngoài zod (không React, không drizzle).

## Composition root — nơi cắm adapter

- Frontend: `frontend/src/main.tsx` gọi `provideGameApi(createHttpGameApi())` và
  `provideQrProvider(vietQrProvider)`. Test/offline chỉ cần provide adapter khác.
- Worker: middleware `requireUser` (backend/src/lib/require-user.ts) tạo
  `createGameRepository(createDb(c.env))` gắn vào context; route public share
  cũng dùng cùng factory. Route AI tạo `createGeminiAiProvider(c.env)`.
- `createDb` chọn Turso/libSQL khi có `TURSO_DATABASE_URL`; nếu không có,
  dùng binding D1 `DB`. Tên thư mục `adapters/d1` là tên lịch sử, không có
  nghĩa production còn chạy D1.

## Đường đi request và xác thực

`wrangler.toml` đưa `/api/*` và `/share/*` vào Hono; các đường còn lại dùng
static assets trong `dist/` với SPA fallback. `/share/:token` đi qua route
server để trả metadata preview, còn router React xử lý màn hình người dùng.

- `auth.ts`: Better Auth với Drizzle SQLite adapter và username plugin,
  endpoint `/api/auth/*`; không có OAuth Google riêng trong app.
- `resolveUserId`: thử session Better Auth, token CLI `ck_...` có scope
  `api:full`, rồi JWT SSO từ cookie `huyab_sso` hoặc Bearer.
- `sso.ts` kiểm chữ ký RS256 bằng JWKS của `auth.huyab.cfd`, issuer và hạn;
  `sso-user.ts` ánh xạ email sang user trong cùng DB của app.
- `requireSessionUser` không nhận token CLI để quản lý token hoặc duyệt thiết
  bị. MCP có xác thực và scope riêng tại `backend/src/mcp/`.
- Route được bảo vệ gọi application qua `GameRepository`; route share công
  khai kiểm token/quyền share riêng. Không gắn `requireUser` lên toàn bộ
  `/api/*`, vì sẽ chặn cả share, auth và health.

## Lưu trữ và vận hành

Schema nguồn là `backend/src/adapters/d1/schema.ts`, dùng tên bảng/index
`chiakeo_`. Migrations hiện hành ở `drizzle-shared/`; `drizzle/` và
`migrations/` là lịch sử, không áp vào DB đang dùng. User/session, nghiệp vụ
và ảnh base64 cùng đi qua DB được `createDb` chọn; chưa dùng R2 cho ảnh.

Production dùng Turso, local/E2E dùng D1. D1 giữ lại không tự đồng bộ với
Turso: bỏ cấu hình Turso không phải rollback dữ liệu an toàn. Migration
production và deploy là hai pipeline độc lập: thêm schema trước, chờ thành
công rồi mới ship code đọc schema mới. Xem [deploy và migration](cloudflare-v1.md).

React Query giữ cache phía client. Rate limit và cache JWKS nằm trong RAM
mỗi Worker isolate; không phải bộ đếm/cache toàn cục. Cache đọc DB đang được
theo dõi riêng tại [chiakeo#151](https://github.com/nguyenhuy158/chiakeo/issues/151).

Tài liệu này mô tả kiến trúc hiện tại, không phải biên bản nghiệm thu.
[Checklist MVP web](mvp-web.md) ghi bằng chứng theo thời điểm;
[OpenAPI](openapi.md) là hợp đồng API và cách kiểm tra drift.

## Muốn thay một mảnh thì làm gì

| Muốn thay | Viết adapter mới implement | Cắm ở |
| --- | --- | --- |
| Turso/D1 -> DB khác | `GameRepository` (backend/src/core/ports/game-repository.ts) | `require-user.ts` + `routes/share.ts` |
| Gemini -> AI khác | `AiProvider` (backend/src/core/ports/ai-provider.ts) | `routes/ai.ts` |
| VietQR -> QR khác | `QrProviderPort` (frontend/src/core/ports/qr-provider.ts) | `frontend/src/main.tsx` |
| fetch -> mock/offline | `GameApiPort` (frontend/src/core/ports/game-api.ts) | `frontend/src/main.tsx` |

## Checklist thêm tính năng

1. Rule tính toán/validate thuần: thêm vào `shared/` (dùng chung) hoặc
   `frontend/src/core/domain` (chỉ FE) và viết test thuần.
2. Nghiệp vụ phía backend: thêm use case trong `backend/src/core/application`,
   khai báo thao tác dữ liệu cần thiết vào port `GameRepository`, implement
   trong `adapters/d1`.
3. Route Hono chỉ parse input (zod qua `readJson`), gọi use case qua
   `respond()` để map lỗi nghiệp vụ sang HTTP status.
4. Phía FE: gọi API qua hook trong `frontend/src/adapters/react-query/queries.ts`
   (hook lấy `GameApiPort` từ container).
5. Chạy `pnpm check`, `pnpm test`, `pnpm build`; flow chính chạy `pnpm e2e`.
