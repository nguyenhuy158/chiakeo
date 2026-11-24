import { describe, expect, it } from "vitest";
import {
  defaultTitleForKind,
  expenseInputSchema,
  gameInputSchema,
  gameUpdateSchema,
  shuttleTubeInputSchema,
  shuttleTubeUpdateSchema,
  transferInputSchema,
} from "./schemas";

describe("ngày chơi trong schema", () => {
  it("nhận ngày thật hoặc rỗng và từ chối ngày sai", () => {
    expect(gameUpdateSchema.parse({ playedFrom: "2026-11-16" })).toEqual({
      playedFrom: "2026-11-16",
    });
    expect(gameUpdateSchema.parse({ playedTo: "" })).toEqual({ playedTo: "" });
    expect(() =>
      gameUpdateSchema.parse({ playedFrom: "2026-02-30" }),
    ).toThrow();
  });
});

describe("gameUpdateSchema", () => {
  it("khong tu bồi thêm field nao ngoai field duoc gui", () => {
    // Bug that: khi schema sua duoc dung tu `gameInputSchema.partial()`, mot
    // PATCH chi doi ten hoac chi doi dau moi van keo theo settlementMode mac
    // dinh va am tham dua che do chuyen tien ve "host".
    expect(
      gameUpdateSchema.parse({ settlementHostId: "participant_1" }),
    ).toEqual({
      settlementHostId: "participant_1",
    });
    expect(gameUpdateSchema.parse({ name: "Ăn chơi" })).toEqual({
      name: "Ăn chơi",
    });
    expect(gameUpdateSchema.parse({})).toEqual({});
  });

  it("van nhan tung field khi duoc gui va chan gia tri sai", () => {
    expect(gameUpdateSchema.parse({ settlementMode: "pick" })).toEqual({
      settlementMode: "pick",
    });
    expect(
      gameUpdateSchema.safeParse({ settlementMode: "khong-co" }).success,
    ).toBe(false);
    expect(gameUpdateSchema.safeParse({ name: "  " }).success).toBe(false);
  });

  it("chuan hoa danh sach phan hien tren link chia se", () => {
    expect(
      gameUpdateSchema.parse({ shareShow: ["photos", "expenses", "photos"] }),
    ).toEqual({ shareShow: ["expenses", "photos"] });
    expect(gameUpdateSchema.parse({ shareShow: [] })).toEqual({
      shareShow: [],
    });
    expect(gameUpdateSchema.safeParse({ shareShow: ["summary"] }).success).toBe(
      false,
    );
  });
});

describe("gameInputSchema", () => {
  it("luc tao van dien san mac dinh", () => {
    expect(gameInputSchema.parse({ name: "Cầu lông" })).toEqual({
      name: "Cầu lông",
      playedFrom: "",
      playedTo: "",
      settlementMode: "host",
      settlementHostId: "",
      participantCount: 0,
    });
  });
});

describe("defaultTitleForKind", () => {
  it("phân biệt tên mặc định của khoản thu và khoản chi", () => {
    expect(defaultTitleForKind("income")).toBe("Khoản thu");
    expect(defaultTitleForKind("expense")).toBe("Khoản chi");
  });
});

describe("transferInputSchema", () => {
  it("chặn chuyển tiền cho chính người trả", () => {
    const transfer = {
      fromParticipantId: "p1",
      toParticipantId: "p1",
      amount: 10_000,
    };

    expect(transferInputSchema.safeParse(transfer).success).toBe(false);
    expect(
      transferInputSchema.safeParse({ ...transfer, toParticipantId: "p2" })
        .success,
    ).toBe(true);
  });
});

it("validates account lists before saving", async () => {
  const { contactInputSchema, contactUpdateSchema, MAX_CONTACT_ACCOUNTS } =
    await import("./schemas");
  const account = { bankId: "MB", accountNo: "123", accountName: "AN" };
  expect(
    contactInputSchema.safeParse({ name: "An", accounts: [account] }).success,
  ).toBe(true);
  expect(
    contactInputSchema.safeParse({ name: "An", accounts: [account, account] })
      .success,
  ).toBe(false);
  expect(
    contactUpdateSchema.safeParse({ accounts: [{ ...account, bankId: "" }] })
      .success,
  ).toBe(false);
  expect(
    contactUpdateSchema.safeParse({ accounts: [{ ...account, accountNo: "" }] })
      .success,
  ).toBe(false);
  expect(
    contactInputSchema.safeParse({
      name: "An",
      accounts: Array.from({ length: MAX_CONTACT_ACCOUNTS + 1 }, (_, i) => ({
        ...account,
        accountNo: String(i),
      })),
    }).success,
  ).toBe(false);
});

describe("shuttle tube schemas", () => {
  it("fills a new tube with 12 shuttles and no price", () => {
    expect(shuttleTubeInputSchema.parse({ name: "  Ống A " })).toEqual({
      name: "Ống A",
      tubePrice: 0,
      initialQuantity: 12,
    });
  });

  it("rejects an empty name, a zero quantity and a negative price", () => {
    expect(() => shuttleTubeInputSchema.parse({ name: " " })).toThrow();
    expect(() =>
      shuttleTubeInputSchema.parse({ name: "A", initialQuantity: 0 }),
    ).toThrow();
    expect(() =>
      shuttleTubeInputSchema.parse({ name: "A", tubePrice: -1 }),
    ).toThrow();
  });

  it("does not add defaults to a partial tube update", () => {
    expect(shuttleTubeUpdateSchema.parse({ shuttlePrice: 5000 })).toEqual({
      shuttlePrice: 5000,
    });
  });
});

describe("expense shuttle link", () => {
  const base = { amount: 1000, payerParticipantId: "p1" };

  it("accepts a tube link, null and no link", () => {
    expect(
      expenseInputSchema.parse({
        ...base,
        shuttle: { tubeId: "tube_1", quantity: 2 },
      }).shuttle,
    ).toEqual({ tubeId: "tube_1", quantity: 2 });
    expect(expenseInputSchema.parse({ ...base, shuttle: null }).shuttle).toBe(
      null,
    );
    expect(expenseInputSchema.parse(base).shuttle).toBeUndefined();
  });

  it("rejects a zero quantity", () => {
    expect(() =>
      expenseInputSchema.parse({
        ...base,
        shuttle: { tubeId: "tube_1", quantity: 0 },
      }),
    ).toThrow();
  });
});
