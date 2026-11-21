import type { z } from "zod";
import type {
  ApiCliAuthApproved,
  ApiCliAuthPoll,
  ApiCliAuthStart,
} from "../../../../shared/api-types";
import {
  CLI_USER_CODE_LENGTH,
  type cliAuthStartInputSchema,
} from "../../../../shared/schemas";
import { nowIso } from "../../lib/ids";
import type { GameRepository } from "../ports/game-repository";
import { BadRequestError, NotFoundError } from "./errors";
import { insertMcpToken } from "./mcp-tokens";

const DEVICE_CODE_BYTES = 32;
const DEVICE_CODE_TTL_SECONDS = 600;
const POLL_INTERVAL_SECONDS = 3;
/** Bo ky tu bo O/0/I/1/L de ma doc tu man hinh khong bi nham. */
const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const USER_CODE_GROUP = CLI_USER_CODE_LENGTH / 2;

function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function generateUserCode() {
  const picked = Array.from(
    crypto.getRandomValues(new Uint8Array(CLI_USER_CODE_LENGTH)),
    (byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length],
  ).join("");
  return `${picked.slice(0, USER_CODE_GROUP)}-${picked.slice(USER_CODE_GROUP)}`;
}

/** Nguoi dung go thuong hoac dan thieu dau gach: chuan ve XXXX-XXXX. */
function normalizeUserCode(raw: string) {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${compact.slice(0, USER_CODE_GROUP)}-${compact.slice(USER_CODE_GROUP)}`;
}

export async function startCliAuth(
  repo: GameRepository,
  input: z.output<typeof cliAuthStartInputSchema>,
  origin: string,
): Promise<ApiCliAuthStart> {
  const now = nowIso();
  await repo.deviceCodes.deleteExpired(now);

  const row = {
    id: randomHex(DEVICE_CODE_BYTES),
    userCode: generateUserCode(),
    tokenHash: input.tokenHash,
    tokenPrefix: input.tokenPrefix,
    name: input.name,
    createdAt: now,
    expiresAt: new Date(
      Date.parse(now) + DEVICE_CODE_TTL_SECONDS * 1000,
    ).toISOString(),
    userId: null,
    approvedAt: null,
  };
  await repo.deviceCodes.insert(row);

  return {
    deviceCode: row.id,
    userCode: row.userCode,
    verificationUrl: `${origin}/cli-auth`,
    expiresInSeconds: DEVICE_CODE_TTL_SECONDS,
    intervalSeconds: POLL_INTERVAL_SECONDS,
  };
}

export async function pollCliAuth(
  repo: GameRepository,
  deviceCode: string,
): Promise<ApiCliAuthPoll> {
  const row = await repo.deviceCodes.findById(deviceCode);
  if (!row) return { status: "expired" };
  if (row.userId) return { status: "approved" };
  return { status: row.expiresAt <= nowIso() ? "expired" : "pending" };
}

/**
 * Nguoi dung da dang nhap duyet ma: tao token voi dung hash CLI da gui. Token
 * chi co scope `api:full`; secret van chi nam o may CLI.
 */
export async function approveCliAuth(
  repo: GameRepository,
  userId: string,
  userCode: string,
): Promise<ApiCliAuthApproved> {
  const now = nowIso();
  const row = await repo.deviceCodes.findByUserCode(
    normalizeUserCode(userCode),
  );
  if (!row || row.expiresAt <= now) throw new NotFoundError();
  if (row.userId) throw new BadRequestError("code_already_used");

  // Duyet truoc khi tao token de hai request song song khong tao hai token.
  if (!(await repo.deviceCodes.approve(row.id, userId, now))) {
    throw new BadRequestError("code_already_used");
  }
  await insertMcpToken(repo, userId, {
    name: row.name,
    tokenHash: row.tokenHash,
    tokenPrefix: row.tokenPrefix,
    scopes: ["api:full"],
    expiresInDays: null,
  });
  return { name: row.name };
}
