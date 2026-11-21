import { Link } from "@tanstack/react-router";
import { Check, Terminal } from "lucide-react";
import { useState } from "react";
import { ssoLoginUrl } from "../adapters/browser/sso";
import { useApproveDeviceLogin } from "../adapters/react-query/queries";
import { useAppSession } from "../adapters/react-query/session-query";
import { BrandMark } from "../components/brand";
import { ThemeToggle } from "../components/theme";
import { LoadingState } from "../components/ui";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";

const ERROR_MESSAGE: Record<string, string> = {
  not_found:
    "Mã không đúng hoặc đã hết hạn. Chạy lại lệnh trên máy để lấy mã mới.",
  code_already_used: "Mã này đã được dùng rồi.",
  too_many_mcp_tokens: "Đã đủ số token. Thu hồi bớt trong Cài đặt rồi thử lại.",
  rate_limited: "Thử quá nhanh, chờ một phút rồi thử lại.",
};
const FALLBACK_ERROR = "Không duyệt được, thử lại sau.";
const CODE_PARAM = "user_code";
const CODE_LENGTH = 8;
const CODE_GROUP = CODE_LENGTH / 2;
const CODE_HINT = "Nhập đủ 8 ký tự để bật nút Cho phép.";

/** Giu chu va so viet hoa, toi da 8 ky tu, chen dau gach giua: ABCD-2345. */
function formatCode(raw: string) {
  const compact = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);
  return compact.length > CODE_GROUP
    ? `${compact.slice(0, CODE_GROUP)}-${compact.slice(CODE_GROUP)}`
    : compact;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-md items-center px-5">
      <Card className="w-full p-6">
        <div className="mb-6 flex items-start justify-between gap-3">
          <BrandMark size={56} />
          <ThemeToggle />
        </div>
        {children}
      </Card>
    </section>
  );
}

/**
 * Trang rieng (khong nam trong khung app) de cho phep may chay `chiakeo up`,
 * giong trang device cua GitHub: mot the o giua, ma lon, hai nut.
 */
export function DeviceLoginPage() {
  const { user, isPending } = useAppSession();
  const approve = useApproveDeviceLogin();
  const [code, setCode] = useState(() =>
    formatCode(
      new URLSearchParams(window.location.search).get(CODE_PARAM) ?? "",
    ),
  );

  if (isPending) {
    return (
      <section className="mx-auto flex min-h-dvh w-full max-w-md items-center px-5">
        <div className="w-full">
          <LoadingState />
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <Frame>
        <h1 className="text-2xl font-semibold text-fg">Cho phép CLI</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Đăng nhập để cho phép máy đang chạy <code>chiakeo up</code> truy cập
          kèo của bạn.
        </p>
        <Button
          block
          className="mt-6"
          onClick={() => {
            window.location.href = ssoLoginUrl(
              `/login/device${window.location.search}`,
            );
          }}
        >
          Tiếp tục với Google
        </Button>
      </Frame>
    );
  }

  if (approve.isSuccess) {
    return (
      <Frame>
        <Alert
          tone="success"
          icon={<Check size={18} />}
          title={`Đã cho phép "${approve.data.name}"`}
        >
          Quay lại terminal, không cần làm gì thêm. Thu hồi bất cứ lúc nào trong
          Cài đặt.
        </Alert>
        <Link
          to="/"
          className="mt-4 block text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Về trang chủ
        </Link>
      </Frame>
    );
  }

  const errorMessage = approve.error
    ? ERROR_MESSAGE[approve.error.message] || FALLBACK_ERROR
    : "";

  return (
    <Frame>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          approve.mutate(code);
        }}
      >
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-fg">
          <Terminal size={22} />
          Cho phép CLI
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Bạn đang đăng nhập là <strong className="text-fg">{user.name}</strong>
          . Máy hiện mã này sẽ đọc và ghi kèo như bạn.
        </p>
        <Field
          className="mt-6"
          label="Mã trên terminal"
          error={errorMessage || undefined}
          hint={code.length === CODE_LENGTH + 1 ? undefined : CODE_HINT}
        >
          <Input
            value={code}
            onChange={(event) => setCode(formatCode(event.target.value))}
            placeholder="ABCD-2345"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            className="h-14 text-center font-mono text-2xl tracking-[0.3em] sm:h-14"
          />
        </Field>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            block
            type="submit"
            loading={approve.isPending}
            disabled={code.length !== CODE_LENGTH + 1}
          >
            Cho phép
          </Button>
          <Link
            to="/"
            className="text-center text-sm font-medium text-fg-muted underline-offset-4 hover:underline"
          >
            Hủy
          </Link>
        </div>
      </form>
    </Frame>
  );
}
