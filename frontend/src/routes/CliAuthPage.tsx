import { Check, Terminal } from "lucide-react";
import { useState } from "react";
import { useApproveCliAuth } from "../adapters/react-query/queries";
import { Field } from "../components/ui";

const ERROR_MESSAGE: Record<string, string> = {
  not_found:
    "Mã không đúng hoặc đã hết hạn. Chạy lại lệnh trên máy để lấy mã mới.",
  code_already_used: "Mã này đã được dùng rồi.",
  too_many_mcp_tokens: "Đã đủ số token. Thu hồi bớt trong Cài đặt rồi thử lại.",
  rate_limited: "Thử quá nhanh, chờ một phút rồi thử lại.",
};
const FALLBACK_ERROR = "Không duyệt được, thử lại sau.";
const CODE_PARAM = "code";

/** Trang nguoi dung go ma hien tren CLI de cho phep may do dang nhap. */
export function CliAuthPage() {
  const approve = useApproveCliAuth();
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get(CODE_PARAM) ?? "",
  );

  if (approve.isSuccess) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <Check size={40} className="mx-auto text-emerald-600" />
        <h1 className="mt-3 text-xl font-bold text-stone-950 dark:text-stone-50">
          Đã cho phép
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          "{approve.data.name}" đã đăng nhập. Quay lại terminal, không cần làm
          gì thêm. Thu hồi bất cứ lúc nào trong Cài đặt.
        </p>
      </div>
    );
  }

  const errorMessage = approve.error
    ? ERROR_MESSAGE[approve.error.message] || FALLBACK_ERROR
    : "";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        approve.mutate(code);
      }}
      className="mx-auto max-w-md space-y-4 px-4 py-10"
    >
      <div className="flex items-center gap-2">
        <Terminal size={20} />
        <h1 className="text-xl font-bold text-stone-950 dark:text-stone-50">
          Cho phép CLI
        </h1>
      </div>
      <p className="text-sm text-fg-muted">
        Nhập mã hiện trên terminal sau khi chạy <code>chiakeo up</code>. Máy đó
        sẽ đọc và ghi kèo như bạn.
      </p>
      <Field label="Mã trên terminal" error={errorMessage}>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="field tabular uppercase"
          placeholder="ABCD-2345"
          autoComplete="off"
          autoCapitalize="characters"
        />
      </Field>
      <button
        type="submit"
        disabled={!code.trim() || approve.isPending}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-stone-300 dark:disabled:bg-stone-700"
      >
        {approve.isPending ? "Đang duyệt..." : "Cho phép"}
      </button>
    </form>
  );
}
