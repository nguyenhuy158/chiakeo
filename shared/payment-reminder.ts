const moneyFormat = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});

export function buildPaymentReminder(
  gameName: string,
  fromName: string,
  toName: string,
  amount: number,
  shareUrl?: string,
): string {
  const message = `${fromName} ơi, bạn chuyển ${moneyFormat.format(amount)} ₫ cho ${toName} cho kèo "${gameName}" nhé.`;
  return shareUrl ? `${message}\nXem chi tiết và QR: ${shareUrl}` : message;
}

const REMINDER_LINE_BREAK = "\n";

export function buildAllPaymentReminders(
  gameName: string,
  rows: { fromName: string; toName: string; amount: number }[],
  shareUrl?: string,
): string {
  const lines = [
    `Nhắc thanh toán kèo "${gameName}":`,
    ...rows.map(
      (row) =>
        `${row.fromName} → ${row.toName}: ${moneyFormat.format(row.amount)} ₫`,
    ),
  ];
  if (shareUrl) lines.push(`Xem chi tiết và QR: ${shareUrl}`);
  return lines.join(REMINDER_LINE_BREAK);
}
