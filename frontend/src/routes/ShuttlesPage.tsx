import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ApiShuttleTube } from "../../../shared/api-types";
import type { ShuttleTubeInput } from "../../../shared/schemas";
import {
  useCreateShuttleTube,
  useDeleteShuttleTube,
  useShuttleTubes,
  useUpdateShuttleTube,
} from "../adapters/react-query/shuttles-query";
import { useConfirm } from "../components/ConfirmDialog";
import { ShuttleTubeCard } from "../components/ShuttleTubeCard";
import { ShuttleTubeFormSheet } from "../components/ShuttleTubeFormSheet";
import { EmptyState, LoadingState } from "../components/ui";
import { shuttleErrorMessage } from "../core/domain/shuttle-errors";
import { Button } from "../ui/Button";

const NEW_TUBE = "new";

type FormTarget = typeof NEW_TUBE | ApiShuttleTube | null;

export function ShuttlesPage() {
  const tubesQuery = useShuttleTubes();
  const createTube = useCreateShuttleTube();
  const updateTube = useUpdateShuttleTube();
  const deleteTube = useDeleteShuttleTube();
  const confirm = useConfirm();
  const [formTarget, setFormTarget] = useState<FormTarget>(null);

  const tubes = tubesQuery.data?.tubes ?? [];
  const editingTube = formTarget === NEW_TUBE ? null : formTarget;

  async function handleSubmit(input: ShuttleTubeInput) {
    try {
      if (editingTube) {
        await updateTube.mutateAsync({ tubeId: editingTube.id, input });
      } else {
        await createTube.mutateAsync(input);
      }
      setFormTarget(null);
    } catch (error) {
      toast.error(shuttleErrorMessage(error));
    }
  }

  async function handleDelete(tube: ApiShuttleTube) {
    const ok = await confirm({
      title: `Xóa ${tube.name}?`,
      description: `Còn ${tube.stock} trái. Toàn bộ lịch sử của ống này sẽ mất, các khoản chi đã ghi vẫn giữ nguyên.`,
      confirmLabel: "Xóa ống",
      destructive: true,
    });
    if (!ok) return;

    try {
      await deleteTube.mutateAsync(tube.id);
    } catch (error) {
      toast.error(shuttleErrorMessage(error));
    }
  }

  if (tubesQuery.isError) {
    return (
      <EmptyState
        title="Không tải được kho cầu"
        description="Thử tải lại trang."
      />
    );
  }

  return (
    <div data-one-screen className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/"
          aria-label="Về trang chính"
          className="inline-flex h-9 items-center gap-1.5 rounded-ui border border-border bg-surface px-2.5 text-xs font-medium text-fg transition hover:bg-surface-muted"
        >
          <ArrowLeft size={14} />
          Trang chính
        </Link>
        <h1 className="flex-1 text-sm font-semibold text-fg">Kho cầu</h1>
        <Button
          size="sm"
          leftIcon={<Plus size={14} />}
          onClick={() => setFormTarget(NEW_TUBE)}
        >
          Thêm ống
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tubesQuery.isPending ? (
          <LoadingState label="Đang đếm cầu..." />
        ) : tubes.length === 0 ? (
          <EmptyState
            title="Chưa có ống cầu nào"
            description='Bấm "Thêm ống" để ghi ống đầu tiên, kho bắt đầu bằng 12 trái.'
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {tubes.map((tube) => (
              <ShuttleTubeCard
                key={tube.id}
                tube={tube}
                onEdit={() => setFormTarget(tube)}
                onDelete={() => handleDelete(tube)}
              />
            ))}
          </div>
        )}
      </div>

      <ShuttleTubeFormSheet
        open={formTarget !== null}
        tube={editingTube}
        pending={createTube.isPending || updateTube.isPending}
        onClose={() => setFormTarget(null)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
