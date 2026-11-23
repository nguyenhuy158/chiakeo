# OpenAPI contract

The application serves OpenAPI 3.1 at `GET /api/openapi.json`. The committed
[spec](openapi.json) describes application REST routes, request bodies, response
DTOs, authentication, path parameters and query parameters.

```sh
pnpm openapi:generate
pnpm check
pnpm test
```

`pnpm check` rejects a stale spec and runs Spectral with warnings treated as
failures. The existing CI invokes this command. Contract tests compare Hono
routes with the operation registry and validate representative real game-route
responses with Ajv, including an intentionally invalid payload.

## Updating an API

1. Change the existing Zod schema or response DTO.
2. Add or update the operation in `scripts/openapi-contract.ts`; response roots
   live in `scripts/openapi-responses.ts` and reference existing DTO types.
3. Run `pnpm openapi:generate`, review the diff, then run checks and tests.

Only the generated JSON is imported by the Worker. TypeScript schema generation,
Zod conversion and Spectral run in development/CI, not per request.

## Authentication and scope

Protected operations accept a Better Auth session cookie, an SSO cookie/JWT,
or a `ck_` token with `api:full`. Session-only operations exclude API tokens.
Public share operations still require a valid share token in the URL.

Better Auth `/api/auth/*`, MCP JSON-RPC `/api/mcp`, HTML `/share/:token`, and the
spec endpoint itself are outside this REST contract. Those protocols retain their
existing implementations. Errors remain the existing JSON `{error: string}`
format; this change does not implement RFC 9457 Problem Details.

JSON Schema captures structural Zod input constraints before transforms. Custom
refinements, authorization, database state and cross-field business rules remain
runtime checks. Representative response tests do not prove every response of
every endpoint, and schema linting is not blanket RFC compliance certification.
