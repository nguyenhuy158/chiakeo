import { describe, expect, it } from "vitest";
import {
  createBundle,
  deleteBundle,
  getBundle,
  listBundles,
  settleBundle,
} from "./bundles";
import { InvalidInputError, NotFoundError } from "./errors";
import {
  createFakeRepo,
  FAKE_OWNER,
  gameRow,
  participantRow,
} from "./fake-game-repository";

const NOW = "2026-08-01T00:00:00.000Z";

function seedGame(
  gameId: string,
  hostId: string,
  guestId: string,
  guest: string,
) {
  return {
    game: gameRow({
      id: gameId,
      code: gameId.toUpperCase(),
      name: gameId,
      settlementMode: "pick",
      settlementHostId: hostId,
    }),
    participants: [
      participantRow(hostId, "Huy", { gameId }),
      participantRow(guestId, guest, { gameId }),
    ],
    expense: {
      id: `${gameId}_e`,
      gameId,
      payerParticipantId: hostId,
      kind: "expense",
      category: "",
      title: "San",
      amount: 200_000,
      note: "",
      splitMode: "amount",
      excluded: false,
      sequence: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
    splits: [hostId, guestId].map((participantId) => ({
      expenseId: `${gameId}_e`,
      participantId,
      amount: 100_000,
      weight: null,
    })),
  };
}

function setup() {
  const one = seedGame("g1", "h1", "n1", "Nam");
  const two = seedGame("g2", "h2", "n2", "nam");
  return createFakeRepo({
    games: [one.game, two.game],
    participants: [...one.participants, ...two.participants],
    expenses: [one.expense, two.expense],
    splits: [...one.splits, ...two.splits],
  });
}

describe("bundles", () => {
  it("gop khoan no cung mot nguoi qua cac cuoc con", async () => {
    const { repo } = setup();
    const bundle = await createBundle(repo, FAKE_OWNER, {
      name: "Thang 8",
      gameIds: ["g1", "g2"],
    });

    expect(bundle.people).toHaveLength(1);
    expect(bundle.people[0]).toMatchObject({ name: "Nam", total: 200_000 });
    expect(bundle.people[0].debts.map((debt) => debt.gameId)).toEqual([
      "g1",
      "g2",
    ]);
  });

  it("tra o cuoc cha ghi nhan o ca hai cuoc con", async () => {
    const { repo, state } = setup();
    const bundle = await createBundle(repo, FAKE_OWNER, {
      name: "Thang 8",
      gameIds: ["g1", "g2"],
    });

    const after = await settleBundle(repo, FAKE_OWNER, bundle.id, {
      names: ["NAM"],
    });

    expect(after.people).toEqual([]);
    const transfers = state.expenses.filter((row) => row.kind === "transfer");
    expect(transfers.map((row) => [row.gameId, row.amount])).toEqual([
      ["g1", 100_000],
      ["g2", 100_000],
    ]);
  });

  it("tra o mot cuoc con thi cuoc cha chi con khoan cua cuoc kia", async () => {
    const { repo } = setup();
    const bundle = await createBundle(repo, FAKE_OWNER, {
      name: "Thang 8",
      gameIds: ["g1", "g2"],
    });
    const { recordTransfer } = await import("./expenses");
    await recordTransfer(repo, FAKE_OWNER, "g1", {
      fromParticipantId: "n1",
      toParticipantId: "h1",
      amount: 100_000,
      note: "",
    });

    const detail = await getBundle(repo, FAKE_OWNER, bundle.id);
    expect(detail.people[0].total).toBe(100_000);
    expect(detail.people[0].debts.map((debt) => debt.gameId)).toEqual(["g2"]);
  });

  it("xep nguoi no bang nhau theo ten", async () => {
    const { repo, state } = setup();
    for (const [gameId, hostId, anId] of [
      ["g1", "h1", "a1"],
      ["g2", "h2", "a2"],
    ]) {
      state.participants.push(participantRow(anId, "An", { gameId }));
      state.expenses.push({
        ...state.expenses[0],
        id: `${gameId}_an`,
        gameId,
        payerParticipantId: hostId,
        amount: 100_000,
      });
      state.splits.push({
        expenseId: `${gameId}_an`,
        participantId: anId,
        amount: 100_000,
        weight: null,
      });
    }
    const bundle = await createBundle(repo, FAKE_OWNER, {
      name: "Thang 8",
      gameIds: ["g1", "g2"],
    });
    expect(bundle.people.map((person) => person.name)).toEqual(["An", "Nam"]);
  });

  it("tu choi chon nguoi khong con no", async () => {
    const { repo } = setup();
    const bundle = await createBundle(repo, FAKE_OWNER, {
      name: "Thang 8",
      gameIds: ["g1", "g2"],
    });
    await expect(
      settleBundle(repo, FAKE_OWNER, bundle.id, { names: ["Khong ai"] }),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("can it nhat hai cuoc va cuoc phai la cua minh", async () => {
    const { repo } = setup();
    await expect(
      createBundle(repo, FAKE_OWNER, { name: "A", gameIds: ["g1", "g1"] }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(
      createBundle(repo, FAKE_OWNER, { name: "A", gameIds: ["g1", "x"] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createBundle(repo, "other", { name: "A", gameIds: ["g1", "g2"] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("liet ke va xoa cuoc cha, chi chu moi thay", async () => {
    const { repo } = setup();
    const bundle = await createBundle(repo, FAKE_OWNER, {
      name: "Thang 8",
      gameIds: ["g1", "g2"],
    });

    expect(await listBundles(repo, FAKE_OWNER)).toMatchObject([
      { id: bundle.id, gameCount: 2 },
    ]);
    expect(await listBundles(repo, "other")).toEqual([]);
    await expect(deleteBundle(repo, "other", bundle.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await deleteBundle(repo, FAKE_OWNER, bundle.id);
    expect(await listBundles(repo, FAKE_OWNER)).toEqual([]);
  });
});
