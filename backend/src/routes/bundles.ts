import { Hono } from "hono";
import {
  bundleInputSchema,
  bundleSettleInputSchema,
} from "../../../shared/schemas";
import {
  createBundle,
  deleteBundle,
  getBundle,
  listBundles,
  settleBundle,
} from "../core/application/bundles";
import { invalidInput, readJson, respond } from "../lib/http";
import { type AuthedEnv, protectPaths } from "../lib/require-user";

export const bundlesRouter = new Hono<AuthedEnv>();

protectPaths(bundlesRouter, "/bundles", "/bundles/*");

bundlesRouter.get("/bundles", (c) =>
  respond(c, () => listBundles(c.get("repo"), c.get("userId"))),
);

bundlesRouter.post("/bundles", async (c) => {
  const input = await readJson(c, bundleInputSchema);
  if (!input) return invalidInput(c);
  return respond(c, () => createBundle(c.get("repo"), c.get("userId"), input));
});

bundlesRouter.get("/bundles/:bundleId", (c) =>
  respond(c, () =>
    getBundle(c.get("repo"), c.get("userId"), c.req.param("bundleId")),
  ),
);

bundlesRouter.post("/bundles/:bundleId/settle", async (c) => {
  const input = await readJson(c, bundleSettleInputSchema);
  if (!input) return invalidInput(c);
  return respond(c, () =>
    settleBundle(
      c.get("repo"),
      c.get("userId"),
      c.req.param("bundleId"),
      input,
    ),
  );
});

bundlesRouter.delete("/bundles/:bundleId", (c) =>
  respond(c, () =>
    deleteBundle(c.get("repo"), c.get("userId"), c.req.param("bundleId")),
  ),
);
