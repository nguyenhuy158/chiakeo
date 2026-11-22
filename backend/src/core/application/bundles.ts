import type {
  ApiBundleDetail,
  ApiBundlePerson,
  ApiBundleSummary,
} from "../../../../shared/api-types";
import { normalizeContactName } from "../../../../shared/contacts";
import { listDueTransfers } from "../../../../shared/payments";
import type {
  BundleInput,
  BundleSettleInput,
} from "../../../../shared/schemas";
import { createId, nowIso } from "../../lib/ids";
import type {
  BundleRow,
  GameRepository,
  GameRow,
} from "../ports/game-repository";
import { InvalidInputError, NotFoundError } from "./errors";
import { insertTransfer } from "./expenses";
import { getOwnedGame, loadGameDetail, loadShareView } from "./game-detail";

type DueDebt = {
  game: GameRow;
  debtorKey: string;
  debtorName: string;
  fromParticipantId: string;
  toParticipantId: string;
  toName: string;
  amount: number;
};

async function getOwnedBundle(
  repo: GameRepository,
  userId: string,
  bundleId: string,
): Promise<BundleRow> {
  const bundle = await repo.bundles.getById(bundleId);
  if (!bundle || bundle.ownerUserId !== userId) throw new NotFoundError();
  return bundle;
}

async function loadBundleGames(
  repo: GameRepository,
  userId: string,
  bundle: BundleRow,
) {
  const games = await Promise.all(
    bundle.gameIds.map((gameId) => getOwnedGame(repo, gameId, userId)),
  );
  return games.filter((game): game is GameRow => game !== null);
}

async function listDueDebts(
  repo: GameRepository,
  games: GameRow[],
): Promise<DueDebt[]> {
  const perGame = await Promise.all(
    games.map(async (game) => {
      const view = await loadShareView(repo, game);
      const nameById = new Map(
        view.participants.map((person) => [person.id, person.name]),
      );
      return listDueTransfers(
        view.summary,
        view.settlementMode,
        view.settlementHostId,
      ).map((row) => {
        const debtorName = nameById.get(row.fromParticipantId) as string;
        return {
          game,
          debtorKey: normalizeContactName(debtorName),
          debtorName,
          fromParticipantId: row.fromParticipantId,
          toParticipantId: row.toParticipantId,
          toName: nameById.get(row.toParticipantId) as string,
          amount: row.amount,
        };
      });
    }),
  );
  return perGame.flat();
}

async function buildDetail(
  repo: GameRepository,
  userId: string,
  bundle: BundleRow,
): Promise<ApiBundleDetail> {
  const games = await loadBundleGames(repo, userId, bundle);
  const debts = await listDueDebts(repo, games);

  const byKey = new Map<string, ApiBundlePerson>();
  for (const debt of debts) {
    const person = byKey.get(debt.debtorKey) || {
      name: debt.debtorName,
      total: 0,
      debts: [],
    };
    person.total += debt.amount;
    person.debts.push({
      gameId: debt.game.id,
      gameName: debt.game.name,
      toName: debt.toName,
      amount: debt.amount,
    });
    byKey.set(debt.debtorKey, person);
  }

  return {
    id: bundle.id,
    name: bundle.name,
    games: games.map(({ id, code, name }) => ({ id, code, name })),
    people: [...byKey.values()].sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi"),
    ),
  };
}

export async function createBundle(
  repo: GameRepository,
  userId: string,
  input: BundleInput,
): Promise<ApiBundleDetail> {
  const gameIds = [...new Set(input.gameIds)];
  const games = await Promise.all(
    gameIds.map((gameId) => getOwnedGame(repo, gameId, userId)),
  );
  if (games.some((game) => game === null)) throw new NotFoundError();
  if (gameIds.length < 2) throw new InvalidInputError();

  const row: BundleRow = {
    id: createId("bundle"),
    ownerUserId: userId,
    name: input.name,
    createdAt: nowIso(),
    gameIds,
  };
  await repo.bundles.insert(row);
  return buildDetail(repo, userId, row);
}

export async function listBundles(
  repo: GameRepository,
  userId: string,
): Promise<ApiBundleSummary[]> {
  const rows = await repo.bundles.listByOwner(userId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    gameCount: row.gameIds.length,
  }));
}

export async function getBundle(
  repo: GameRepository,
  userId: string,
  bundleId: string,
) {
  return buildDetail(
    repo,
    userId,
    await getOwnedBundle(repo, userId, bundleId),
  );
}

/**
 * Ghi nhan "da tra" cho moi khoan no cua nhung nguoi duoc chon, o TUNG cuoc
 * con. Khong luu so du rieng o cuoc cha: cuoc cha luon doc lai tu cac cuoc
 * con, nen tra o cha hay o con deu thay ca hai ben.
 */
export async function settleBundle(
  repo: GameRepository,
  userId: string,
  bundleId: string,
  input: BundleSettleInput,
) {
  const bundle = await getOwnedBundle(repo, userId, bundleId);
  const games = await loadBundleGames(repo, userId, bundle);
  const keys = new Set(input.names.map(normalizeContactName));
  const debts = (await listDueDebts(repo, games)).filter((debt) =>
    keys.has(debt.debtorKey),
  );
  if (debts.length === 0) throw new InvalidInputError();

  for (const debt of debts) {
    await insertTransfer(repo, debt.game.id, {
      fromParticipantId: debt.fromParticipantId,
      toParticipantId: debt.toParticipantId,
      amount: debt.amount,
      note: "",
    });
  }
  for (const game of new Set(debts.map((debt) => debt.game))) {
    await loadGameDetail(repo, game, userId);
  }
  return buildDetail(repo, userId, bundle);
}

export async function deleteBundle(
  repo: GameRepository,
  userId: string,
  bundleId: string,
) {
  await getOwnedBundle(repo, userId, bundleId);
  await repo.bundles.delete(bundleId);
  return { ok: true };
}
