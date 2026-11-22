import { useEffect, useState } from "react";
import type { SummaryTextInput } from "../../../shared/summary-text";
import { renderSummaryImage } from "../adapters/browser/summary-image";
import { useSummaryImageBackground } from "./use-summary-image-background";

const SHARE_SUMMARY_VARIANT = "compact";
const SHOW_QR_ON_SHARE = false;
const SHOW_AVATAR_ON_SHARE = true;

type ShareSummaryImageProps = {
  input: SummaryTextInput;
};

/** Anh tong ket cua cuoc choi cho nguoi xem link chia se; khong co QR. */
export function ShareSummaryImage({ input }: ShareSummaryImageProps) {
  const [backgroundId] = useSummaryImageBackground();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const inputKey = JSON.stringify(input);

  // biome-ignore lint/correctness/useExhaustiveDependencies: inputKey is the content of input
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setFailed(false);

    renderSummaryImage(
      input,
      SHARE_SUMMARY_VARIANT,
      backgroundId,
      SHOW_QR_ON_SHARE,
      SHOW_AVATAR_ON_SHARE,
    ).then(
      (blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [inputKey, backgroundId]);

  if (failed) {
    return (
      <p role="alert" className="py-6 text-center text-sm text-danger">
        Không vẽ được ảnh tổng kết, thử tải lại trang.
      </p>
    );
  }
  if (!url) {
    return (
      <p className="py-6 text-center text-sm text-fg-muted">Đang vẽ ảnh…</p>
    );
  }
  return (
    <img
      src={url}
      alt="Ảnh tổng kết"
      className="mx-auto h-full max-h-full w-auto max-w-full rounded-lg object-contain"
    />
  );
}
