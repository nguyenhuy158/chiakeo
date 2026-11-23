import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateSchema, getProgramFromFiles } from "typescript-json-schema";
import {
  ACCESS,
  FORM_MEDIA_TYPE,
  HTTP_STATUS,
  inputJsonSchema,
  JSON_MEDIA_TYPE,
  OPENAPI_FILE,
  OPERATIONS,
} from "./openapi-contract";

const CHECK_FLAG = "--check";
const SCHEMA_PREFIX = "#/components/schemas/";
const DEFINITION_PREFIX = "#/definitions/";
const JSON_INDENT = 2;
const program = getProgramFromFiles([resolve("scripts/openapi-responses.ts")], {
  target: "ES2022",
  module: "ESNext",
  moduleResolution: "Bundler",
  strictNullChecks: true,
  skipLibCheck: true,
});
const generated = generateSchema(program, "OpenApiResponses", {
  required: true,
  strictNullChecks: true,
});
if (!generated?.properties)
  throw new Error("Could not generate response schemas");
const schemaName = (name: string) =>
  /^[a-zA-Z0-9._-]+$/.test(name)
    ? name
    : `Generated_${createHash("sha256").update(name).digest("hex")}`;
const schemas: Record<string, unknown> = Object.fromEntries(
  Object.entries({ ...generated.definitions, ...generated.properties }).map(
    ([name, schema]) => [schemaName(name), schema],
  ),
);
const reference = (name: string) => ({ $ref: `${SCHEMA_PREFIX}${name}` });
const jsonResponse = (name: string, description: string) => ({
  description,
  content: { [JSON_MEDIA_TYPE]: { schema: reference(name) } },
});
const binaryTypes = {
  Csv: "text/csv",
  Image: "image/png",
  Preview: "image/jpeg",
};
const sessionSecurity = [
  { SessionCookie: [] },
  { SecureSessionCookie: [] },
  { SsoCookie: [] },
  { SsoBearer: [] },
];
const paths: Record<string, Record<string, unknown>> = {};
for (const operation of OPERATIONS) {
  const path = operation.path.replace(/:([\w]+)/g, "{$1}");
  const tag = operation.path.split("/")[2];
  const parameters: unknown[] = [...path.matchAll(/\{(\w+)\}/g)].map(
    (match) => ({
      name: match[1],
      in: "path",
      required: true,
      description: `${match[1]} identifier`,
      schema: { type: "string" },
    }),
  );
  if (operation.response === "Csv")
    parameters.push({
      name: "month",
      in: "query",
      required: true,
      description: "Report month (YYYY-MM)",
      schema: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
    });
  if (operation.response === "Image")
    for (const name of ["bank", "account", "amount", "name", "code"])
      parameters.push({
        name,
        in: "query",
        required: ["bank", "account"].includes(name),
        description: `VietQR ${name}`,
        schema: { type: "string" },
      });
  const response =
    operation.response in binaryTypes
      ? {
          description: "Exported content",
          content: {
            [binaryTypes[operation.response as keyof typeof binaryTypes]]: {
              schema: { type: "string", format: "binary" },
            },
          },
        }
      : jsonResponse(operation.response, "Successful response");
  const responses: Record<string, unknown> = {
    [operation.status ?? HTTP_STATUS.OK]: response,
    default: jsonResponse(
      "Error",
      "Request rejected or server error; error contains the application error code or message.",
    ),
  };
  if (operation.response === "Health")
    responses[HTTP_STATUS.INTERNAL_ERROR] = jsonResponse(
      "HealthError",
      "Database unavailable",
    );
  if (operation.response === "Sent")
    responses[HTTP_STATUS.BAD_GATEWAY] = jsonResponse(
      "MailError",
      "Mail provider rejected delivery",
    );
  let requestBody:
    | {
        required: boolean;
        content: Record<string, { schema: { $ref: string } }>;
      }
    | undefined;
  if (operation.input) {
    const { $schema, ...schema } = inputJsonSchema(operation.input);
    schemas[operation.input] = schema;
    const content = {
      [JSON_MEDIA_TYPE]: { schema: reference(operation.input) },
    };
    if (operation.form) content[FORM_MEDIA_TYPE] = content[JSON_MEDIA_TYPE];
    requestBody = { required: true, content };
  }
  paths[path] ??= {};
  paths[path][operation.method] = {
    operationId: `${operation.method}_${operation.path.replace(/[^\w]+/g, "_")}`,
    summary: `${operation.method.toUpperCase()} ${path}`,
    description:
      operation.access === ACCESS.SESSION
        ? "Requires a browser session or SSO JWT. API tokens are not accepted."
        : "Application REST operation. Runtime Zod refinements and authorization remain authoritative.",
    tags: [tag],
    parameters,
    requestBody,
    responses,
    security:
      operation.access === ACCESS.PUBLIC
        ? []
        : operation.access === ACCESS.SESSION
          ? sessionSecurity
          : [...sessionSecurity, { ApiToken: [] }],
  };
}
const document = {
  openapi: "3.1.0",
  info: {
    title: "Chia Kèo API",
    version: "1.0.0",
    description:
      "Application REST API. Better Auth /api/auth/*, MCP JSON-RPC /api/mcp and HTML share pages have separate protocols and are excluded.",
    contact: {
      name: "Chia Kèo",
      url: "https://github.com/nguyenhuy158/chiakeo",
    },
  },
  servers: [{ url: "/", description: "Same origin as the application" }],
  tags: [
    ...new Set(OPERATIONS.map((operation) => operation.path.split("/")[2])),
  ]
    .sort()
    .map((name) => ({ name, description: `${name} operations` })),
  paths,
  components: {
    schemas,
    securitySchemes: {
      SessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
      },
      SecureSessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "__Secure-better-auth.session_token",
      },
      SsoCookie: { type: "apiKey", in: "cookie", name: "huyab_sso" },
      SsoBearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      ApiToken: {
        type: "http",
        scheme: "bearer",
        description: "ck_ token with api:full scope",
      },
    },
  },
};
const output = `${JSON.stringify(document, (key, value) => (key === "$ref" && typeof value === "string" && value.startsWith(DEFINITION_PREFIX) ? `${SCHEMA_PREFIX}${schemaName(decodeURIComponent(value.slice(DEFINITION_PREFIX.length)))}` : value), JSON_INDENT)}\n`;
if (process.argv.includes(CHECK_FLAG)) {
  if (
    JSON.stringify(JSON.parse(readFileSync(OPENAPI_FILE, "utf8"))) !==
    JSON.stringify(JSON.parse(output))
  )
    throw new Error(
      "OpenAPI is stale. Run pnpm openapi:generate and commit docs/openapi.json.",
    );
} else writeFileSync(OPENAPI_FILE, output);
