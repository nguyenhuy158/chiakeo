import { describe, expect, it } from "vitest";
import { CLI_USER_CODE_LENGTH } from "../../../../shared/schemas";
import type { McpTokenRow } from "../ports/game-repository";
import { approveCliAuth, pollCliAuth, startCliAuth } from "./device-codes";
import { BadRequestError, NotFoundError } from "./errors";
import { createFakeRepo } from "./fake-game-repository";

const START = {
  tokenHash: "a".repeat(64),
  tokenPrefix: "ck_abcdef",
  name: "May ban",
};
const ORIGIN = "https://chiakeo.example";

function setup() {
  const fake = createFakeRepo();
  const tokens: McpTokenRow[] = [];
  fake.repo.mcpTokens.insert = async (row) => {
    tokens.push(row);
  };
  return { fake, repo: fake.repo, tokens };
}

describe("startCliAuth", () => {
  it("returns a readable user code and a verification URL", async () => {
    const { repo } = setup();
    const started = await startCliAuth(repo, START, ORIGIN);

    expect(started.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(started.userCode.replace("-", "")).toHaveLength(
      CLI_USER_CODE_LENGTH,
    );
    expect(started.deviceCode).toMatch(/^[0-9a-f]{64}$/);
    expect(started.verificationUrl).toBe(`${ORIGIN}/cli-auth`);
    expect(started.expiresInSeconds).toBeGreaterThan(0);
    expect(started.intervalSeconds).toBeGreaterThan(0);
  });

  it("drops expired requests when a new one starts", async () => {
    const { fake, repo } = setup();
    fake.state.deviceCodes.push({
      id: "old",
      userCode: "OLDX-OLDX",
      tokenHash: START.tokenHash,
      tokenPrefix: START.tokenPrefix,
      name: "x",
      createdAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-01T00:10:00.000Z",
      userId: null,
      approvedAt: null,
    });
    await startCliAuth(repo, START, ORIGIN);
    expect(fake.state.deviceCodes.map((row) => row.id)).not.toContain("old");
  });
});

describe("pollCliAuth", () => {
  it("is pending, then approved, and unknown or expired codes are expired", async () => {
    const { fake, repo } = setup();
    const started = await startCliAuth(repo, START, ORIGIN);
    expect(await pollCliAuth(repo, started.deviceCode)).toEqual({
      status: "pending",
    });

    await approveCliAuth(repo, "user-1", started.userCode);
    expect(await pollCliAuth(repo, started.deviceCode)).toEqual({
      status: "approved",
    });

    expect(await pollCliAuth(repo, "missing")).toEqual({ status: "expired" });

    const second = await startCliAuth(repo, START, ORIGIN);
    const row = fake.state.deviceCodes.find(
      (item) => item.id === second.deviceCode,
    );
    if (row) row.expiresAt = "2020-01-01T00:00:00.000Z";
    expect(await pollCliAuth(repo, second.deviceCode)).toEqual({
      status: "expired",
    });
  });
});

describe("approveCliAuth", () => {
  it("creates an api:full token with the hash the CLI sent", async () => {
    const { repo, tokens } = setup();
    const started = await startCliAuth(repo, START, ORIGIN);

    const approved = await approveCliAuth(
      repo,
      "user-1",
      started.userCode.toLowerCase().replace("-", " "),
    );

    expect(approved).toEqual({ name: "May ban" });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      userId: "user-1",
      name: "May ban",
      tokenHash: START.tokenHash,
      tokenPrefix: START.tokenPrefix,
      scopes: "api:full",
      expiresAt: null,
    });
  });

  it("rejects unknown codes, expired codes and a second approval", async () => {
    const { fake, repo, tokens } = setup();
    await expect(approveCliAuth(repo, "user-1", "NOPE-NOPE")).rejects.toThrow(
      NotFoundError,
    );

    const expired = await startCliAuth(repo, START, ORIGIN);
    const row = fake.state.deviceCodes.find(
      (item) => item.id === expired.deviceCode,
    );
    if (row) row.expiresAt = "2020-01-01T00:00:00.000Z";
    await expect(
      approveCliAuth(repo, "user-1", expired.userCode),
    ).rejects.toThrow(NotFoundError);

    const started = await startCliAuth(repo, START, ORIGIN);
    await approveCliAuth(repo, "user-1", started.userCode);
    await expect(
      approveCliAuth(repo, "user-2", started.userCode),
    ).rejects.toThrow(BadRequestError);
    expect(tokens).toHaveLength(1);
  });

  it("does not make a token when the code is taken by a parallel approval", async () => {
    const { repo, tokens } = setup();
    const started = await startCliAuth(repo, START, ORIGIN);
    repo.deviceCodes.approve = async () => false;
    await expect(
      approveCliAuth(repo, "user-1", started.userCode),
    ).rejects.toThrow(BadRequestError);
    expect(tokens).toHaveLength(0);
  });
});
