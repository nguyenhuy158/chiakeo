import { Link } from "@tanstack/react-router";
import { Check, Terminal, X } from "lucide-react";
import { useState } from "react";
import { ssoLoginUrl } from "../adapters/browser/sso";
import {
  useApproveDeviceLogin,
  useDenyDeviceLogin,
  useLookupDeviceLogin,
} from "../adapters/react-query/queries";
import { useAppSession } from "../adapters/react-query/session-query";
import { BrandMark } from "../components/brand";
import { ThemeToggle } from "../components/theme";
import { LoadingState } from "../components/ui";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { CodeInput } from "../ui/CodeInput";
import { Field } from "../ui/Field";

const ERROR_MESSAGE: Record<string, string> = {
  not_found:
    "Mã không đúng hoặc đã hết hạn. Chạy lại lệnh trên máy để lấy mã mới.",
  code_already_used: "Mã này đã được duyệt hoặc đã bị từ chối rồi.",
  too_many_mcp_tokens: "Đã đủ số token. Thu hồi bớt trong Cài đặt rồi thử lại.",
  rate_limited: "Thử quá nhanh, chờ một phút rồi thử lại.",
};
const FALLBACK_ERROR = "Không duyệt được, thử lại sau.";
const CODE_LENGTH = 8;
const CODE_HINT = "Nhập đủ 8 ký tự để bật nút Tiếp tục.";

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
 * giong trang device cua GitHub, hai buoc: go ma, roi xac nhan ten may.
 * Khong dien san ma tu URL: neu khong, mot duong link la du de lua nguoi dung
 * cap quyen cho may cua ke xau (RFC 8628, muc 3.3 va 5.4).
 */
export function DeviceLoginPage() {
  const { user, isPending } = useAppSession();
  const lookup = useLookupDeviceLogin();
  const approve = useApproveDeviceLogin();
  const deny = useDenyDeviceLogin();
  const [code, setCode] = useState("");

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
            window.location.href = ssoLoginUrl("/login/device");
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
        <HomeLink />
      </Frame>
    );
  }

  if (deny.isSuccess) {
    return (
      <Frame>
        <Alert
          tone="info"
          icon={<X size={18} />}
          title={`Đã từ chối "${deny.data.name}"`}
        >
          Máy đó không được cấp quyền. Nếu không phải bạn vừa chạy lệnh, không
          cần làm gì thêm.
        </Alert>
        <HomeLink />
      </Frame>
    );
  }

  if (lookup.isSuccess) {
    const device = lookup.data;
    const decisionError = approve.error ?? deny.error;
    return (
      <Frame>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-fg">
          <Terminal size={22} />
          Cho phép "{device.name}"?
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Máy này sẽ đọc và ghi kèo như{" "}
          <strong className="text-fg">{user.name}</strong>. Chỉ cho phép nếu
          chính bạn vừa chạy <code>chiakeo up</code> và mã dưới đây đang hiện
          trên terminal.
        </p>
        <p className="mt-4 rounded-ui border border-border bg-surface-muted py-3 text-center font-mono text-2xl tracking-[0.3em] text-fg">
          {device.user_code}
        </p>
        {decisionError && (
          <Alert tone="danger" className="mt-4">
            {ERROR_MESSAGE[decisionError.message] || FALLBACK_ERROR}
          </Alert>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <Button
            block
            loading={approve.isPending}
            disabled={deny.isPending}
            onClick={() => approve.mutate(device.user_code)}
          >
            Cho phép
          </Button>
          <Button
            block
            variant="outline"
            loading={deny.isPending}
            disabled={approve.isPending}
            onClick={() => deny.mutate(device.user_code)}
          >
            Từ chối
          </Button>
          <Button
            block
            variant="ghost"
            onClick={() => {
              lookup.reset();
              approve.reset();
              deny.reset();
              setCode("");
            }}
          >
            Nhập mã khác
          </Button>
        </div>
      </Frame>
    );
  }

  const errorMessage = lookup.error
    ? ERROR_MESSAGE[lookup.error.message] || FALLBACK_ERROR
    : "";

  return (
    <Frame>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          lookup.mutate(code);
        }}
      >
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-fg">
          <Terminal size={22} />
          Cho phép CLI
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Bạn đang đăng nhập là <strong className="text-fg">{user.name}</strong>
          . Nhập mã đang hiện trên terminal sau khi chạy <code>chiakeo up</code>
          .
        </p>
        <Field
          className="mt-6"
          label="Mã trên terminal"
          error={errorMessage || undefined}
          hint={code.length === CODE_LENGTH ? undefined : CODE_HINT}
        >
          <CodeInput value={code} onChange={setCode} />
        </Field>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            block
            type="submit"
            loading={lookup.isPending}
            disabled={code.length !== CODE_LENGTH}
          >
            Tiếp tục
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

function HomeLink() {
  return (
    <Link
      to="/"
      className="mt-4 block text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      Về trang chủ
    </Link>
  );
}
