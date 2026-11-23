import { useState } from "react";
import {
  useArchiveGame,
  useClosedGames,
  useGames,
} from "../adapters/react-query/queries";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Sheet } from "../ui/Sheet";

export function BulkArchiveGames() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");
  const activeQuery = useGames();
  const closedQuery = useClosedGames(open);
  const archive = useArchiveGame();
  const games = [...(activeQuery.data ?? []), ...(closedQuery.data ?? [])]
    .filter((game) => game.isOwner)
    .filter(
      (game, index, items) =>
        items.findIndex((item) => item.id === game.id) === index,
    );
  const selectedGames = games.filter((game) => selected.includes(game.id));
  const loading = activeQuery.isPending || closedQuery.isPending;
  const failedToLoad = activeQuery.isError || closedQuery.isError;

  function close() {
    if (running) return;
    setOpen(false);
    setConfirming(false);
    setSelected([]);
    setResult("");
  }

  async function archiveSelected() {
    setRunning(true);
    setResult("");
    const failed: string[] = [];
    const targets = selectedGames;
    for (const game of targets) {
      try {
        await archive.mutateAsync(game.id);
      } catch {
        failed.push(game.id);
      }
    }
    setSelected(failed);
    setResult(
      `Đã lưu trữ ${targets.length - failed.length}/${targets.length} cuộc.${failed.length > 0 ? ` ${failed.length} cuộc chưa lưu trữ được; chọn tiếp để thử lại.` : " Khôi phục được ở mục Đã lưu trữ."}`,
    );
    setConfirming(false);
    setRunning(false);
  }

  return (
    <>
      <Button variant="outline" block onClick={() => setOpen(true)}>
        Lưu trữ nhiều cuộc
      </Button>
      <Sheet open={open} onClose={close} title="Lưu trữ nhiều cuộc">
        <div className="mx-auto flex max-w-xl flex-col gap-3">
          <p className="text-sm text-fg-muted">
            Cuộc đang chơi và đã đóng do tài khoản sở hữu. Lưu trữ không xóa dữ
            liệu; khôi phục được ở mục Đã lưu trữ.
          </p>
          {result && (
            <p role="status" className="text-sm text-fg">
              {result}
            </p>
          )}
          {loading ? (
            <p>Đang tải cuộc chơi…</p>
          ) : failedToLoad ? (
            <p role="alert">
              Không tải đủ danh sách. Đóng và mở lại để thử lại.
            </p>
          ) : confirming ? (
            <>
              <p className="font-semibold">
                Lưu trữ {selectedGames.length} cuộc đã chọn?
              </p>
              <ul className="max-h-[35dvh] overflow-y-auto text-sm">
                {selectedGames.map((game) => (
                  <li key={game.id} className="truncate py-1">
                    {game.name}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={running}
                  onClick={() => setConfirming(false)}
                >
                  Quay lại
                </Button>
                <Button
                  loading={running}
                  disabled={selectedGames.length === 0}
                  onClick={archiveSelected}
                >
                  Xác nhận lưu trữ
                </Button>
              </div>
            </>
          ) : (
            <>
              {games.length === 0 ? (
                <p>Không có cuộc nào để lưu trữ.</p>
              ) : (
                <>
                  <Checkbox
                    label={`Chọn tất cả (${games.length})`}
                    checked={selectedGames.length === games.length}
                    indeterminate={
                      selectedGames.length > 0 &&
                      selectedGames.length < games.length
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? games.map((game) => game.id)
                          : [],
                      )
                    }
                  />
                  <div className="max-h-[35dvh] overflow-y-auto">
                    {games.map((game) => (
                      <Checkbox
                        key={game.id}
                        label={
                          <span className="block truncate">{game.name}</span>
                        }
                        checked={selected.includes(game.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, game.id]
                              : current.filter((id) => id !== game.id),
                          )
                        }
                      />
                    ))}
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={close}>
                  Đóng
                </Button>
                <Button
                  disabled={selectedGames.length === 0}
                  onClick={() => setConfirming(true)}
                >
                  Tiếp tục ({selectedGames.length})
                </Button>
              </div>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
