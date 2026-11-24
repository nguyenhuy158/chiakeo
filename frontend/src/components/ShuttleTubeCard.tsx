import { Check, ChevronDown, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type {
  ApiShuttleEntry,
  ApiShuttleTube,
} from "../../../shared/api-types";
import {
  MAX_SHUTTLE_QUANTITY,
  SHUTTLE_NOTE_MAX_LENGTH,
  type ShuttleEntryKind,
} from "../../../shared/shuttles";
import {
  useCreateShuttleEntry,
  useDeleteShuttleEntry,
} from "../adapters/react-query/shuttles-query";
import { formatMoney } from "../core/domain/money";
import { shuttleErrorMessage } from "../core/domain/shuttle-errors";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { useConfirm } from "./ConfirmDialog";
import { formatDateTime } from "./format-datetime";

const USE_STEPS = [1, 2, 3, 4] as const;
const ADD_STEPS = [1, 6, 10, 12] as const;
const ICON_SIZE_PX = 15;
const STEP_ICON_SIZE_PX = 13;

const KIND_LABELS: Record<ShuttleEntryKind, string> = {
  add: "Thêm cầu",
  use: "Dùng cầu",
  set: "Chốt lại số cầu",
};

function EntryRow({
  entry,
  deleting,
  onDelete,
}: {
  entry: ApiShuttleEntry;
  deleting: boolean;
  onDelete: () => void;
}) {
  const positive = entry.delta > 0;

  return (
    <li className="flex items-center gap-3 rounded-ui border border-border px-3 py-2">
      <Badge
        tone={positive ? "success" : "danger"}
        className="w-12 justify-center"
      >
        {positive ? `+${entry.delta}` : entry.delta}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">
          {KIND_LABELS[entry.kind]}
          <span className="ml-1 font-normal text-fg-muted">
            · còn {entry.stockAfter}
          </span>
        </p>
        <p className="truncate text-xs text-fg-muted">
          {formatDateTime(entry.createdAt, { includeYear: false })}
          {entry.note && ` · ${entry.note}`}
        </p>
      </div>
      {entry.expenseId ? (
        <Badge tone="neutral">Khoản chi</Badge>
      ) : (
        <Button
          variant="outline"
          size="icon"
          aria-label="Xóa lần ghi này"
          disabled={deleting}
          onClick={onDelete}
        >
          <Trash2 size={ICON_SIZE_PX} />
        </Button>
      )}
    </li>
  );
}

type ShuttleTubeCardProps = {
  tube: ApiShuttleTube;
  onEdit: () => void;
  onDelete: () => void;
};

export function ShuttleTubeCard({
  tube,
  onEdit,
  onDelete,
}: ShuttleTubeCardProps) {
  const createEntry = useCreateShuttleEntry();
  const deleteEntry = useDeleteShuttleEntry();
  const confirm = useConfirm();
  const [note, setNote] = useState("");
  const [countDraft, setCountDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const pending = createEntry.isPending;

  async function submit(kind: ShuttleEntryKind, quantity: number) {
    try {
      await createEntry.mutateAsync({
        tubeId: tube.id,
        input: { kind, quantity, note: note.trim() },
      });
      setNote("");
      if (kind === "set") setCountDraft("");
    } catch (error) {
      toast.error(shuttleErrorMessage(error));
    }
  }

  async function handleSetExact() {
    const parsed = Number(countDraft);
    if (
      !Number.isInteger(parsed) ||
      parsed < 0 ||
      parsed > MAX_SHUTTLE_QUANTITY
    ) {
      toast.error(`Nhập số cầu từ 0 đến ${MAX_SHUTTLE_QUANTITY}.`);
      return;
    }
    await submit("set", parsed);
  }

  async function handleDelete(entry: ApiShuttleEntry) {
    const ok = await confirm({
      title: "Xóa lần ghi này?",
      description: `${KIND_LABELS[entry.kind]} (${entry.delta > 0 ? "+" : ""}${entry.delta} trái). Số cầu trong ống sẽ được tính lại.`,
      confirmLabel: "Xóa",
      destructive: true,
    });
    if (!ok) return;

    try {
      await deleteEntry.mutateAsync(entry.id);
    } catch (error) {
      toast.error(shuttleErrorMessage(error));
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-fg">
            {tube.name}
          </h2>
          <p className="text-xs text-fg-muted">
            Ống {formatMoney(tube.tubePrice)} · {formatMoney(tube.shuttlePrice)}
            /trái
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Sửa ${tube.name}`}
          onClick={onEdit}
        >
          <Pencil size={ICON_SIZE_PX} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Xóa ${tube.name}`}
          onClick={onDelete}
        >
          <Trash2 size={ICON_SIZE_PX} />
        </Button>
      </div>

      <p className="text-center text-sm text-fg-muted">
        Còn{" "}
        <span
          aria-live="polite"
          className="text-4xl font-extrabold tabular-nums text-fg"
        >
          {tube.stock}
        </span>{" "}
        trái
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Đã dùng</p>
          <div className="grid grid-cols-4 gap-1.5">
            {USE_STEPS.map((step) => (
              <Button
                key={step}
                variant="danger"
                size="sm"
                disabled={pending || step > tube.stock}
                aria-label={`Dùng ${step} trái từ ${tube.name}`}
                onClick={() => submit("use", step)}
              >
                <Minus size={STEP_ICON_SIZE_PX} />
                {step}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Mua thêm</p>
          <div className="grid grid-cols-4 gap-1.5">
            {ADD_STEPS.map((step) => (
              <Button
                key={step}
                size="sm"
                disabled={pending}
                aria-label={`Thêm ${step} trái vào ${tube.name}`}
                onClick={() => submit("add", step)}
              >
                <Plus size={STEP_ICON_SIZE_PX} />
                {step}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSetExact();
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={countDraft}
          onChange={(event) =>
            setCountDraft(event.target.value.replace(/\D/g, ""))
          }
          inputMode="numeric"
          placeholder="Đếm lại · vd 8"
          aria-label={`Chốt lại số cầu của ${tube.name}`}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          variant="outline"
          className="shrink-0 whitespace-nowrap"
          disabled={pending || countDraft === ""}
          leftIcon={<Check size={ICON_SIZE_PX} />}
        >
          Chốt lại
        </Button>
      </form>

      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={SHUTTLE_NOTE_MAX_LENGTH}
        placeholder="Ghi chú cho lần ghi tới (không bắt buộc)"
        aria-label={`Ghi chú cho ${tube.name}`}
      />

      <Button
        variant="ghost"
        size="sm"
        aria-expanded={historyOpen}
        onClick={() => setHistoryOpen((current) => !current)}
        rightIcon={
          <ChevronDown
            size={ICON_SIZE_PX}
            className={historyOpen ? "rotate-180" : ""}
          />
        }
      >
        Lịch sử ({tube.entries.length})
      </Button>
      {historyOpen && (
        <ul className="flex flex-col gap-2">
          {tube.entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              deleting={deleteEntry.isPending}
              onDelete={() => handleDelete(entry)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
