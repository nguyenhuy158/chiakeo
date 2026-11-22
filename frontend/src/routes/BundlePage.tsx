import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  useBundle,
  useDeleteBundle,
  useSettleBundle,
} from "../adapters/react-query/bundles-query";
import { useConfirm } from "../components/ConfirmDialog";
import { EmptyState, LoadingState } from "../components/ui";
import { formatMoney } from "../core/domain/money";
import { PagedList } from "../ui/PagedList";

const ROW_HEIGHT_PX = 68;

/**
 * Cuoc cha khong giu so du rieng: no doc lai khoan no con thieu cua tung cuoc
 * con. Tra o day thi ghi vao moi cuoc con; tra o mot cuoc con thi khoan do
 * tu bien mat khoi day.
 */
export function BundlePage() {
  const { bundleId } = useParams({ from: "/app/bundles/$bundleId" });
  const navigate = useNavigate();
  const confirm = useConfirm();
  const bundleQuery = useBundle(bundleId);
  const settle = useSettleBundle(bundleId);
  const remove = useDeleteBundle();
  const [picked, setPicked] = useState<string[]>([]);

  if (bundleQuery.isPending) return <LoadingState />;
  if (bundleQuery.isError) {
    return (
      <EmptyState
        title="Không tìm thấy cuộc chơi cha"
        description="Có thể đã bị xóa."
      />
    );
  }

  const bundle = bundleQuery.data;
  const names = new Set(bundle.people.map((person) => person.name));
  const selected = picked.filter((name) => names.has(name));
  const selectedTotal = bundle.people
    .filter((person) => selected.includes(person.name))
    .reduce((sum, person) => sum + person.total, 0);

  function toggle(name: string) {
    setPicked((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
    );
  }

  async function handleSettle() {
    const ok = await confirm({
      title: `Ghi nhận ${selected.length} người đã trả?`,
      description: `Tổng ${formatMoney(selectedTotal)}, ghi vào từng cuộc chơi con.`,
      confirmLabel: "Ghi nhận",
    });
    if (!ok) return;
    try {
      await settle.mutateAsync({ names: selected });
      setPicked([]);
      toast.success("Đã ghi nhận trả nợ ở các cuộc con");
    } catch {
      toast.error("Không ghi nhận được. Thử tải lại trang.");
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Xóa cuộc chơi cha?",
      description: "Các cuộc chơi con và khoản đã trả vẫn được giữ nguyên.",
      confirmLabel: "Xóa",
      destructive: true,
    });
    if (!ok) return;
    await remove.mutateAsync(bundleId);
    navigate({ to: "/bundles" });
  }

  return (
    <div data-one-screen className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/bundles"
          aria-label="Về danh sách cuộc chơi cha"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium"
        >
          <ArrowLeft size={14} />
          Quay lại
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {bundle.name}
        </h1>
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Xóa cuộc chơi cha"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-fg-muted"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <p className="shrink-0 truncate text-xs text-fg-muted">
        Gồm: {bundle.games.map((game) => game.name).join(", ")}
      </p>
      <div className="min-h-0 flex-1">
        <PagedList
          items={bundle.people}
          getKey={(person) => person.name}
          rowHeight={ROW_HEIGHT_PX}
          empty={
            <EmptyState
              title="Không còn ai nợ"
              description="Mọi khoản trong các cuộc con đã được trả."
            />
          }
          renderItem={(person) => (
            <label className="flex h-full items-center gap-3 rounded-lg border border-border px-3">
              <input
                type="checkbox"
                checked={selected.includes(person.name)}
                onChange={() => toggle(person.name)}
                aria-label={`Chọn ${person.name}`}
                className="h-4 w-4 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="flex justify-between gap-2 text-sm font-semibold">
                  <span className="truncate">{person.name}</span>
                  <span className="shrink-0 text-danger">
                    {formatMoney(person.total)}
                  </span>
                </span>
                <span className="block truncate text-xs text-fg-muted">
                  {person.debts
                    .map(
                      (debt) =>
                        `${debt.gameName}: ${formatMoney(debt.amount)} → ${debt.toName}`,
                    )
                    .join(" · ")}
                </span>
              </span>
            </label>
          )}
        />
      </div>
      <button
        type="button"
        disabled={selected.length === 0 || settle.isPending}
        onClick={handleSettle}
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-40"
      >
        {selected.length === 0
          ? "Chọn người để ghi nhận đã trả"
          : `Ghi nhận ${selected.length} người đã trả · ${formatMoney(selectedTotal)}`}
      </button>
    </div>
  );
}
