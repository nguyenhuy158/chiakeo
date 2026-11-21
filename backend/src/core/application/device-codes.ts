import type {
  ApiDeviceApproved,
  ApiDeviceCode,
  ApiDeviceToken,
} from "../../../../shared/api-types";
import {
  DEVICE_GRANT_TYPE,
  DEVICE_USER_CODE_LENGTH,
} from "../../../../shared/schemas";
import { nowIso } from "../../lib/ids";
import type { GameRepository } from "../ports/game-repository";
import { BadRequestError, NotFoundError } from "./errors";
import { createMcpToken } from "./mcp-tokens";

const DEVICE_CODE_BYTES = 32;
const DEVICE_CODE_TTL_SECONDS = 600;
const POLL_INTERVAL_SECONDS = 5;
const MILLISECONDS_PER_SECOND = 1000;
const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const USER_CODE_GROUP = DEVICE_USER_CODE_LENGTH / 2;
const TOKEN_SCOPE = "api:full";
const KEY_CONTEXT = "chiakeo-device-token";
const IV_BYTES = 12;

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function randomHex(bytes: number) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256Hex(value: string) {
  return toHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}

async function importKey(secret: string) {
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${secret}:${KEY_CONTEXT}`),
  );
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptToken(secret: string, token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await importKey(secret),
      new TextEncoder().encode(token),
    ),
  );
  return btoa(String.fromCharCode(...iv, ...cipher));
}

async function decryptToken(secret: string, encrypted: string) {
  const bytes = Uint8Array.from(atob(encrypted), (char) => char.charCodeAt(0));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, IV_BYTES) },
    await importKey(secret),
    bytes.slice(IV_BYTES),
  );
  return new TextDecoder().decode(plain);
}

function generateUserCode() {
  const picked = Array.from(
    crypto.getRandomValues(new Uint8Array(DEVICE_USER_CODE_LENGTH)),
    (byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length],
  ).join("");
  return `${picked.slice(0, USER_CODE_GROUP)}-${picked.slice(USER_CODE_GROUP)}`;
}

function normalizeUserCode(raw: string) {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${compact.slice(0, USER_CODE_GROUP)}-${compact.slice(USER_CODE_GROUP)}`;
}

export async function startDeviceFlow(
  repo: GameRepository,
  input: { name: string },
  origin: string,
): Promise<ApiDeviceCode> {
  const now = nowIso();
  await repo.deviceCodes.deleteExpired(now);

  const deviceCode = randomHex(DEVICE_CODE_BYTES);
  const userCode = generateUserCode();
  await repo.deviceCodes.insert({
    id: await sha256Hex(deviceCode),
    userCode,
    name: input.name,
    createdAt: now,
    expiresAt: new Date(
      Date.parse(now) + DEVICE_CODE_TTL_SECONDS * MILLISECONDS_PER_SECOND,
    ).toISOString(),
    userId: null,
    approvedAt: null,
    encryptedToken: null,
    lastPolledAt: null,
  });

  const verificationUri = `${origin}/login/device`;
  return {
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: `${verificationUri}?user_code=${userCode}`,
    expires_in: DEVICE_CODE_TTL_SECONDS,
    interval: POLL_INTERVAL_SECONDS,
  };
}

/**
 * Loi theo RFC 8628 muc 3.5: authorization_pending, slow_down, expired_token.
 * Tra token dung mot lan roi xoa dong.
 */
export async function pollDeviceFlow(
  repo: GameRepository,
  input: { device_code: string; grant_type: string },
  encryptionSecret: string,
): Promise<ApiDeviceToken> {
  if (input.grant_type !== DEVICE_GRANT_TYPE) {
    throw new BadRequestError("unsupported_grant_type");
  }

  const now = nowIso();
  const id = await sha256Hex(input.device_code);
  const row = await repo.deviceCodes.findById(id);
  if (!row || row.expiresAt <= now) throw new BadRequestError("expired_token");

  if (row.encryptedToken) {
    const token = await decryptToken(encryptionSecret, row.encryptedToken);
    await repo.deviceCodes.delete(id);
    return { access_token: token, token_type: "bearer", scope: TOKEN_SCOPE };
  }

  const tooFast =
    row.lastPolledAt !== null &&
    Date.parse(now) - Date.parse(row.lastPolledAt) <
      POLL_INTERVAL_SECONDS * MILLISECONDS_PER_SECOND;
  await repo.deviceCodes.markPolled(id, now);
  throw new BadRequestError(tooFast ? "slow_down" : "authorization_pending");
}

/**
 * Nguoi dung da dang nhap duyet ma: tao token `api:full` roi cat dang ma hoa
 * cho CLI lay o lan hoi tiep theo.
 */
export async function approveDeviceFlow(
  repo: GameRepository,
  userId: string,
  userCode: string,
  encryptionSecret: string,
): Promise<ApiDeviceApproved> {
  const now = nowIso();
  const row = await repo.deviceCodes.findByUserCode(
    normalizeUserCode(userCode),
  );
  if (!row || row.expiresAt <= now) throw new NotFoundError();
  if (row.userId) throw new BadRequestError("code_already_used");

  // Tao token truoc de loi "qua nhieu token" khong lam hong ma; duyet sau cung
  // de hai request song song chi mot cai thang (token thua bi thu hoi o duoi).
  const { token, secret } = await createMcpToken(repo, userId, {
    name: row.name,
    scopes: [TOKEN_SCOPE],
    expiresInDays: null,
  });
  const encrypted = await encryptToken(encryptionSecret, secret);
  if (!(await repo.deviceCodes.approve(row.id, userId, encrypted, now))) {
    await repo.mcpTokens.revoke(token.id, userId, now);
    throw new BadRequestError("code_already_used");
  }
  return { name: row.name };
}
