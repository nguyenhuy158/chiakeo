import type {
  ApiShuttleEntry,
  ApiShuttleStock,
  ApiShuttleTube,
  ApiShuttleTubes,
} from "../../../../shared/api-types";
import type {
  ShuttleEntryInput,
  ShuttleTubeCreate,
  ShuttleTubeUpdateInput,
} from "../../../../shared/schemas";
import {
  computeShuttleStock,
  DEFAULT_TUBE_QUANTITY,
  defaultShuttlePrice,
  LEGACY_TUBE_NAME,
  SHUTTLE_ENTRY_LIST_LIMIT,
  type ShuttleEntryKind,
  shuttleDelta,
  shuttleStockError,
} from "../../../../shared/shuttles";
import { createId, nowIso } from "../../lib/ids";
import type {
  GameRepository,
  ShuttleEntryRow,
  ShuttleTubeRow,
  ShuttleTubeUpdate,
} from "../ports/game-repository";
import { BadRequestError, InvalidInputError, NotFoundError } from "./errors";

export const SHUTTLE_ENTRY_LINKED_ERROR = "shuttle_entry_linked_to_expense";

function toStockView(rows: ShuttleEntryRow[]): ApiShuttleStock {
  const entries: ApiShuttleEntry[] = [];
  let running = 0;

  for (const row of rows) {
    running += row.delta;
    entries.push({
      id: row.id,
      kind: row.kind as ShuttleEntryKind,
      delta: row.delta,
      stockAfter: running,
      note: row.note,
      expenseId: row.expenseId,
      createdAt: row.createdAt,
    });
  }

  return {
    stock: running,
    entries: entries.reverse().slice(0, SHUTTLE_ENTRY_LIST_LIMIT),
  };
}

function toTubeView(
  tube: ShuttleTubeRow,
  rows: ShuttleEntryRow[],
): ApiShuttleTube {
  return {
    id: tube.id,
    name: tube.name,
    tubePrice: tube.tubePrice,
    shuttlePrice: tube.shuttlePrice,
    initialQuantity: tube.initialQuantity,
    createdAt: tube.createdAt,
    ...toStockView(rows),
  };
}

export async function listShuttleTubes(
  repo: GameRepository,
  userId: string,
): Promise<ApiShuttleTubes> {
  const [tubes, rows] = await Promise.all([
    repo.shuttleTubes.listByOwner(userId),
    repo.shuttleEntries.listByOwner(userId),
  ]);

  return {
    ...toStockView(rows),
    tubes: tubes.map((tube) =>
      toTubeView(
        tube,
        rows.filter((row) => row.tubeId === tube.id),
      ),
    ),
  };
}

async function requireOwnedTube(
  repo: GameRepository,
  userId: string,
  tubeId: string,
) {
  const tube = await repo.shuttleTubes.getOwned(tubeId, userId);
  if (!tube) throw new NotFoundError();
  return tube;
}

export async function createShuttleTube(
  repo: GameRepository,
  userId: string,
  input: ShuttleTubeCreate,
): Promise<ApiShuttleTubes> {
  const now = nowIso();
  const { tubePrice, initialQuantity } = input;
  const tube: ShuttleTubeRow = {
    id: createId("tube"),
    ownerUserId: userId,
    name: input.name,
    tubePrice,
    shuttlePrice:
      input.shuttlePrice ?? defaultShuttlePrice(tubePrice, initialQuantity),
    initialQuantity,
    createdAt: now,
  };

  await repo.shuttleTubes.insert(tube);
  await repo.shuttleEntries.insert({
    id: createId("shuttle"),
    ownerUserId: userId,
    tubeId: tube.id,
    expenseId: null,
    kind: "add",
    delta: initialQuantity,
    note: "",
    createdAt: now,
  });

  return listShuttleTubes(repo, userId);
}

export async function updateShuttleTube(
  repo: GameRepository,
  userId: string,
  tubeId: string,
  input: ShuttleTubeUpdateInput,
): Promise<ApiShuttleTubes> {
  const tube = await requireOwnedTube(repo, userId, tubeId);

  const fields: ShuttleTubeUpdate = { ...input };
  if (input.tubePrice !== undefined && input.shuttlePrice === undefined) {
    fields.shuttlePrice = defaultShuttlePrice(
      input.tubePrice,
      input.initialQuantity ?? tube.initialQuantity,
    );
  }
  if (Object.keys(fields).length === 0) throw new InvalidInputError();

  await repo.shuttleTubes.update(tube.id, fields);
  return listShuttleTubes(repo, userId);
}

export async function deleteShuttleTube(
  repo: GameRepository,
  userId: string,
  tubeId: string,
): Promise<ApiShuttleTubes> {
  const tube = await requireOwnedTube(repo, userId, tubeId);
  await repo.shuttleTubes.delete(tube.id);
  return listShuttleTubes(repo, userId);
}

export async function createShuttleEntry(
  repo: GameRepository,
  userId: string,
  tubeId: string,
  input: ShuttleEntryInput,
): Promise<ApiShuttleTubes> {
  const tube = await requireOwnedTube(repo, userId, tubeId);
  const rows = await repo.shuttleEntries.listByTube(tube.id);
  const stock = computeShuttleStock(rows);
  const delta = shuttleDelta(input.kind, input.quantity, stock);

  const error = shuttleStockError(stock + delta);
  if (error) throw new BadRequestError(error);

  if (delta !== 0) {
    await repo.shuttleEntries.insert({
      id: createId("shuttle"),
      ownerUserId: userId,
      tubeId: tube.id,
      expenseId: null,
      kind: input.kind,
      delta,
      note: input.note?.trim() || "",
      createdAt: nowIso(),
    });
  }

  return listShuttleTubes(repo, userId);
}

export async function createLegacyShuttleEntry(
  repo: GameRepository,
  userId: string,
  input: ShuttleEntryInput,
): Promise<ApiShuttleTubes> {
  const tubes = await repo.shuttleTubes.listByOwner(userId);
  let firstTube = tubes.at(-1);
  if (!firstTube) {
    firstTube = {
      id: createId("tube"),
      ownerUserId: userId,
      name: LEGACY_TUBE_NAME,
      tubePrice: 0,
      shuttlePrice: 0,
      initialQuantity: DEFAULT_TUBE_QUANTITY,
      createdAt: nowIso(),
    };
    await repo.shuttleTubes.insert(firstTube);
  }
  return createShuttleEntry(repo, userId, firstTube.id, input);
}

export async function deleteShuttleEntry(
  repo: GameRepository,
  userId: string,
  entryId: string,
): Promise<ApiShuttleTubes> {
  const existing = await repo.shuttleEntries.getOwned(entryId, userId);
  if (!existing) throw new NotFoundError();
  if (existing.expenseId) throw new BadRequestError(SHUTTLE_ENTRY_LINKED_ERROR);

  const rows = await repo.shuttleEntries.listByTube(existing.tubeId);
  const error = shuttleStockError(
    computeShuttleStock(rows.filter((row) => row.id !== entryId)),
  );
  if (error) throw new BadRequestError(error);

  await repo.shuttleEntries.delete(entryId);
  return listShuttleTubes(repo, userId);
}
