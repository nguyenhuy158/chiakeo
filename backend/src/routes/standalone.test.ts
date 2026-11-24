import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCreatedMcpToken } from "../../../shared/api-types";
import {
  createFakeRepo,
  FAKE_GAME_ID,
  FAKE_OWNER,
  gameRow,
} from "../core/application/fake-game-repository";
import type { AuthedEnv } from "../lib/require-user";
import { bundlesRouter } from "./bundles";
import { crossBalancesRouter } from "./cross-balances";
import { funStatsRouter } from "./fun-stats";
import { mcpTokensRouter } from "./mcp-tokens";
import { profileRouter } from "./profile";
import { shuttlesRouter } from "./shuttles";
import { userPreferencesRouter } from "./user-preferences";

vi.mock("../lib/require-user", () => ({
  protectPaths: vi.fn(),
  requireSessionUser: async (_c: unknown, next: () => Promise<void>) => next(),
}));

let fake: ReturnType<typeof createFakeRepo>;
let app: Hono<AuthedEnv>;

function request(method: string, path: string, body?: unknown) {
  return app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

beforeEach(() => {
  fake = createFakeRepo();
  app = new Hono<AuthedEnv>();
  app.use("*", async (c, next) => {
    c.set("repo", fake.repo);
    c.set("userId", FAKE_OWNER);
    await next();
  });
  app.route("/api", bundlesRouter);
  app.route("/api", crossBalancesRouter);
  app.route("/api", funStatsRouter);
  app.route("/api", mcpTokensRouter);
  app.route("/api", profileRouter);
  app.route("/api", shuttlesRouter);
  app.route("/api", userPreferencesRouter);
});

describe("account level HTTP routes", () => {
  it("returns cross game balances and fun stats", async () => {
    const balances = await request("GET", "/cross-balances");
    expect(balances.status).toBe(200);
    expect(await balances.json()).toMatchObject({
      games: [{ code: "DSKVUF" }],
      totalExpense: 0,
    });
    const stats = await request("GET", "/fun-stats");
    expect(stats.status).toBe(200);
    expect(await stats.json()).toMatchObject({ gameCount: 1, totalExpense: 0 });
  });

  it("creates, lists, settles and deletes a parent game", async () => {
    fake.state.games.push(gameRow({ id: "game_2", code: "SECOND" }));
    expect(
      (await request("POST", "/bundles", { name: "x", gameIds: ["a"] })).status,
    ).toBe(400);
    const created = await request("POST", "/bundles", {
      name: "Tháng 8",
      gameIds: [FAKE_GAME_ID, "game_2"],
    });
    expect(created.status).toBe(200);
    const { id } = (await created.json()) as { id: string };
    expect(await (await request("GET", "/bundles")).json()).toMatchObject([
      { id, gameCount: 2 },
    ]);
    expect(await (await request("GET", `/bundles/${id}`)).json()).toMatchObject(
      { name: "Tháng 8" },
    );
    expect(
      (await request("POST", `/bundles/${id}/settle`, { names: [] })).status,
    ).toBe(400);
    expect(
      (await request("POST", `/bundles/${id}/settle`, { names: ["Ai"] }))
        .status,
    ).toBe(400);
    expect((await request("DELETE", `/bundles/${id}`)).status).toBe(200);
    expect((await request("GET", `/bundles/${id}`)).status).toBe(404);
  });

  it("validates and updates the current profile name", async () => {
    expect((await request("PATCH", "/profile", { name: " " })).status).toBe(
      400,
    );
    fake.state.users.push({
      id: FAKE_OWNER,
      name: "Old",
      email: "owner@example.com",
    });
    const response = await request("PATCH", "/profile", { name: " New " });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "New" });
    expect(fake.state.users[0].name).toBe("New");
  });

  it("creates, edits, uses and removes shuttle tubes over HTTP", async () => {
    expect(await (await request("GET", "/shuttles")).json()).toEqual({
      tubes: [],
    });
    expect(
      (await request("POST", "/shuttles/tubes", { name: " " })).status,
    ).toBe(400);
    const created = await request("POST", "/shuttles/tubes", {
      name: "Ống A",
      tubePrice: 240_000,
    });
    expect(created.status).toBe(201);
    const { tubes } = (await created.json()) as {
      tubes: { id: string; stock: number; shuttlePrice: number }[];
    };
    expect(tubes[0]).toMatchObject({ stock: 12, shuttlePrice: 20_000 });
    const tubeId = tubes[0].id;

    expect(
      (
        await request("POST", `/shuttles/tubes/${tubeId}/entries`, {
          kind: "add",
          quantity: -1,
        })
      ).status,
    ).toBe(400);
    const used = await request("POST", `/shuttles/tubes/${tubeId}/entries`, {
      kind: "use",
      quantity: 2,
    });
    expect(used.status).toBe(200);
    expect(await used.json()).toMatchObject({ tubes: [{ stock: 10 }] });

    expect(
      (await request("PATCH", `/shuttles/tubes/${tubeId}`, { name: "" }))
        .status,
    ).toBe(400);
    const renamed = await request("PATCH", `/shuttles/tubes/${tubeId}`, {
      name: "Ống B",
    });
    expect(await renamed.json()).toMatchObject({ tubes: [{ name: "Ống B" }] });

    const entryId = fake.state.shuttleEntries.find(
      (row) => row.kind === "use",
    )!.id;
    const removed = await request("DELETE", `/shuttles/entries/${entryId}`);
    expect(await removed.json()).toMatchObject({ tubes: [{ stock: 12 }] });

    const deleted = await request("DELETE", `/shuttles/tubes/${tubeId}`);
    expect(await deleted.json()).toEqual({ tubes: [] });
    expect((await request("DELETE", `/shuttles/tubes/${tubeId}`)).status).toBe(
      404,
    );
  });

  it("validates, saves, and reads user preferences", async () => {
    const saved = new Map<string, string>();
    fake.repo.userPreferences.listByUser = async () =>
      [...saved].map(([key, value]) => ({ key, value }));
    fake.repo.userPreferences.upsert = async (_userId, key, value) => {
      saved.set(key, value);
    };
    expect(await (await request("GET", "/preferences")).json()).toEqual({
      preferences: {
        summaryShowQr: true,
        summaryShowAvatar: true,
        roundDownRefunds: false,
        hideSettledGames: false,
        tags: [],
      },
    });
    expect(
      (await request("PATCH", "/preferences", { summaryShowQr: "no" })).status,
    ).toBe(400);
    const updated = await request("PATCH", "/preferences", {
      summaryShowQr: false,
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({
      preferences: {
        summaryShowQr: false,
        summaryShowAvatar: true,
        roundDownRefunds: false,
        hideSettledGames: false,
        tags: [],
      },
    });
    expect(saved.get("summaryShowQr")).toBe("false");
  });

  it("validates, creates, lists, and revokes an MCP token", async () => {
    const rows: Awaited<ReturnType<typeof fake.repo.mcpTokens.listByUser>> = [];
    fake.repo.mcpTokens.listByUser = async () => rows;
    fake.repo.mcpTokens.insert = async (row) => {
      rows.push(row);
    };
    fake.repo.mcpTokens.revoke = async (tokenId, userId, revokedAt) => {
      const row = rows.find(
        (item) => item.id === tokenId && item.userId === userId,
      );
      if (!row) return false;
      row.revokedAt = revokedAt;
      return true;
    };
    expect(
      (await request("POST", "/mcp-tokens", { name: "Test", scopes: [] }))
        .status,
    ).toBe(400);
    const created = await request("POST", "/mcp-tokens", {
      name: "Test",
      scopes: ["games:read"],
    });
    expect(created.status).toBe(201);
    const result = (await created.json()) as ApiCreatedMcpToken;
    expect(result.secret).toMatch(/^ck_[0-9a-f]{64}$/);
    expect(result.token).toMatchObject({
      name: "Test",
      scopes: ["games:read"],
      active: true,
    });
    const listed = await request("GET", "/mcp-tokens");
    expect(await listed.json()).toMatchObject([
      { id: result.token.id, active: true },
    ]);
    const revoked = await request("DELETE", `/mcp-tokens/${result.token.id}`);
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ ok: true });
    expect((await request("DELETE", "/mcp-tokens/missing")).status).toBe(404);
  });
});
