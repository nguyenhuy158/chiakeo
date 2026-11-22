import { MapPin, Tag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  GAME_LOCATION_MAX_LENGTH,
  MAX_TAGS_PER_GAME,
  TAG_MAX_LENGTH,
  uniqueTags,
} from "../../../shared/schemas";
import {
  usePreferences,
  useUpdateGameMeta,
} from "../adapters/react-query/queries";
import { AdaptiveSheet } from "./AdaptiveSheet";

const CHIP =
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold";

type GameMetaSheetProps = {
  location: string;
  tags: string[];
  knownTags: string[];
  pending: boolean;
  onClose: () => void;
  onSave: (input: { location: string; tags: string[] }) => void;
};

function GameMetaSheet({
  location,
  tags,
  knownTags,
  pending,
  onClose,
  onSave,
}: GameMetaSheetProps) {
  const [place, setPlace] = useState(location);
  const [picked, setPicked] = useState(tags);
  const [draft, setDraft] = useState("");
  const options = uniqueTags([...knownTags, ...picked]);
  const isPicked = (tag: string) =>
    picked.some((item) => item.toLowerCase() === tag.toLowerCase());

  function toggle(tag: string) {
    setPicked((current) =>
      isPicked(tag)
        ? current.filter((item) => item.toLowerCase() !== tag.toLowerCase())
        : [...current, tag],
    );
  }

  function addDraft() {
    const name = draft.trim();
    if (!name) return;
    if (picked.length >= MAX_TAGS_PER_GAME && !isPicked(name)) {
      toast.error(`Tối đa ${MAX_TAGS_PER_GAME} tag cho một cuộc chơi`);
      return;
    }
    setPicked((current) => uniqueTags([...current, name]));
    setDraft("");
  }

  return (
    <AdaptiveSheet open onClose={onClose} title="Tag và địa điểm">
      <div className="flex flex-col gap-4 pb-2">
        <label className="block">
          <span className="text-xs font-medium text-fg-muted">Địa điểm</span>
          <input
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            maxLength={GAME_LOCATION_MAX_LENGTH}
            placeholder="Ví dụ: Sân cầu lông Q7"
            className="field mt-1"
          />
        </label>
        <div>
          <span className="text-xs font-medium text-fg-muted">Tag</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {options.length === 0 && (
              <p className="text-sm text-fg-muted">Chưa có tag nào.</p>
            )}
            {options.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={isPicked(tag)}
                onClick={() => toggle(tag)}
                className={`${CHIP} ${
                  isPicked(tag)
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border text-fg-muted"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addDraft();
              }}
              maxLength={TAG_MAX_LENGTH}
              placeholder="Tạo tag mới"
              aria-label="Tạo tag mới"
              className="field min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={addDraft}
              className="h-11 shrink-0 rounded-md border border-stone-300 px-3 text-sm font-semibold text-stone-700 dark:border-stone-700 dark:text-stone-200"
            >
              Thêm
            </button>
          </div>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => onSave({ location: place.trim(), tags: picked })}
          className="h-11 rounded-md bg-primary text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          Lưu
        </button>
      </div>
    </AdaptiveSheet>
  );
}

/** Dia diem va tag cua cuoc choi, bam vao de sua. Tag moi tao ngay luc gan. */
export function GameMetaBar({
  gameId,
  location,
  tags,
}: {
  gameId: string;
  location: string;
  tags: string[];
}) {
  const [open, setOpen] = useState(false);
  const { tags: knownTags } = usePreferences();
  const updateMeta = useUpdateGameMeta(gameId);

  async function handleSave(input: { location: string; tags: string[] }) {
    try {
      await updateMeta.mutateAsync(input);
      setOpen(false);
      toast.success("Đã lưu tag và địa điểm");
    } catch {
      toast.error("Lưu thất bại, thử lại sau");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {location && (
        <span className={`${CHIP} border-border text-fg-muted`}>
          <MapPin size={12} />
          {location}
        </span>
      )}
      {tags.map((tag) => (
        <span key={tag} className={`${CHIP} border-primary text-primary`}>
          {tag}
        </span>
      ))}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Sửa tag và địa điểm"
        className={`${CHIP} border-dashed border-border text-fg-muted transition hover:bg-surface-muted`}
      >
        <Tag size={12} />
        {!location && tags.length === 0 && "Thêm tag, địa điểm"}
      </button>
      {open && (
        <GameMetaSheet
          location={location}
          tags={tags}
          knownTags={knownTags}
          pending={updateMeta.isPending}
          onClose={() => setOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
