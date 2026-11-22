import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Layers, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MAX_BUNDLE_GAMES, MIN_BUNDLE_GAMES } from "../../../shared/schemas";
import {
  useBundles,
  useCreateBundle,
} from "../adapters/react-query/bundles-query";
import { useGames } from "../adapters/react-query/queries";
import { EmptyState, LoadingState } from "../components/ui";
import { PagedList } from "../ui/PagedList";
import { Sheet } from "../ui/Sheet";

const ROW_HEIGHT_PX = 56;

function CreateBundleForm({ onDone }: { onDone: (bundleId: string) => void }) {
  const gamesQuery = useGames();
  const createBundle = useCreateBundle();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const games = gamesQuery.data || [];
  const canSubmit =
    name.trim() !== "" &&
    picked.length >= MIN_BUNDLE_GAMES &&
    !createBundle.isPending;

  function toggle(gameId: string) {
    setPicked((current) =>
      current.includes(gameId)
        ? current.filter((id) => id !== gameId)
        : current.length < MAX_BUNDLE_GAMES
          ? [...current, gameId]
          : current,
    );
  }

  async function submit() {
    try {
      const bundle = await createBundle.mutateAsync({
        name: name.trim(),
        gameIds: picked,
      });
      onDone(bundle.id);
    } catch {
      toast.error("Không tạo được cuộc chơi cha.");
    }
  }

  return (
    <div className="space-y-3">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Tên cuộc chơi cha"
        aria-label="Tên cuộc chơi cha"
        className="h-11 w-full rounded-md border border-border bg-surface px-3 text-base"
      />
      <p className="text-xs text-fg-muted">
        Chọn từ {MIN_BUNDLE_GAMES} đến {MAX_BUNDLE_GAMES} cuộc chơi con (đã chọn{" "}
        {picked.length}).
      </p>
      <ul className="max-h-64 space-y-1.5 overflow-y-auto">
        {games.map((game) => (
          <li key={game.id}>
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm">
              <input
                type="checkbox"
                checked={picked.includes(game.id)}
                onChange={() => toggle(game.id)}
                className="h-4 w-4"
              />
              <span className="truncate">{game.name}</span>
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={submit}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-40"
      >
        Tạo cuộc chơi cha
      </button>
    </div>
  );
}

/**
 * Cuoc cha gom nhieu cuoc con co san, de thu tien mot lan cho nguoi no nhieu
 * cuoc. Trang nay liet ke va tao; thu tien o trang chi tiet.
 */
export function BundlesPage() {
  const bundlesQuery = useBundles();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  if (bundlesQuery.isPending) return <LoadingState />;
  if (bundlesQuery.isError) {
    return (
      <EmptyState
        title="Không tải được cuộc chơi cha"
        description="Thử tải lại trang."
      />
    );
  }

  const bundles = bundlesQuery.data;

  return (
    <div data-one-screen className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/"
          aria-label="Về trang chính"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium"
        >
          <ArrowLeft size={14} />
          Trang chính
        </Link>
        <h1 className="flex-1 text-sm font-semibold">Cuộc chơi cha</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary-hover"
        >
          <Plus size={16} />
          Tạo
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <PagedList
          items={bundles}
          getKey={(bundle) => bundle.id}
          rowHeight={ROW_HEIGHT_PX}
          empty={
            <EmptyState
              title="Chưa có cuộc chơi cha"
              description="Gom nhiều cuộc chơi để thu tiền một lần."
            />
          }
          renderItem={(bundle) => (
            <Link
              to="/bundles/$bundleId"
              params={{ bundleId: bundle.id }}
              className="flex h-full items-center gap-2 rounded-lg border border-border px-3 transition active:bg-surface-muted"
            >
              <Layers size={16} className="shrink-0 text-fg-muted" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {bundle.name}
              </span>
              <span className="text-xs text-fg-muted">
                {bundle.gameCount} cuộc
              </span>
            </Link>
          )}
        />
      </div>
      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="Tạo cuộc chơi cha"
      >
        <CreateBundleForm
          onDone={(bundleId) => {
            setCreating(false);
            navigate({ to: "/bundles/$bundleId", params: { bundleId } });
          }}
        />
      </Sheet>
    </div>
  );
}
