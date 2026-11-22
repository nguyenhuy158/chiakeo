import { CircleCheckBig, QrCode } from "lucide-react";
import { useState } from "react";
import type {
  ApiParticipant,
  ApiPaymentRequest,
  ApiPaymentUnavailableReason,
} from "../../../shared/api-types";
import {
  useCreatePayment,
  usePaymentOptions,
  usePaymentRequest,
} from "../adapters/react-query/queries";
import { getQrProvider } from "../core/container";
import { formatMoney } from "../core/domain/money";
import { Celebrate } from "../ui/Celebrate";
import { AdaptiveSheet } from "./AdaptiveSheet";

type SharePaymentPanelProps = {
  token: string;
  participants: ApiParticipant[];
};

const UNAVAILABLE_HINTS: Record<ApiPaymentUnavailableReason, string> = {
  "not-configured": "Chưa bật chuyển khoản tự động: thiếu cấu hình SePay.",
  "receiver-not-linked":
    "Chưa có chuyển khoản tự động: số tài khoản người nhận chưa liên kết với SePay.",
};

function PaymentStatus({ payment }: { payment: ApiPaymentRequest }) {
  if (payment.status === "paid") {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <Celebrate>
          <CircleCheckBig size={48} className="text-success" />
        </Celebrate>
        <p className="text-base font-semibold">
          Đã nhận {formatMoney(payment.paidAmount)}
        </p>
        <p className="text-sm text-fg-muted">
          Các khoản nợ đã được đánh dấu là đã trả.
        </p>
      </div>
    );
  }

  const remaining = payment.total - payment.paidAmount;
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <img
        src={getQrProvider().buildUrl(
          payment.receiver,
          remaining,
          payment.code,
        )}
        alt={`QR chuyển ${formatMoney(remaining)} cho ${payment.receiver.name}`}
        className="h-56 w-56 rounded-md bg-white object-contain"
      />
      {payment.paidAmount > 0 && (
        <p role="alert" className="rounded-md bg-warning-soft p-2 text-sm">
          Đã nhận {formatMoney(payment.paidAmount)}, chuyển thêm phần còn thiếu
          với cùng nội dung.
        </p>
      )}
      <p className="text-lg font-semibold tabular">{formatMoney(remaining)}</p>
      <p className="text-sm">
        Nội dung:{" "}
        <span className="font-mono font-semibold">{payment.code}</span>
      </p>
      <p className="text-xs text-fg-muted">
        Giữ nguyên nội dung khi chuyển. Đang chờ tiền về…
      </p>
    </div>
  );
}

function PaymentTracker({ token, code }: { token: string; code: string }) {
  const paymentQuery = usePaymentRequest(token, code);
  if (!paymentQuery.data)
    return <p className="py-6 text-center text-sm text-fg-muted">Đang tải…</p>;
  return <PaymentStatus payment={paymentQuery.data} />;
}

export function SharePaymentPanel({
  token,
  participants,
}: SharePaymentPanelProps) {
  const optionsQuery = usePaymentOptions(token);
  const createPayment = useCreatePayment(token);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");

  const receiver = optionsQuery.data?.receiver;
  const options = optionsQuery.data?.options || [];
  const unavailableReason = optionsQuery.data?.unavailableReason;
  if (!receiver || options.length === 0) {
    if (!unavailableReason) return null;
    return (
      <p className="rounded-lg border border-border bg-surface-muted p-3 text-sm text-fg-muted">
        {UNAVAILABLE_HINTS[unavailableReason]}
      </p>
    );
  }

  const nameById = new Map(
    participants.map((person) => [person.id, person.name]),
  );
  function close() {
    setOpen(false);
    setCode("");
  }

  async function pay(participantId: string) {
    const payment = await createPayment.mutateAsync([participantId]);
    setCode(payment.code);
  }

  return (
    <section className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <h3 className="min-w-0 truncate text-base font-semibold">
        Chuyển khoản cho {receiver.name}
      </h3>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white"
      >
        <QrCode size={17} />
        Thanh toán
      </button>

      <AdaptiveSheet open={open} onClose={close} title="Thanh toán">
        {code ? (
          <div className="pb-4">
            <PaymentTracker token={token} code={code} />
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            <p className="text-sm text-fg-muted">Ai đang trả tiền?</p>
            {options.map((option) => (
              <button
                key={option.participantId}
                type="button"
                disabled={createPayment.isPending}
                onClick={() => pay(option.participantId)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border p-3 text-start disabled:opacity-50"
              >
                <span className="text-sm font-medium">
                  {nameById.get(option.participantId) || "Không rõ"}
                </span>
                <span className="text-sm font-semibold tabular">
                  {formatMoney(option.amount)}
                </span>
              </button>
            ))}
            {createPayment.isError && (
              <p role="alert" className="text-sm text-danger">
                Không tạo được mã thanh toán, thử lại nhé.
              </p>
            )}
          </div>
        )}
      </AdaptiveSheet>
    </section>
  );
}
