import type { ShareSection } from "../../../shared/schemas";
import {
  usePreferences,
  useUpdatePreferences,
  useUpdateShareShow,
} from "../adapters/react-query/queries";
import { Switch } from "./ui";

const SHARE_OPTIONS: Array<{ id: ShareSection; label: string }> = [
  { id: "expenses", label: "Các khoản chi" },
  { id: "matrix", label: "Bảng chia" },
  { id: "photos", label: "Ảnh" },
];

type GameSettingsGame = { id: string; shareShow: ShareSection[] };

function ShareOptions({
  gameId,
  shareShow,
}: { gameId: string } & Pick<GameSettingsGame, "shareShow">) {
  const updateShareShow = useUpdateShareShow(gameId);

  return (
    <>
      <p className="text-sm font-medium">Link chia sẻ hiện thêm (cuộc này)</p>
      {SHARE_OPTIONS.map((option) => (
        <Switch
          key={option.id}
          checked={shareShow.includes(option.id)}
          onChange={(next) =>
            updateShareShow.mutate(
              next
                ? [...shareShow, option.id]
                : shareShow.filter((id) => id !== option.id),
            )
          }
          label={option.label}
        />
      ))}
    </>
  );
}

/**
 * Cac tuy chon luu theo tai khoan (dung chung moi cuoc choi), gom mot cho de
 * chinh cho tien thay vi rai rac o tung the. Co `game` thi them tuy chon rieng
 * cua cuoc choi do (link chia se hien gi).
 */
export function GameSettingsPanel({ game }: { game?: GameSettingsGame }) {
  const {
    summaryShowQr,
    summaryShowAvatar,
    roundDownRefunds,
    hideSettledGames,
  } = usePreferences();
  const updatePreferences = useUpdatePreferences();

  return (
    <div className="flex flex-col gap-4 pb-2">
      <Switch
        checked={roundDownRefunds}
        onChange={(next) =>
          updatePreferences.mutate({ roundDownRefunds: next })
        }
        label="Không hoàn tiền lẻ (làm tròn xuống 1.000đ)"
      />
      <Switch
        checked={hideSettledGames}
        onChange={(next) =>
          updatePreferences.mutate({ hideSettledGames: next })
        }
        label="Ẩn cuộc chơi đã thu tiền xong khỏi danh sách"
      />
      <Switch
        checked={summaryShowQr}
        onChange={(next) => updatePreferences.mutate({ summaryShowQr: next })}
        label="Hiện QR chuyển khoản trên ảnh"
      />
      <Switch
        checked={summaryShowAvatar}
        onChange={(next) =>
          updatePreferences.mutate({ summaryShowAvatar: next })
        }
        label="Hiện avatar trước tên trên ảnh"
      />
      {game && <ShareOptions gameId={game.id} shareShow={game.shareShow} />}
    </div>
  );
}
