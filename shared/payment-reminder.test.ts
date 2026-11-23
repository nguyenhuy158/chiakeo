import { describe, expect, it } from "vitest";
import {
  buildAllPaymentReminders,
  buildPaymentReminder,
} from "./payment-reminder";

describe("buildPaymentReminder", () => {
  it("nêu đúng người chuyển, số tiền VND, người nhận và tên cuộc chia", () => {
    expect(buildPaymentReminder("Kèo sân thứ 7", "Bình", "An", 40_000)).toBe(
      'Bình ơi, bạn chuyển 40.000 ₫ cho An cho kèo "Kèo sân thứ 7" nhé.',
    );
  });

  it("thêm link xem chi tiết khi cuộc chơi đã bật share", () => {
    expect(
      buildPaymentReminder("Kèo", "Bình", "An", 40_000, "https://x/share/ab12"),
    ).toBe(
      'Bình ơi, bạn chuyển 40.000 ₫ cho An cho kèo "Kèo" nhé.\nXem chi tiết và QR: https://x/share/ab12',
    );
  });
});

it("copies every debt and one shared link", () => {
  const rows = [
    { fromName: "Bình", toName: "An", amount: 50000 },
    { fromName: "Châu", toName: "An", amount: 20000 },
  ];
  expect(
    buildAllPaymentReminders("Cầu tối", rows, "https://x/share/ab12"),
  ).toBe(
    'Nhắc thanh toán kèo "Cầu tối":\nBình → An: 50.000 ₫\nChâu → An: 20.000 ₫\nXem chi tiết và QR: https://x/share/ab12',
  );
  expect(buildAllPaymentReminders("Cầu tối", rows)).not.toContain("undefined");
});
