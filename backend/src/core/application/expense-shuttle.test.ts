import { beforeEach, describe, expect, it } from "vitest";
import type { ExpenseInput } from "../../../../shared/schemas";
import { SHUTTLE_CATEGORY_ID } from "../../../../shared/shuttles";
import {
  addExpense,
  reallocateExpenses,
  removeExpense,
  updateExpense,
} from "./expenses";
import {
  createFakeRepo,
  FAKE_GAME_ID,
  FAKE_OWNER,
  gameRow,
  participantRow,
} from "./fake-game-repository";
import { loadShareView } from "./game-detail";
import { createShuttleTube } from "./shuttles";

const AN = "participant_an";
const BINH = "participant_binh";
const COLLABORATOR = "user_collaborator";
const SHUTTLE_PRICE = 30_000;

function expenseInput(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    kind: "expense",
    category: SHUTTLE_CATEGORY_ID,
    title: "Cầu",
    amount: 60_000,
    note: "",
    payerParticipantId: AN,
    splitMode: "equal",
    splitParticipantIds: [AN, BINH],
    splits: [],
    ...overrides,
  };
}

async function setup() {
  const fake = createFakeRepo({
    participants: [
      participantRow(AN, "An", { sequence: 0 }),
      participantRow(BINH, "Bình", { sequence: 1 }),
    ],
  });
  const view = await createShuttleTube(fake.repo, FAKE_OWNER, {
    name: "Ống A",
    tubePrice: 360_000,
    initialQuantity: 12,
  });
  const tubeId = view.tubes[0]!.id;
  return { ...fake, tubeId };
}

function stockOf(
  state: Awaited<ReturnType<typeof setup>>["state"],
  tubeId: string,
) {
  return state.shuttleEntries
    .filter((row) => row.tubeId === tubeId)
    .reduce((total, row) => total + row.delta, 0);
}

describe("shuttle expenses", () => {
  let fake: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    fake = await setup();
  });

  it("uses stock and exposes the link when an expense carries a tube", async () => {
    const detail = await addExpense(
      fake.repo,
      FAKE_OWNER,
      FAKE_GAME_ID,
      expenseInput({ shuttle: { tubeId: fake.tubeId, quantity: 2 } }),
    );

    expect(stockOf(fake.state, fake.tubeId)).toBe(10);
    const [expense] = fake.state.expenses;
    expect(fake.state.shuttleEntries.at(-1)).toMatchObject({
      expenseId: expense.id,
      kind: "use",
      delta: -2,
      ownerUserId: FAKE_OWNER,
    });
    expect(detail.expenses[0]?.shuttle).toEqual({
      tubeId: fake.tubeId,
      quantity: 2,
    });
  });

  it("keeps working for expenses without a tube", async () => {
    const detail = await addExpense(
      fake.repo,
      FAKE_OWNER,
      FAKE_GAME_ID,
      expenseInput({ shuttle: null }),
    );
    expect(detail.expenses[0]).not.toHaveProperty("shuttle");
    await addExpense(fake.repo, FAKE_OWNER, FAKE_GAME_ID, expenseInput());
    expect(stockOf(fake.state, fake.tubeId)).toBe(12);
  });

  it("rejects a tube on an expense that is not in the shuttle category", async () => {
    const link = { tubeId: fake.tubeId, quantity: 1 };
    await expect(
      addExpense(
        fake.repo,
        FAKE_OWNER,
        FAKE_GAME_ID,
        expenseInput({ category: "food", shuttle: link }),
      ),
    ).rejects.toThrow("invalid_input");
    await expect(
      addExpense(
        fake.repo,
        FAKE_OWNER,
        FAKE_GAME_ID,
        expenseInput({ kind: "income", shuttle: link }),
      ),
    ).rejects.toThrow("invalid_input");
    expect(fake.state.expenses).toHaveLength(0);
  });

  it("rejects an unknown tube and one that belongs to another user", async () => {
    await expect(
      addExpense(
        fake.repo,
        FAKE_OWNER,
        FAKE_GAME_ID,
        expenseInput({ shuttle: { tubeId: "missing", quantity: 1 } }),
      ),
    ).rejects.toThrow("invalid_input");

    const foreign = await createShuttleTube(fake.repo, "user_khac", {
      name: "Ống khác",
      tubePrice: 0,
      initialQuantity: 12,
    });
    await expect(
      addExpense(
        fake.repo,
        FAKE_OWNER,
        FAKE_GAME_ID,
        expenseInput({
          shuttle: { tubeId: foreign.tubes[0]!.id, quantity: 1 },
        }),
      ),
    ).rejects.toThrow("invalid_input");
    expect(fake.state.expenses).toHaveLength(0);
  });

  it("rejects saving when the stock would go negative and writes nothing", async () => {
    await expect(
      addExpense(
        fake.repo,
        FAKE_OWNER,
        FAKE_GAME_ID,
        expenseInput({ shuttle: { tubeId: fake.tubeId, quantity: 13 } }),
      ),
    ).rejects.toThrow("shuttle_stock_negative");
    expect(fake.state.expenses).toHaveLength(0);
    expect(stockOf(fake.state, fake.tubeId)).toBe(12);
  });

  describe("as a collaborator", () => {
    beforeEach(() => {
      fake.state.collaborators.push({
        gameId: FAKE_GAME_ID,
        userId: COLLABORATOR,
        createdAt: "2026-08-01T00:00:00.000Z",
      } as never);
    });

    it("cannot add an expense with a tube", async () => {
      await expect(
        addExpense(
          fake.repo,
          COLLABORATOR,
          FAKE_GAME_ID,
          expenseInput({ shuttle: { tubeId: fake.tubeId, quantity: 1 } }),
        ),
      ).rejects.toThrow("forbidden");
      expect(fake.state.expenses).toHaveLength(0);
      expect(stockOf(fake.state, fake.tubeId)).toBe(12);
    });

    it("adds a plain expense, treating a null tube as not provided", async () => {
      await addExpense(
        fake.repo,
        COLLABORATOR,
        FAKE_GAME_ID,
        expenseInput({ shuttle: null }),
      );
      expect(fake.state.expenses).toHaveLength(1);
      expect(stockOf(fake.state, fake.tubeId)).toBe(12);
    });

    it("cannot link or change a tube on update", async () => {
      await addExpense(
        fake.repo,
        FAKE_OWNER,
        FAKE_GAME_ID,
        expenseInput({ shuttle: { tubeId: fake.tubeId, quantity: 2 } }),
      );
      const expenseId = fake.state.expenses[0]!.id;
      await expect(
        updateExpense(fake.repo, COLLABORATOR, expenseId, {
          shuttle: { tubeId: fake.tubeId, quantity: 5 },
        }),
      ).rejects.toThrow("forbidden");
      expect(stockOf(fake.state, fake.tubeId)).toBe(10);
    });

    it("keeps the link and stock when editing other fields, even the category or a null tube", async () => {
      await addExpense(
        fake.repo,
        FAKE_OWNER,
        FAKE_GAME_ID,
        expenseInput({ shuttle: { tubeId: fake.tubeId, quantity: 2 } }),
      );
      const expenseId = fake.state.expenses[0]!.id;
      await updateExpense(fake.repo, COLLABORATOR, expenseId, {
        amount: 70_000,
      });
      await updateExpense(fake.repo, COLLABORATOR, expenseId, {
        category: "food",
        shuttle: null,
      });
      expect(stockOf(fake.state, fake.tubeId)).toBe(10);
      expect(
        fake.state.shuttleEntries.filter((row) => row.expenseId === expenseId),
      ).toHaveLength(1);
    });

    it("returns the stock when it deletes the expense and sees no tube in the detail", async () => {
      await addExpense(
        fake.repo,
        FAKE_OWNER,
        FAKE_GAME_ID,
        expenseInput({ shuttle: { tubeId: fake.tubeId, quantity: 2 } }),
      );
      const expenseId = fake.state.expenses[0]!.id;
      const detail = await updateExpense(fake.repo, COLLABORATOR, expenseId, {
        amount: 1,
      });
      expect(detail.expenses[0]).not.toHaveProperty("shuttle");
      await removeExpense(fake.repo, COLLABORATOR, expenseId);
      expect(stockOf(fake.state, fake.tubeId)).toBe(12);
    });
  });

  describe("updating", () => {
    let expenseId: string;

    beforeEach(async () => {
      await addExpense(
        fake.repo,
        FAKE_OWNER,
        FAKE_GAME_ID,
        expenseInput({ shuttle: { tubeId: fake.tubeId, quantity: 2 } }),
      );
      expenseId = fake.state.expenses[0]!.id;
    });

    it("keeps the link when only the amount changes", async () => {
      await updateExpense(fake.repo, FAKE_OWNER, expenseId, { amount: 70_000 });
      expect(stockOf(fake.state, fake.tubeId)).toBe(10);
      expect(
        fake.state.shuttleEntries.filter((row) => row.expenseId === expenseId),
      ).toHaveLength(1);
    });

    it("replaces the entry when the quantity changes", async () => {
      const detail = await updateExpense(fake.repo, FAKE_OWNER, expenseId, {
        shuttle: { tubeId: fake.tubeId, quantity: 4 },
      });
      expect(stockOf(fake.state, fake.tubeId)).toBe(8);
      expect(detail.expenses[0]?.shuttle?.quantity).toBe(4);
    });

    it("counts the old quantity as returned when checking stock on edit", async () => {
      await updateExpense(fake.repo, FAKE_OWNER, expenseId, {
        shuttle: { tubeId: fake.tubeId, quantity: 12 },
      });
      expect(stockOf(fake.state, fake.tubeId)).toBe(0);
      await expect(
        updateExpense(fake.repo, FAKE_OWNER, expenseId, {
          shuttle: { tubeId: fake.tubeId, quantity: 13 },
        }),
      ).rejects.toThrow("shuttle_stock_negative");
      expect(stockOf(fake.state, fake.tubeId)).toBe(0);
    });

    it("moves the use to another tube", async () => {
      const second = await createShuttleTube(fake.repo, FAKE_OWNER, {
        name: "Ống B",
        tubePrice: 0,
        initialQuantity: 12,
      });
      const secondId = second.tubes.find((tube) => tube.name === "Ống B")!.id;
      await updateExpense(fake.repo, FAKE_OWNER, expenseId, {
        shuttle: { tubeId: secondId, quantity: 3 },
      });
      expect(stockOf(fake.state, fake.tubeId)).toBe(12);
      expect(stockOf(fake.state, secondId)).toBe(9);
    });

    it("unlinks with an explicit null and returns the stock", async () => {
      const detail = await updateExpense(fake.repo, FAKE_OWNER, expenseId, {
        shuttle: null,
      });
      expect(stockOf(fake.state, fake.tubeId)).toBe(12);
      expect(detail.expenses[0]).not.toHaveProperty("shuttle");
    });

    it("unlinks when the category leaves shuttle without a tube field", async () => {
      await updateExpense(fake.repo, FAKE_OWNER, expenseId, {
        category: "food",
      });
      expect(stockOf(fake.state, fake.tubeId)).toBe(12);
    });

    it("rejects a tube on an expense moved out of the shuttle category", async () => {
      await expect(
        updateExpense(fake.repo, FAKE_OWNER, expenseId, {
          category: "food",
          shuttle: { tubeId: fake.tubeId, quantity: 1 },
        }),
      ).rejects.toThrow("invalid_input");
    });

    it("links a tube to an existing shuttle expense that had none", async () => {
      await addExpense(fake.repo, FAKE_OWNER, FAKE_GAME_ID, expenseInput());
      const unlinked = fake.state.expenses.find((row) => row.id !== expenseId)!;
      await updateExpense(fake.repo, FAKE_OWNER, unlinked.id, {
        shuttle: { tubeId: fake.tubeId, quantity: 1 },
      });
      expect(stockOf(fake.state, fake.tubeId)).toBe(9);
    });

    it("leaves unlinked expenses alone when nothing about the tube changes", async () => {
      await addExpense(fake.repo, FAKE_OWNER, FAKE_GAME_ID, expenseInput());
      const unlinked = fake.state.expenses.find((row) => row.id !== expenseId)!;
      await updateExpense(fake.repo, FAKE_OWNER, unlinked.id, { amount: 1 });
      expect(stockOf(fake.state, fake.tubeId)).toBe(10);
    });
  });

  it("returns the stock when the expense is removed or reallocated away", async () => {
    await addExpense(
      fake.repo,
      FAKE_OWNER,
      FAKE_GAME_ID,
      expenseInput({ shuttle: { tubeId: fake.tubeId, quantity: 5 } }),
    );
    const expenseId = fake.state.expenses[0]!.id;
    expect(stockOf(fake.state, fake.tubeId)).toBe(7);
    await removeExpense(fake.repo, FAKE_OWNER, expenseId);
    expect(stockOf(fake.state, fake.tubeId)).toBe(12);

    await addExpense(
      fake.repo,
      FAKE_OWNER,
      FAKE_GAME_ID,
      expenseInput({ shuttle: { tubeId: fake.tubeId, quantity: 5 } }),
    );
    const second = fake.state.expenses[0]!.id;
    fake.state.splits = [];
    await reallocateExpenses(fake.repo, [second]);
    expect(stockOf(fake.state, fake.tubeId)).toBe(12);
  });

  it("hides the tube link from the public share view", async () => {
    await addExpense(
      fake.repo,
      FAKE_OWNER,
      FAKE_GAME_ID,
      expenseInput({ shuttle: { tubeId: fake.tubeId, quantity: 2 } }),
    );
    const view = await loadShareView(fake.repo, fake.state.games[0]!);
    expect(view.expenses).toHaveLength(1);
    expect(view.expenses[0]).not.toHaveProperty("shuttle");
  });
});
