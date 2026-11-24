import type { ApiExpenseShuttle } from "../../../shared/api-types";
import { shuttleExpenseAmount } from "../../../shared/shuttles";
import { useShuttleTubes } from "../adapters/react-query/shuttles-query";
import { formatMoney } from "../core/domain/money";
import { Field } from "../ui/Field";
import { Input, Select } from "../ui/Input";

export type ShuttleExpenseChange = {
  tubeId: string;
  quantity: string;
  amount: number | null;
};

type ShuttleExpenseFieldsProps = {
  tubeId: string;
  quantity: string;
  original: ApiExpenseShuttle | null;
  error?: string;
  onChange: (next: ShuttleExpenseChange) => void;
};

export function ShuttleExpenseFields({
  tubeId,
  quantity,
  original,
  error,
  onChange,
}: ShuttleExpenseFieldsProps) {
  const tubesQuery = useShuttleTubes();
  const tubes = tubesQuery.data?.tubes ?? [];

  function change(nextTubeId: string, nextQuantity: string) {
    const tube = tubes.find((row) => row.id === nextTubeId);
    const count = Number(nextQuantity);
    const amount =
      tube && count > 0 ? shuttleExpenseAmount(count, tube.shuttlePrice) : 0;
    onChange({
      tubeId: nextTubeId,
      quantity: nextQuantity,
      amount: amount > 0 ? amount : null,
    });
  }

  function remaining(tubeStock: number, id: string) {
    return tubeStock + (original?.tubeId === id ? original.quantity : 0);
  }

  return (
    <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
      <Field
        label="Ống cầu"
        hint={
          tubesQuery.isError
            ? "Không tải được danh sách ống cầu."
            : tubesQuery.isSuccess && tubes.length === 0
              ? "Chưa có ống cầu nào, thêm ở trang Kho cầu."
              : undefined
        }
      >
        <Select
          value={tubeId}
          disabled={!tubesQuery.isSuccess}
          onChange={(event) => change(event.target.value, quantity)}
        >
          <option value="">Không trừ kho cầu</option>
          {tubes.map((tube) => (
            <option key={tube.id} value={tube.id}>
              {tube.name} · còn {remaining(tube.stock, tube.id)} trái ·{" "}
              {formatMoney(tube.shuttlePrice)}/trái
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Số trái dùng" error={error}>
        <Input
          value={quantity}
          inputMode="numeric"
          disabled={!tubeId}
          placeholder="3"
          onChange={(event) =>
            change(tubeId, event.target.value.replace(/\D/g, ""))
          }
        />
      </Field>
    </div>
  );
}
