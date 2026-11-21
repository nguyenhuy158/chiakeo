import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiCliAuthApproved,
  ApiCliAuthPoll,
  ApiCliAuthStart,
} from "../../../shared/api-types";
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

import { cliAuthRouter } from "./cli-auth";

const START_BODY = {
  tokenHash: "b".repeat(64),
  tokenPrefix: "ck_123456",
  name: "VM",
};

let app: Hono<AuthedEnv>;

function post(path: string, body: unknown) {
  return app.request(`/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fake = createFakeRepo();
  app = new Hono<AuthedEnv>();
  app.route("/api", cliAuthRouter);
});

describe("cli-auth routes", () => {
  it("starts, polls, approves and polls again", async () => {
    const started = await post("/cli-auth/start", START_BODY);
    expect(started.status).toBe(201);
    const flow = (await started.json()) as ApiCliAuthStart;

    const pending = await post("/cli-auth/poll", {
      deviceCode: flow.deviceCode,
    });
    expect(((await pending.json()) as ApiCliAuthPoll).status).toBe("pending");

    const approved = await post("/cli-auth/approve", {
      userCode: flow.userCode,
    });
    expect(approved.status).toBe(200);
    expect(((await approved.json()) as ApiCliAuthApproved).name).toBe("VM");

    const done = await post("/cli-auth/poll", { deviceCode: flow.deviceCode });
    expect(((await done.json()) as ApiCliAuthPoll).status).toBe("approved");
  });

  it("rejects malformed bodies and unknown codes", async () => {
    expect(
      (await post("/cli-auth/start", { ...START_BODY, tokenHash: "short" }))
        .status,
    ).toBe(400);
    expect((await post("/cli-auth/poll", {})).status).toBe(400);
    expect((await post("/cli-auth/approve", {})).status).toBe(400);
    expect(
      (await post("/cli-auth/approve", { userCode: "NOPE-NOPE" })).status,
    ).toBe(404);
  });
});
