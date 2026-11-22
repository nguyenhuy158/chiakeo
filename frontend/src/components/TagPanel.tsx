import { X } from "lucide-react";
import { useState } from "react";
import {
  MAX_USER_TAGS,
  TAG_MAX_LENGTH,
  uniqueTags,
} from "../../../shared/schemas";
import {
  usePreferences,
  useUpdatePreferences,
} from "../adapters/react-query/queries";

/**
 * Tag cua tai khoan. Xoa o day chi bo khoi danh sach goi y: cuoc choi da gan
 * van giu chu cho den khi go khoi cuoc do.
 */
export function TagPanel() {
  const { tags } = usePreferences();
  const updatePreferences = useUpdatePreferences();
  const [draft, setDraft] = useState("");
  const full = tags.length >= MAX_USER_TAGS;

  function addDraft() {
    const name = draft.trim();
    if (!name || full) return;
    updatePreferences.mutate({ tags: uniqueTags([...tags, name]) });
    setDraft("");
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-stone-950 dark:text-stone-50">
        Tag cuộc chơi
      </h2>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tags.length === 0 && (
          <p className="text-sm text-fg-muted">Chưa có tag nào.</p>
        )}
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-primary ps-2.5 text-xs font-semibold text-primary"
          >
            {tag}
            <button
              type="button"
              aria-label={`Xóa tag ${tag}`}
              onClick={() =>
                updatePreferences.mutate({
                  tags: tags.filter((item) => item !== tag),
                })
              }
              className="inline-flex h-7 w-7 items-center justify-center rounded-full"
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
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
          disabled={full}
          className="h-11 shrink-0 rounded-md border border-stone-300 px-3 text-sm font-semibold text-stone-700 disabled:opacity-50 dark:border-stone-700 dark:text-stone-200"
        >
          Thêm
        </button>
      </div>
    </section>
  );
}
