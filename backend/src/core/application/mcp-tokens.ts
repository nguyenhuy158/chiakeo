import type {
  ApiCreatedMcpToken,
  ApiMcpToken,
} from "../../../../shared/api-types";
import {
  MAX_MCP_TOKENS_PER_USER,
  MCP_SCOPES,
  type McpScope,
  type McpTokenInput,
} from "../../../../shared/schemas";
import { createId, nowIso } from "../../lib/ids";
import type { GameRepository, McpTokenRow } from "../ports/game-repository";
import { BadRequestError, NotFoundError } from "./errors";

/** Tien to de nhan ra token cua app nay khi no lo ra trong log hay config. */
const TOKEN_PREFIX = "ck_";
const TOKEN_BYTES = 32;
/** So ky tu hien trong danh sach, du de doi chieu ma khong doan ra phan con lai. */
const VISIBLE_PREFIX_LENGTH = TOKEN_PREFIX.length + 6;
const MS_PER_DAY = 86_400_000;

export type McpIdentity = {
  tokenId: string;
  userId: string;
  scopes: McpScope[];
};

function generateSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  const body = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${TOKEN_PREFIX}${body}`;
}

/**
 * SHA-256 hex. Khong can salt/KDF: token la 32 byte ngau nhien nen khong the
 * do nguoc, khac han mat khau nguoi dung tu chon.
 */
export async function hashMcpToken(secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Bo scope la trong DB thi bi loai: quyen chi den tu danh sach da biet. */
function parseScopes(raw: string): McpScope[] {
  const known = new Set<string>(MCP_SCOPES);
  return raw
    .split(" ")
    .map((scope) => scope.trim())
    .filter((scope): scope is McpScope => known.has(scope));
}

function isActive(row: McpTokenRow, now: string) {
  if (row.revokedAt) return false;
  return !(row.expiresAt && row.expiresAt <= now);
}

function toApiToken(row: McpTokenRow, now: string): ApiMcpToken {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes: parseScopes(row.scopes),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    active: isActive(row, now),
  };
}

export async function listMcpTokens(
  repo: GameRepository,
  userId: string,
): Promise<ApiMcpToken[]> {
  const now = nowIso();
  const rows = await repo.mcpTokens.listByUser(userId);
  return rows.map((row) => toApiToken(row, now));
}

/**
 * Ghi mot token da biet hash. Dung chung cho tao token tren web (server sinh
 * secret) va dang nhap CLI (CLI tu sinh secret, chi gui hash len).
 */
export async function insertMcpToken(
  repo: GameRepository,
  userId: string,
  token: {
    name: string;
    tokenHash: string;
    tokenPrefix: string;
    scopes: McpScope[];
    expiresInDays: number | null;
  },
): Promise<ApiMcpToken> {
  const activeCount = await repo.mcpTokens.countActiveByUser(userId);
  if (activeCount >= MAX_MCP_TOKENS_PER_USER) {
    throw new BadRequestError("too_many_mcp_tokens");
  }

  const now = nowIso();
  const row: McpTokenRow = {
    id: createId("mcptok"),
    userId,
    name: token.name,
    tokenHash: token.tokenHash,
    tokenPrefix: token.tokenPrefix,
    // Bo scope trung de "games:read games:read" khong thanh hai quyen.
    scopes: [...new Set(token.scopes)].join(" "),
    createdAt: now,
    lastUsedAt: null,
    expiresAt: token.expiresInDays
      ? new Date(
          Date.parse(now) + token.expiresInDays * MS_PER_DAY,
        ).toISOString()
      : null,
    revokedAt: null,
  };

  await repo.mcpTokens.insert(row);
  return toApiToken(row, now);
}

export async function createMcpToken(
  repo: GameRepository,
  userId: string,
  input: McpTokenInput,
): Promise<ApiCreatedMcpToken> {
  const secret = generateSecret();
  const token = await insertMcpToken(repo, userId, {
    name: input.name,
    tokenHash: await hashMcpToken(secret),
    tokenPrefix: secret.slice(0, VISIBLE_PREFIX_LENGTH),
    scopes: input.scopes,
    expiresInDays: input.expiresInDays ?? null,
  });
  return { token, secret };
}

export async function revokeMcpToken(
  repo: GameRepository,
  userId: string,
  tokenId: string,
): Promise<{ ok: true }> {
  const revoked = await repo.mcpTokens.revoke(tokenId, userId, nowIso());
  if (!revoked) throw new NotFoundError();
  return { ok: true };
}

/**
 * Doi token goc thanh danh tinh goi MCP. Tra ve null cho moi truong hop tu
 * choi (sai, thu hoi, het han, khong con scope nao) de tang tren chi noi
 * "unauthorized" - khong he ro token sai o dau.
 */
export async function authenticateMcpToken(
  repo: GameRepository,
  secret: string,
): Promise<McpIdentity | null> {
  if (!secret.startsWith(TOKEN_PREFIX)) return null;

  const row = await repo.mcpTokens.findByHash(await hashMcpToken(secret));
  if (!row || !isActive(row, nowIso())) return null;

  const scopes = parseScopes(row.scopes);
  if (scopes.length === 0) return null;

  return { tokenId: row.id, userId: row.userId, scopes };
}
