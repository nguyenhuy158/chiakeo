export const SHUTTLE_STOCK_NEGATIVE = "shuttle_stock_negative";

const SHUTTLE_ERROR_MESSAGES: Record<string, string> = {
  [SHUTTLE_STOCK_NEGATIVE]: "Trong kho không còn đủ cầu cho thao tác này.",
  shuttle_stock_too_large: "Số cầu quá lớn.",
  shuttle_entry_linked_to_expense:
    "Lần ghi này thuộc một khoản chi. Sửa hoặc xóa khoản chi để hoàn lại cầu.",
};

export const SHUTTLE_WRITE_FAILED = "Không ghi được, thử lại sau.";
export const EXPENSE_SHUTTLE_STOCK_MESSAGE =
  "Ống cầu đã chọn không còn đủ cầu cho khoản chi này.";

export function shuttleErrorCode(error: unknown) {
  return error instanceof Error ? error.message : "";
}

export function shuttleErrorMessage(error: unknown) {
  return (
    SHUTTLE_ERROR_MESSAGES[shuttleErrorCode(error)] || SHUTTLE_WRITE_FAILED
  );
}
