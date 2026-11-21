import { describe, expect, it } from "vitest";
import { DEVICE_GRANT_TYPE } from "../../../../shared/schemas";
import type { McpTokenRow } from "../ports/game-repository";
import {
  approveDeviceFlow,
  denyDeviceFlow,
  lookupDeviceFlow,
  pollDeviceFlow,
  startDeviceFlow,
} from "./device-codes";
import { BadRequestError, NotFoundError } from "./errors";
import { createFakeRepo } from "./fake-game-repository";
import { authenticateMcpToken } from "./mcp-tokens";

const ORIGIN = "https://chiakeo.example";
const SECRET = "server-secret";
const ONE_DAY_AGO = "2020-01-01T00:00:00.000Z";

function setup() {
  const fake = createFakeRepo();
  const tokens: McpTokenRow[] = [];
  fake.repo.mcpTokens.insert = async (row) => {
    tokens.push(row);
  };
  fake.repo.mcpTokens.findByHash = async (hash) =>
    tokens.find((row) => row.tokenHash === hash) || null;
  fake.repo.mcpTokens.revoke = async (id, _userId, at) => {
    const row = tokens.find((item) => item.id === id);
    if (row) row.revokedAt = at;
    return Boolean(row);
  };
  return { fake, repo: fake.repo, tokens };
}

const poll = (
  repo: ReturnType<typeof setup>["repo"],
  device_code: string,
  grant_type = DEVICE_GRANT_TYPE,
) => pollDeviceFlow(repo, { device_code, grant_type }, SECRET);

describe("startDeviceFlow", () => {
  it("returns the RFC 8628 fields and a link that fills the code", async () => {
    const { repo, fake } = setup();
    const started = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);

    expect(started.device_code).toMatch(/^[0-9a-f]{64}$/);
    expect(started.user_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(started.verification_uri).toBe(`${ORIGIN}/login/device`);
    expect(started).not.toHaveProperty("verification_uri_complete");
    expect(started.expires_in).toBe(600);
    expect(started.interval).toBe(5);
    expect(JSON.stringify(fake.state.deviceCodes)).not.toContain(
      started.device_code,
    );
  });

  it("drops expired requests when a new one starts", async () => {
    const { fake, repo } = setup();
    fake.state.deviceCodes.push({
      id: "old",
      userCode: "OLDX-OLDX",
      name: "x",
      createdAt: ONE_DAY_AGO,
      expiresAt: ONE_DAY_AGO,
      userId: null,
      approvedAt: null,
      encryptedToken: null,
      lastPolledAt: null,
      deniedAt: null,
    });
    await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    expect(fake.state.deviceCodes.map((row) => row.id)).not.toContain("old");
  });
});

describe("pollDeviceFlow", () => {
  it("is pending, then slow_down when polled too fast", async () => {
    const { repo } = setup();
    const { device_code } = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);

    await expect(poll(repo, device_code)).rejects.toMatchObject({
      code: "authorization_pending",
    });
    await expect(poll(repo, device_code)).rejects.toMatchObject({
      code: "slow_down",
    });
  });

  it("gives the token once after approval, then the code is gone", async () => {
    const { repo, tokens } = setup();
    const started = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    await approveDeviceFlow(repo, "user-1", started.user_code, SECRET);

    const token = await poll(repo, started.device_code);
    expect(token).toMatchObject({ token_type: "bearer", scope: "api:full" });
    expect(token.access_token).toMatch(/^ck_[0-9a-f]{64}$/);
    expect(tokens[0]).toMatchObject({ userId: "user-1", scopes: "api:full" });
    expect(await authenticateMcpToken(repo, token.access_token)).toMatchObject({
      userId: "user-1",
      scopes: ["api:full"],
    });

    await expect(poll(repo, started.device_code)).rejects.toMatchObject({
      code: "expired_token",
    });
  });

  it("rejects unknown codes, expired codes and a wrong grant type", async () => {
    const { fake, repo } = setup();
    await expect(poll(repo, "missing")).rejects.toMatchObject({
      code: "expired_token",
    });

    const { device_code } = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    await expect(poll(repo, device_code, "password")).rejects.toMatchObject({
      code: "unsupported_grant_type",
    });

    const row = fake.state.deviceCodes[0];
    row.expiresAt = ONE_DAY_AGO;
    await expect(poll(repo, device_code)).rejects.toMatchObject({
      code: "expired_token",
    });
  });

  it("does not hand the token to a poll made with another secret", async () => {
    const { repo } = setup();
    const started = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    await approveDeviceFlow(repo, "user-1", started.user_code, SECRET);
    await expect(
      pollDeviceFlow(
        repo,
        { device_code: started.device_code, grant_type: DEVICE_GRANT_TYPE },
        "another-secret",
      ),
    ).rejects.toThrow();
  });
});

describe("approveDeviceFlow", () => {
  it("accepts a code typed in lower case without the dash", async () => {
    const { repo } = setup();
    const started = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    const approved = await approveDeviceFlow(
      repo,
      "user-1",
      started.user_code.toLowerCase().replace("-", " "),
      SECRET,
    );
    expect(approved).toEqual({ name: "VM" });
  });

  it("stores the token encrypted, never in clear", async () => {
    const { fake, repo } = setup();
    const started = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    await approveDeviceFlow(repo, "user-1", started.user_code, SECRET);
    const stored = fake.state.deviceCodes[0].encryptedToken ?? "";
    expect(stored).not.toBe("");
    expect(stored).not.toContain("ck_");
  });

  it("rejects unknown codes, expired codes and a second approval", async () => {
    const { fake, repo, tokens } = setup();
    await expect(
      approveDeviceFlow(repo, "user-1", "NOPE-NOPE", SECRET),
    ).rejects.toThrow(NotFoundError);

    const expired = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    fake.state.deviceCodes[0].expiresAt = ONE_DAY_AGO;
    await expect(
      approveDeviceFlow(repo, "user-1", expired.user_code, SECRET),
    ).rejects.toThrow(NotFoundError);

    const started = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    await approveDeviceFlow(repo, "user-1", started.user_code, SECRET);
    await expect(
      approveDeviceFlow(repo, "user-2", started.user_code, SECRET),
    ).rejects.toThrow(BadRequestError);
    expect(tokens).toHaveLength(1);
  });

  it("revokes the new token when a parallel approval wins", async () => {
    const { repo, tokens } = setup();
    const started = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    repo.deviceCodes.approve = async () => false;
    await expect(
      approveDeviceFlow(repo, "user-1", started.user_code, SECRET),
    ).rejects.toThrow(BadRequestError);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].revokedAt).not.toBeNull();
  });
});

describe("lookupDeviceFlow and denyDeviceFlow", () => {
  it("shows only the device name and the code before approval", async () => {
    const { repo } = setup();
    const started = await startDeviceFlow(repo, { name: "May ban" }, ORIGIN);
    expect(
      await lookupDeviceFlow(repo, started.user_code.toLowerCase()),
    ).toEqual({ name: "May ban", user_code: started.user_code });
  });

  it("does not look up unknown, expired, approved or denied codes", async () => {
    const { fake, repo } = setup();
    await expect(lookupDeviceFlow(repo, "NOPE-NOPE")).rejects.toThrow(
      NotFoundError,
    );

    const expired = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    fake.state.deviceCodes[0].expiresAt = ONE_DAY_AGO;
    await expect(lookupDeviceFlow(repo, expired.user_code)).rejects.toThrow(
      NotFoundError,
    );

    const approved = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    await approveDeviceFlow(repo, "user-1", approved.user_code, SECRET);
    await expect(lookupDeviceFlow(repo, approved.user_code)).rejects.toThrow(
      BadRequestError,
    );

    const denied = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    await denyDeviceFlow(repo, denied.user_code);
    await expect(lookupDeviceFlow(repo, denied.user_code)).rejects.toThrow(
      BadRequestError,
    );
  });

  it("gives access_denied once after the user denies, then the code is gone", async () => {
    const { repo, tokens } = setup();
    const started = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    expect(await denyDeviceFlow(repo, started.user_code)).toEqual({
      name: "VM",
    });

    await expect(poll(repo, started.device_code)).rejects.toMatchObject({
      code: "access_denied",
    });
    await expect(poll(repo, started.device_code)).rejects.toMatchObject({
      code: "expired_token",
    });
    expect(tokens).toHaveLength(0);
  });

  it("cannot approve a denied code and cannot deny an approved one", async () => {
    const { repo } = setup();
    const denied = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    await denyDeviceFlow(repo, denied.user_code);
    await expect(
      approveDeviceFlow(repo, "user-1", denied.user_code, SECRET),
    ).rejects.toThrow(BadRequestError);

    const approved = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    await approveDeviceFlow(repo, "user-1", approved.user_code, SECRET);
    await expect(denyDeviceFlow(repo, approved.user_code)).rejects.toThrow(
      BadRequestError,
    );
  });

  it("reports a parallel decision that wins the race", async () => {
    const { repo } = setup();
    const started = await startDeviceFlow(repo, { name: "VM" }, ORIGIN);
    repo.deviceCodes.deny = async () => false;
    await expect(denyDeviceFlow(repo, started.user_code)).rejects.toThrow(
      BadRequestError,
    );
  });
});
