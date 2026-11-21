import { Hono, type MiddlewareHandler } from "hono";
import {
  deviceUserCodeInputSchema,
  deviceCodeInputSchema,
  deviceTokenInputSchema,
} from "../../../shared/schemas";
import { createDb, createGameRepository } from "../adapters/d1/game-repository";
import {
  approveDeviceFlow,
  denyDeviceFlow,
  lookupDeviceFlow,
  pollDeviceFlow,
  startDeviceFlow,
} from "../core/application/device-codes";
import { badRequest, readJsonOrForm, respond } from "../lib/http";
import { type AuthedEnv, requireSessionUser } from "../lib/require-user";

const INVALID_REQUEST = "invalid_request";

/**
 * Dang nhap CLI theo device flow giong GitHub (RFC 8628). Hai endpoint dau la
 * public vi CLI chua co danh tinh; `approve` can phien web that va khong nhan
 * token CLI.
 */
export const loginDeviceRouter = new Hono<AuthedEnv>();

const attachRepo: MiddlewareHandler<AuthedEnv> = async (c, next) => {
  c.set("repo", createGameRepository(createDb(c.env)));
  await next();
};

const noStore: MiddlewareHandler<AuthedEnv> = async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
};

loginDeviceRouter.use("/login/device/code", attachRepo, noStore);
loginDeviceRouter.use("/login/oauth/access_token", attachRepo, noStore);
loginDeviceRouter.use("/login/device/lookup", requireSessionUser);
loginDeviceRouter.use("/login/device/approve", requireSessionUser);
loginDeviceRouter.use("/login/device/deny", requireSessionUser);

loginDeviceRouter.post("/login/device/code", async (c) => {
  const input = await readJsonOrForm(c, deviceCodeInputSchema);
  if (!input) return badRequest(c, INVALID_REQUEST);

  return respond(c, () =>
    startDeviceFlow(c.get("repo"), input, new URL(c.req.url).origin),
  );
});

loginDeviceRouter.post("/login/oauth/access_token", async (c) => {
  const input = await readJsonOrForm(c, deviceTokenInputSchema);
  if (!input) return badRequest(c, INVALID_REQUEST);

  return respond(c, () =>
    pollDeviceFlow(c.get("repo"), input, c.env.BETTER_AUTH_SECRET),
  );
});

loginDeviceRouter.post("/login/device/lookup", async (c) => {
  const input = await readJsonOrForm(c, deviceUserCodeInputSchema);
  if (!input) return badRequest(c, INVALID_REQUEST);

  return respond(c, () => lookupDeviceFlow(c.get("repo"), input.user_code));
});

loginDeviceRouter.post("/login/device/deny", async (c) => {
  const input = await readJsonOrForm(c, deviceUserCodeInputSchema);
  if (!input) return badRequest(c, INVALID_REQUEST);

  return respond(c, () => denyDeviceFlow(c.get("repo"), input.user_code));
});

loginDeviceRouter.post("/login/device/approve", async (c) => {
  const input = await readJsonOrForm(c, deviceUserCodeInputSchema);
  if (!input) return badRequest(c, INVALID_REQUEST);

  return respond(c, () =>
    approveDeviceFlow(
      c.get("repo"),
      c.get("userId"),
      input.user_code,
      c.env.BETTER_AUTH_SECRET,
    ),
  );
});
