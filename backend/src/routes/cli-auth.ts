import { Hono, type MiddlewareHandler } from "hono";
import {
  cliAuthApproveInputSchema,
  cliAuthPollInputSchema,
  cliAuthStartInputSchema,
} from "../../../shared/schemas";
import { createGameRepository, createDb } from "../adapters/d1/game-repository";
import {
  approveCliAuth,
  pollCliAuth,
  startCliAuth,
} from "../core/application/device-codes";
import { invalidInput, readJson, respond } from "../lib/http";
import { type AuthedEnv, requireSessionUser } from "../lib/require-user";

/**
 * Dang nhap CLI kieu device code. `start` va `poll` la public vi CLI chua co
 * danh tinh; `approve` can phien web that (khong nhan token CLI).
 */
export const cliAuthRouter = new Hono<AuthedEnv>();

/** start/poll la public nen khong qua requireUser: tu cam repo o day. */
const attachRepo: MiddlewareHandler<AuthedEnv> = async (c, next) => {
  c.set("repo", createGameRepository(createDb(c.env)));
  await next();
};

cliAuthRouter.use("/cli-auth/start", attachRepo);
cliAuthRouter.use("/cli-auth/poll", attachRepo);
cliAuthRouter.use("/cli-auth/approve", requireSessionUser);

cliAuthRouter.post("/cli-auth/start", async (c) => {
  const input = await readJson(c, cliAuthStartInputSchema);
  if (!input) return invalidInput(c);

  return respond(
    c,
    () => startCliAuth(c.get("repo"), input, new URL(c.req.url).origin),
    201,
  );
});

cliAuthRouter.post("/cli-auth/poll", async (c) => {
  const input = await readJson(c, cliAuthPollInputSchema);
  if (!input) return invalidInput(c);

  return respond(c, () => pollCliAuth(c.get("repo"), input.deviceCode));
});

cliAuthRouter.post("/cli-auth/approve", async (c) => {
  const input = await readJson(c, cliAuthApproveInputSchema);
  if (!input) return invalidInput(c);

  return respond(c, () =>
    approveCliAuth(c.get("repo"), c.get("userId"), input.userCode),
  );
});
