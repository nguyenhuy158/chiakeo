import { describe, expect, it } from "vitest";
import {
  SHUTTLE_STOCK_NEGATIVE,
  SHUTTLE_WRITE_FAILED,
  shuttleErrorCode,
  shuttleErrorMessage,
} from "./shuttle-errors";

describe("shuttle errors", () => {
  it("reads the server code from an Error and ignores anything else", () => {
    expect(shuttleErrorCode(new Error(SHUTTLE_STOCK_NEGATIVE))).toBe(
      SHUTTLE_STOCK_NEGATIVE,
    );
    expect(shuttleErrorCode("offline")).toBe("");
  });

  it("maps known codes to Vietnamese and falls back for the rest", () => {
    expect(shuttleErrorMessage(new Error(SHUTTLE_STOCK_NEGATIVE))).toContain(
      "không còn đủ cầu",
    );
    expect(shuttleErrorMessage(new Error("shuttle_stock_too_large"))).toBe(
      "Số cầu quá lớn.",
    );
    expect(
      shuttleErrorMessage(new Error("shuttle_entry_linked_to_expense")),
    ).toContain("khoản chi");
    expect(shuttleErrorMessage(new Error("boom"))).toBe(SHUTTLE_WRITE_FAILED);
    expect(shuttleErrorMessage(undefined)).toBe(SHUTTLE_WRITE_FAILED);
  });
});
