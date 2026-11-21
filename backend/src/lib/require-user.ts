import type { Hono, MiddlewareHandler } from "hono";
import { createDb, createGameRepository } from "../adapters/d1/game-repository";
import { createAuth } from "../auth";
import { authenticateMcpToken } from "../core/application/mcp-tokens";
import type { GameRepository } from "../core/ports/game-repository";
import type { Env } from "../env";
import { readSsoToken, verifySsoToken } from "../sso";
import { resolveSsoUserId } from "../sso-user";

export type AuthedEnv = {
  Bindings: Env;
  Variables: {
    userId: string;
    repo: GameRepository;
  };
};

/**
 * Composition root cho request da dang nhap: xac thuc session va cam adapter
 * D1 vao port GameRepository. Doi DB chi can doi adapter o day.
 */
/**
 * Gan `requireUser` cho dung cac path cua mot router.
 *
 * Khong dung `router.use("*", requireUser)`: sub-app duoc mount bang
 * `app.route("/api", router)` nen dau "*" phu len toan bo `/api/*`, ke ca route
 * cua router khac duoc mount sau. Lan truoc no da lam `/api/share/*` (public)
 * tra 401 khi router mcp-tokens duoc mount truoc router share.
 */
export function protectPaths(router: Hono<AuthedEnv>, ...paths: string[]) {
  for (const path of paths) router.use(path, requireUser);
}

const API_TOKEN_PREFIX = "ck_";

/**
 * Token `ck_...` co scope `api:full` (CLI) dung duoc nhu mot phien dang nhap.
 * Token chi doc cua MCP khong co scope nay nen bi tu choi o day.
 */
async function resolveApiTokenUserId(
  env: Env,
  request: Request,
): Promise<string | null> {
  const match = /^Bearer\s+(\S+)$/i.exec(
    request.headers.get("Authorization")?.trim() ?? "",
  );
  const secret = match?.[1];
  if (!secret?.startsWith(API_TOKEN_PREFIX)) return null;

  const identity = await authenticateMcpToken(
    createGameRepository(createDb(env)),
    secret,
  );
  return identity?.scopes.includes("api:full") ? identity.userId : null;
}

/**
 * Hai duong dang nhap chay song song. better-auth di truoc vi la duong cu va
 * doc session ngay trong D1 cua app; cookie SSO chi duoc hoi khi khong co
 * session nao — nguoi dang nhap bang username khong phai cho mot lan verify
 * chu ky thua moi request.
 *
 * Ca hai deu tra ve userId trong cung bang `user`, nen tang duoi (games,
 * contacts, preferences) khong can biet nguoi dung vao bang duong nao.
 */
export async function resolveUserId(
  env: Env,
  request: Request,
  options: { allowApiToken?: boolean } = {},
): Promise<string | null> {
  const auth = createAuth(env, request.url);
  const session = await auth.api.getSession({ headers: request.headers });
  if (session) return session.user.id;

  if (options.allowApiToken !== false) {
    const apiUserId = await resolveApiTokenUserId(env, request);
    if (apiUserId) return apiUserId;
  }

  const token = readSsoToken(request.headers);
  if (!token) return null;

  const claims = await verifySsoToken(token);
  if (!claims) return null;

  return resolveSsoUserId(createDb(env), claims);
}

function createRequireUser(
  allowApiToken: boolean,
): MiddlewareHandler<AuthedEnv> {
  return async (c, next) => {
    const userId = await resolveUserId(c.env, c.req.raw, { allowApiToken });
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }

    c.set("userId", userId);
    c.set("repo", createGameRepository(createDb(c.env)));
    await next();
  };
}

export const requireUser = createRequireUser(true);

/**
 * Chi nhan phien dang nhap that. Dung cho viec quan ly token: neu token CLI
 * tao duoc token moi thi mat mot token la mat luon quyen tao them.
 */
export const requireSessionUser = createRequireUser(false);
