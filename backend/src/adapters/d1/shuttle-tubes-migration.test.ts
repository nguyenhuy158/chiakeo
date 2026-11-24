import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = "./drizzle-shared";
const TUBE_MIGRATION = "0013_shuttle_tubes.sql";
const STATEMENT_BREAKPOINT = "--> statement-breakpoint";
const MIGRATED_TUBE_NAME = "Ống cầu 1";
const CREATED_AT = "2026-01-01T00:00:00.000Z";

let miniflare: Miniflare;
let database: D1Database;

async function applyMigration(file: string) {
  const statements = readFileSync(join(MIGRATIONS_DIR, file), "utf8")
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await database.prepare(statement).run();
  }
}

async function insertEntry(
  id: string,
  ownerUserId: string,
  delta: number,
  createdAt: string,
) {
  await database
    .prepare(
      "INSERT INTO chiakeo_shuttle_entries (id, owner_user_id, kind, delta, note, created_at) VALUES (?, ?, 'add', ?, '', ?)",
    )
    .bind(id, ownerUserId, delta, createdAt)
    .run();
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    compatibilityDate: "2026-07-01",
    d1Databases: { DB: "test-shuttle-tubes-migration" },
    d1Persist: false,
  });
  database = await miniflare.getD1Database("DB");

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql") && file < TUBE_MIGRATION)
    .sort();
  for (const file of files) await applyMigration(file);

  for (const id of ["owner-a", "owner-b", "owner-empty"]) {
    await database
      .prepare(
        "INSERT INTO chiakeo_user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0)",
      )
      .bind(id, id, `${id}@example.test`)
      .run();
  }
  await insertEntry("a-1", "owner-a", 12, "2026-02-01T00:00:00.000Z");
  await insertEntry("a-2", "owner-a", -3, "2026-01-05T00:00:00.000Z");
  await insertEntry("b-1", "owner-b", 7, CREATED_AT);

  await applyMigration(TUBE_MIGRATION);
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("shuttle tubes migration", () => {
  it("moves every owner's old entries into one tube without changing their stock", async () => {
    const { results: tubes } = await database
      .prepare(
        "SELECT id, owner_user_id, name, tube_price, shuttle_price, initial_quantity, created_at FROM chiakeo_shuttle_tubes ORDER BY owner_user_id",
      )
      .all();
    expect(tubes).toEqual([
      {
        id: "tube_owner-a",
        owner_user_id: "owner-a",
        name: MIGRATED_TUBE_NAME,
        tube_price: 0,
        shuttle_price: 0,
        initial_quantity: 12,
        created_at: "2026-01-05T00:00:00.000Z",
      },
      {
        id: "tube_owner-b",
        owner_user_id: "owner-b",
        name: MIGRATED_TUBE_NAME,
        tube_price: 0,
        shuttle_price: 0,
        initial_quantity: 12,
        created_at: CREATED_AT,
      },
    ]);

    const { results: stocks } = await database
      .prepare(
        "SELECT owner_user_id, tube_id, SUM(delta) AS stock FROM chiakeo_shuttle_entries GROUP BY owner_user_id, tube_id ORDER BY owner_user_id",
      )
      .all();
    expect(stocks).toEqual([
      { owner_user_id: "owner-a", tube_id: "tube_owner-a", stock: 9 },
      { owner_user_id: "owner-b", tube_id: "tube_owner-b", stock: 7 },
    ]);

    const empty = await database
      .prepare(
        "SELECT COUNT(*) AS total FROM chiakeo_shuttle_entries WHERE tube_id = ''",
      )
      .first<{ total: number }>();
    expect(empty?.total).toBe(0);
  });
});
