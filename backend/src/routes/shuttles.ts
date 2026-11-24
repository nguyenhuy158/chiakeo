import { Hono } from "hono";
import {
  shuttleEntryInputSchema,
  shuttleTubeInputSchema,
  shuttleTubeUpdateSchema,
} from "../../../shared/schemas";
import {
  createShuttleEntry,
  createShuttleTube,
  deleteShuttleEntry,
  deleteShuttleTube,
  listShuttleTubes,
  updateShuttleTube,
} from "../core/application/shuttles";
import { invalidInput, readJson, respond } from "../lib/http";
import { type AuthedEnv, protectPaths } from "../lib/require-user";

/** Kho cau cua chinh minh; luon can dang nhap. */
export const shuttlesRouter = new Hono<AuthedEnv>();

protectPaths(shuttlesRouter, "/shuttles", "/shuttles/*");

shuttlesRouter.get("/shuttles", (c) =>
  respond(c, () => listShuttleTubes(c.get("repo"), c.get("userId"))),
);

shuttlesRouter.post("/shuttles/tubes", async (c) => {
  const input = await readJson(c, shuttleTubeInputSchema);
  if (!input) return invalidInput(c);

  return respond(
    c,
    () => createShuttleTube(c.get("repo"), c.get("userId"), input),
    201,
  );
});

shuttlesRouter.patch("/shuttles/tubes/:tubeId", async (c) => {
  const input = await readJson(c, shuttleTubeUpdateSchema);
  if (!input) return invalidInput(c);

  return respond(c, () =>
    updateShuttleTube(
      c.get("repo"),
      c.get("userId"),
      c.req.param("tubeId"),
      input,
    ),
  );
});

shuttlesRouter.delete("/shuttles/tubes/:tubeId", (c) =>
  respond(c, () =>
    deleteShuttleTube(c.get("repo"), c.get("userId"), c.req.param("tubeId")),
  ),
);

shuttlesRouter.post("/shuttles/tubes/:tubeId/entries", async (c) => {
  const input = await readJson(c, shuttleEntryInputSchema);
  if (!input) return invalidInput(c);

  return respond(c, () =>
    createShuttleEntry(
      c.get("repo"),
      c.get("userId"),
      c.req.param("tubeId"),
      input,
    ),
  );
});

shuttlesRouter.delete("/shuttles/entries/:entryId", (c) =>
  respond(c, () =>
    deleteShuttleEntry(c.get("repo"), c.get("userId"), c.req.param("entryId")),
  ),
);
