import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SummaryTextInput } from "../../../shared/summary-text";

const { renderSummaryImage } = vi.hoisted(() => ({
  renderSummaryImage: vi.fn(),
}));

vi.mock("../adapters/browser/summary-image", () => ({ renderSummaryImage }));
vi.mock("./use-summary-image-background", () => ({
  useSummaryImageBackground: () => ["mint", vi.fn()],
}));

import { ShareSummaryImage } from "./ShareSummaryImage";

const input = {
  code: "CK01",
  name: "Cầu tối",
  participants: [],
  expenses: [],
  summary: { totalExpense: 0, balances: [], settlements: [] },
} as SummaryTextInput;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  renderSummaryImage.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:summary");
  URL.revokeObjectURL = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ShareSummaryImage", () => {
  it("draws the compact image without a QR and shows it", async () => {
    renderSummaryImage.mockResolvedValue(new Blob(["png"]));
    await act(async () => {
      root.render(createElement(ShareSummaryImage, { input }));
    });
    expect(host.textContent).not.toContain("Đang vẽ ảnh");
    expect(renderSummaryImage).toHaveBeenCalledWith(
      input,
      "compact",
      "mint",
      false,
      true,
    );
    const image = host.querySelector("img") as HTMLImageElement;
    expect(image.alt).toBe("Ảnh tổng kết");
    expect(image.src).toBe("blob:summary");
    act(() => root.unmount());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:summary");
    root = createRoot(host);
  });

  it("shows a loading hint, then an error when drawing fails", async () => {
    renderSummaryImage.mockRejectedValue(new Error("canvas"));
    act(() => {
      root.render(createElement(ShareSummaryImage, { input }));
    });
    expect(host.textContent).toContain("Đang vẽ ảnh");
    await act(async () => {});
    expect(host.querySelector("[role='alert']")?.textContent).toContain(
      "Không vẽ được ảnh tổng kết",
    );
  });

  it("ignores a result that arrives after unmount", async () => {
    let finish: (blob: Blob) => void = () => {};
    renderSummaryImage.mockReturnValue(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
    );
    act(() => {
      root.render(createElement(ShareSummaryImage, { input }));
    });
    act(() => root.unmount());
    await act(async () => finish(new Blob(["png"])));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    root = createRoot(host);
  });

  it("ignores a failure that arrives after unmount", async () => {
    let fail: (error: Error) => void = () => {};
    renderSummaryImage.mockReturnValue(
      new Promise<Blob>((_resolve, reject) => {
        fail = reject;
      }),
    );
    act(() => {
      root.render(createElement(ShareSummaryImage, { input }));
    });
    act(() => root.unmount());
    await act(async () => fail(new Error("late")));
    expect(host.querySelector("[role='alert']")).toBeNull();
    root = createRoot(host);
  });
});
