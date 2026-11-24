import { describe, expect, it } from "vitest";
import { createFakeRepo, FAKE_OWNER } from "./fake-game-repository";
import {
  createShuttleEntry,
  createShuttleTube,
  deleteShuttleEntry,
  deleteShuttleTube,
  listShuttleTubes,
  SHUTTLE_ENTRY_LINKED_ERROR,
  updateShuttleTube,
} from "./shuttles";

const TUBE_INPUT = {
  name: "Ống Hải Yến",
  tubePrice: 360_000,
  initialQuantity: 12,
};

async function setup() {
  const fake = createFakeRepo();
  const view = await createShuttleTube(fake.repo, FAKE_OWNER, TUBE_INPUT);
  return { ...fake, tube: view.tubes[0]! };
}

describe("shuttle tubes", () => {
  it("lists nothing before any tube exists", async () => {
    const { repo } = createFakeRepo();
    expect(await listShuttleTubes(repo, FAKE_OWNER)).toEqual({ tubes: [] });
  });

  it("creates a tube with the initial quantity as first stock entry", async () => {
    const { tube, state } = await setup();

    expect(tube).toMatchObject({
      name: "Ống Hải Yến",
      tubePrice: 360_000,
      shuttlePrice: 30_000,
      initialQuantity: 12,
      stock: 12,
    });
    expect(tube.entries).toMatchObject([
      { kind: "add", delta: 12, stockAfter: 12, expenseId: null },
    ]);
    expect(state.shuttleEntries[0]).toMatchObject({ tubeId: tube.id });
  });

  it("keeps an explicit shuttle price instead of the derived one", async () => {
    const { repo } = createFakeRepo();
    const view = await createShuttleTube(repo, FAKE_OWNER, {
      ...TUBE_INPUT,
      shuttlePrice: 35_000,
    });
    expect(view.tubes[0]?.shuttlePrice).toBe(35_000);
  });

  it("lists the newest tube first with its own stock", async () => {
    const { repo, state } = createFakeRepo();
    await createShuttleTube(repo, FAKE_OWNER, { ...TUBE_INPUT, name: "Cũ" });
    state.shuttleTubes[0]!.createdAt = "2026-01-01T00:00:00.000Z";
    const view = await createShuttleTube(repo, FAKE_OWNER, {
      ...TUBE_INPUT,
      name: "Mới",
      initialQuantity: 6,
    });
    expect(view.tubes.map((tube) => [tube.name, tube.stock])).toEqual([
      ["Mới", 6],
      ["Cũ", 12],
    ]);
  });

  it("derives the shuttle price from a new tube price only when not given", async () => {
    const { repo, tube } = await setup();

    const derived = await updateShuttleTube(repo, FAKE_OWNER, tube.id, {
      tubePrice: 240_000,
    });
    expect(derived.tubes[0]).toMatchObject({
      tubePrice: 240_000,
      shuttlePrice: 20_000,
    });

    const explicit = await updateShuttleTube(repo, FAKE_OWNER, tube.id, {
      tubePrice: 300_000,
      shuttlePrice: 26_000,
    });
    expect(explicit.tubes[0]).toMatchObject({
      tubePrice: 300_000,
      shuttlePrice: 26_000,
    });

    const withQuantity = await updateShuttleTube(repo, FAKE_OWNER, tube.id, {
      tubePrice: 300_000,
      initialQuantity: 10,
    });
    expect(withQuantity.tubes[0]).toMatchObject({
      shuttlePrice: 30_000,
      initialQuantity: 10,
      stock: 12,
    });
  });

  it("renames a tube and edits only the shuttle price without touching the tube price", async () => {
    const { repo, tube } = await setup();
    const view = await updateShuttleTube(repo, FAKE_OWNER, tube.id, {
      name: "Ống mới",
      shuttlePrice: 28_000,
    });
    expect(view.tubes[0]).toMatchObject({
      name: "Ống mới",
      tubePrice: 360_000,
      shuttlePrice: 28_000,
    });
  });

  it("rejects an empty update and unknown or foreign tubes", async () => {
    const { repo, tube } = await setup();
    await expect(
      updateShuttleTube(repo, FAKE_OWNER, tube.id, {}),
    ).rejects.toThrow("invalid_input");
    await expect(
      updateShuttleTube(repo, FAKE_OWNER, "missing", { name: "x" }),
    ).rejects.toThrow("not_found");
    await expect(
      updateShuttleTube(repo, "user_khac", tube.id, { name: "x" }),
    ).rejects.toThrow("not_found");
    await expect(deleteShuttleTube(repo, "user_khac", tube.id)).rejects.toThrow(
      "not_found",
    );
  });

  it("deletes a tube together with its history", async () => {
    const { repo, tube, state } = await setup();
    const other = (
      await createShuttleTube(repo, FAKE_OWNER, { ...TUBE_INPUT, name: "B" })
    ).tubes.find((row) => row.name === "B")!;

    const view = await deleteShuttleTube(repo, FAKE_OWNER, tube.id);

    expect(view.tubes.map((row) => row.id)).toEqual([other.id]);
    expect(state.shuttleEntries.every((row) => row.tubeId === other.id)).toBe(
      true,
    );
  });
});

describe("shuttle tube entries", () => {
  it("adds and uses stock per tube", async () => {
    const { repo, tube } = await setup();
    const other = (
      await createShuttleTube(repo, FAKE_OWNER, { ...TUBE_INPUT, name: "B" })
    ).tubes.find((row) => row.name === "B")!;

    await createShuttleEntry(repo, FAKE_OWNER, tube.id, {
      kind: "use",
      quantity: 3,
    });
    const view = await createShuttleEntry(repo, FAKE_OWNER, tube.id, {
      kind: "add",
      quantity: 2,
      note: "  Mua thêm  ",
    });

    const first = view.tubes.find((row) => row.id === tube.id)!;
    expect(first.stock).toBe(11);
    expect(
      first.entries.map((entry) => [entry.delta, entry.stockAfter]),
    ).toEqual([
      [2, 11],
      [-3, 9],
      [12, 12],
    ]);
    expect(first.entries[0]?.note).toBe("Mua thêm");
    expect(view.tubes.find((row) => row.id === other.id)?.stock).toBe(12);
  });

  it("sets an exact count as the difference to the current stock", async () => {
    const { repo, tube } = await setup();
    const view = await createShuttleEntry(repo, FAKE_OWNER, tube.id, {
      kind: "set",
      quantity: 5,
    });
    expect(view.tubes[0]).toMatchObject({ stock: 5 });
    expect(view.tubes[0]?.entries[0]?.delta).toBe(-7);
  });

  it("does not write a row when nothing changes", async () => {
    const { repo, tube, state } = await setup();
    await createShuttleEntry(repo, FAKE_OWNER, tube.id, {
      kind: "set",
      quantity: 12,
    });
    expect(state.shuttleEntries).toHaveLength(1);
  });

  it("refuses to use more than the tube holds or to overflow it", async () => {
    const { repo, tube, state } = await setup();
    await expect(
      createShuttleEntry(repo, FAKE_OWNER, tube.id, {
        kind: "use",
        quantity: 13,
      }),
    ).rejects.toThrow("shuttle_stock_negative");
    state.shuttleEntries.push({
      id: "huge",
      ownerUserId: FAKE_OWNER,
      tubeId: tube.id,
      expenseId: null,
      kind: "add",
      delta: 99_990,
      note: "",
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    await expect(
      createShuttleEntry(repo, FAKE_OWNER, tube.id, {
        kind: "add",
        quantity: 999,
      }),
    ).rejects.toThrow("shuttle_stock_too_large");
  });

  it("returns not found for entries on another owner's tube", async () => {
    const { repo, tube } = await setup();
    await expect(
      createShuttleEntry(repo, "user_khac", tube.id, {
        kind: "add",
        quantity: 1,
      }),
    ).rejects.toThrow("not_found");
  });

  it("deletes a mistake and recomputes the stock", async () => {
    const { repo, tube } = await setup();
    const mistake = await createShuttleEntry(repo, FAKE_OWNER, tube.id, {
      kind: "use",
      quantity: 5,
    });
    const view = await deleteShuttleEntry(
      repo,
      FAKE_OWNER,
      mistake.tubes[0]!.entries[0]!.id,
    );
    expect(view.tubes[0]).toMatchObject({ stock: 12 });
    expect(view.tubes[0]?.entries).toHaveLength(1);
  });

  it("refuses to delete an entry that would make the stock negative", async () => {
    const { repo, tube } = await setup();
    await createShuttleEntry(repo, FAKE_OWNER, tube.id, {
      kind: "use",
      quantity: 3,
    });
    await expect(
      deleteShuttleEntry(repo, FAKE_OWNER, tube.entries[0]!.id),
    ).rejects.toThrow("shuttle_stock_negative");
  });

  it("refuses to delete entries owned by someone else or linked to an expense", async () => {
    const { repo, tube, state } = await setup();
    await expect(
      deleteShuttleEntry(repo, "user_khac", tube.entries[0]!.id),
    ).rejects.toThrow("not_found");

    state.shuttleEntries.push({
      id: "linked",
      ownerUserId: FAKE_OWNER,
      tubeId: tube.id,
      expenseId: "expense_1",
      kind: "use",
      delta: -1,
      note: "",
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    await expect(
      deleteShuttleEntry(repo, FAKE_OWNER, "linked"),
    ).rejects.toThrow(SHUTTLE_ENTRY_LINKED_ERROR);
  });

  it("caps the history returned for a tube", async () => {
    const { repo, tube, state } = await setup();
    for (let index = 0; index < 60; index += 1) {
      state.shuttleEntries.push({
        id: `bulk_${index}`,
        ownerUserId: FAKE_OWNER,
        tubeId: tube.id,
        expenseId: null,
        kind: "add",
        delta: 1,
        note: "",
        createdAt: `2026-09-01T00:00:${String(index).padStart(2, "0")}.000Z`,
      });
    }
    const view = await listShuttleTubes(repo, FAKE_OWNER);
    expect(view.tubes[0]?.entries).toHaveLength(50);
    expect(view.tubes[0]?.stock).toBe(72);
  });
});
