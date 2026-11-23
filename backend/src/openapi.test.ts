import Ajv from "ajv";
import addFormats from "ajv-formats";
import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import document from "../../docs/openapi.json";
import { OPERATIONS } from "../../scripts/openapi-contract";
import {
  createFakeRepo,
  FAKE_OWNER,
} from "./core/application/fake-game-repository";
import type { Env } from "./env";
import app from "./index";
import type { AuthedEnv } from "./lib/require-user";
import { gamesRouter } from "./routes/games";

vi.mock("./lib/require-user", () => ({
  protectPaths: vi.fn(),
  requireSessionUser: vi.fn(),
}));
vi.mock("./lib/payment-context", () => ({
  createPaymentContext: (_env: unknown, repo: unknown) => ({
    repo,
    bankFeed: null,
  }),
}));

const ajv = new Ajv({ strict: false });
addFormats(ajv);
ajv.addSchema(document, "contract");

it("describes every application REST route exactly once", () => {
  const excluded = new Set([
    "GET /api/openapi.json",
    "GET /api/auth/*",
    "POST /api/auth/*",
    "GET /share/:token",
  ]);
  const routes = app.routes
    .filter((route) => route.method !== "ALL")
    .map((route) => `${route.method} ${route.path}`)
    .filter((route) => !excluded.has(route));
  const operations = OPERATIONS.map(
    (operation) => `${operation.method.toUpperCase()} ${operation.path}`,
  );
  expect([...new Set(routes)].sort()).toEqual([...operations].sort());
  expect(new Set(operations).size).toBe(operations.length);
});

it("serves the committed spec without a database", async () => {
  const response = await app.request("/api/openapi.json", undefined, {} as Env);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(document);
});

it("validates real list, create, update and error responses against the contract", async () => {
  const fake = createFakeRepo();
  const router = new Hono<AuthedEnv>();
  router.use("*", async (c, next) => {
    c.set("repo", fake.repo);
    c.set("userId", FAKE_OWNER);
    await next();
  });
  router.route("/api", gamesRouter);
  for (const [method, path, body, status, schema] of [
    ["GET", "/api/games", undefined, 200, "Games"],
    [
      "POST",
      "/api/games",
      { name: "Contract game", participantCount: 2 },
      201,
      "GameDetail",
    ],
    ["POST", "/api/games", {}, 400, "Error"],
  ] as const) {
    const response = await router.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    expect(response.status).toBe(status);
    const payload = await response.json();
    const validate = ajv.compile({
      $ref: `contract#/components/schemas/${schema}`,
    });
    expect(validate(payload), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ unexpected: true })).toBe(false);
  }
  const detail = fake.state.games[0];
  const response = await router.request(`/api/games/${detail.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Updated" }),
  });
  expect(response.status).toBe(200);
  const validate = ajv.compile({
    $ref: "contract#/components/schemas/GameDetail",
  });
  expect(validate(await response.json()), JSON.stringify(validate.errors)).toBe(
    true,
  );
});
