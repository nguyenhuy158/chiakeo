import type { ExpenseShuttleInput } from "../../../../shared/schemas";
import {
  computeShuttleStock,
  SHUTTLE_CATEGORY_ID,
  shuttleStockError,
} from "../../../../shared/shuttles";
import { createId, nowIso } from "../../lib/ids";
import type { GameRepository } from "../ports/game-repository";
import { BadRequestError, InvalidInputError } from "./errors";

export function carriesShuttle(kind: string, category: string) {
  return kind === "expense" && category === SHUTTLE_CATEGORY_ID;
}

export async function findExpenseShuttle(
  repo: GameRepository,
  expenseId: string,
): Promise<ExpenseShuttleInput | null> {
  const [entry] = await repo.shuttleEntries.listByExpenseIds([expenseId]);
  return entry ? { tubeId: entry.tubeId, quantity: -entry.delta } : null;
}

export async function assertShuttleStock(
  repo: GameRepository,
  ownerUserId: string,
  link: ExpenseShuttleInput,
  excludeExpenseId?: string,
) {
  const tube = await repo.shuttleTubes.getOwned(link.tubeId, ownerUserId);
  if (!tube) throw new InvalidInputError();

  const rows = await repo.shuttleEntries.listByTube(tube.id);
  const stockWithoutExpense = computeShuttleStock(
    rows.filter((row) => row.expenseId !== excludeExpenseId),
  );
  const error = shuttleStockError(stockWithoutExpense - link.quantity);
  if (error) throw new BadRequestError(error);
}

export async function writeExpenseShuttle(
  repo: GameRepository,
  ownerUserId: string,
  expenseId: string,
  link: ExpenseShuttleInput | null,
) {
  await repo.shuttleEntries.deleteByExpense(expenseId);
  if (!link) return;

  await repo.shuttleEntries.insert({
    id: createId("shuttle"),
    ownerUserId,
    tubeId: link.tubeId,
    expenseId,
    kind: "use",
    delta: -link.quantity,
    note: "",
    createdAt: nowIso(),
  });
}
