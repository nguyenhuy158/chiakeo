import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiDeviceApproved,
  ApiDeviceCode,
  ApiDeviceToken,
} from "../../../shared/api-types";
import { DEVICE_GRANT_TYPE } from "../../../shared/schemas";
import {
  createFakeRepo,
  FAKE_OWNER,
} from "../core/application/fake-game-repository";
import type { AuthedEnv } from "../lib/require-user";

let fake: ReturnType<typeof createFakeRepo>;

vi.mock("../adapters/d1/game-repository", () => ({
  createDb: () => ({}),
  createGameRepository: () => fake.repo,
}));
vi.mock("../lib/require-user", () => ({
  requireSessionUser: async (
    c: { set: (key: string, value: unknown) => void },
    next: () => Promise<void>,
  ) => {
    c.set("repo", fake.repo);
    c.set("userId", FAKE_OWNER);
    await next();
  },
}));

import { loginDeviceRouter } from "./login-device";

const ENV = { BETTER_AUTH_SECRET: "route-secret" };
const FORM = "application/x-www-form-urlencoded";

let app: Hono<AuthedEnv>;

function post(path: string, body: unknown, contentType = "application/json") {
  return app.request(
    `/api${path}`,
    {
      method: "POST",
      headers: { "content-type": contentType },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    ENV,
  );
}

beforeEach(() => {
  fake = createFakeRepo();
  fake.repo.mcpTokens.insert = async () => {};
  app = new Hono<AuthedEnv>();
  app.route("/api", loginDeviceRouter);
});

describe("login device routes", () => {
  it("runs the whole flow with JSON bodies", async () => {
    const started = await post("/login/device/code", { name: "VM" });
    expect(started.status).toBe(200);
    expect(started.headers.get("cache-control")).toBe("no-store");
    const flow = (await started.json()) as ApiDeviceCode;

    const body = {
      device_code: flow.device_code,
      grant_type: DEVICE_GRANT_TYPE,
    };
    const pending = await post("/login/oauth/access_token", body);
    expect(pending.status).toBe(400);
    expect(await pending.json()).toEqual({ error: "authorization_pending" });

    const approved = await post("/login/device/approve", {
      user_code: flow.user_code,
    });
    expect(((await approved.json()) as ApiDeviceApproved).name).toBe("VM");

    const done = await post("/login/oauth/access_token", body);
    expect(done.status).toBe(200);
    expect(((await done.json()) as ApiDeviceToken).access_token).toMatch(
      /^ck_/,
    );
  });

  it("accepts form-urlencoded bodies like GitHub does", async () => {
    const started = await post(
      "/login/device/code",
      "client_id=chiakeo&scope=repo",
      FORM,
    );
    const flow = (await started.json()) as ApiDeviceCode;
    expect(flow.user_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const polled = await post(
      "/login/oauth/access_token",
      new URLSearchParams({
        device_code: flow.device_code,
        grant_type: DEVICE_GRANT_TYPE,
      }).toString(),
      FORM,
    );
    expect(await polled.json()).toEqual({ error: "authorization_pending" });
  });

  it("rejects malformed bodies, a wrong grant type and unknown codes", async () => {
    expect((await post("/login/device/code", { name: "" })).status).toBe(400);
    expect((await post("/login/device/code", "{not json")).status).toBe(400);
    const noBody = await app.request(
      "/api/login/device/code",
      { method: "POST" },
      ENV,
    );
    expect(noBody.status).toBe(400);
    expect(await (await post("/login/oauth/access_token", {})).json()).toEqual({
      error: "invalid_request",
    });
    expect(
      await (
        await post("/login/oauth/access_token", {
          device_code: "x",
          grant_type: "password",
        })
      ).json(),
    ).toEqual({ error: "unsupported_grant_type" });
    expect((await post("/login/device/approve", {})).status).toBe(400);
    expect(
      (await post("/login/device/approve", { user_code: "NOPE-NOPE" })).status,
    ).toBe(404);
  });
});
