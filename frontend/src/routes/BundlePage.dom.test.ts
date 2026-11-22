import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBundleDetail } from "../../../shared/api-types";

const { state, settle, confirm, remove, navigate, error } = vi.hoisted(() => ({
  state: {
    data: undefined as ApiBundleDetail | undefined,
    pending: false,
  },
  settle: vi.fn(),
  confirm: vi.fn(),
  remove: vi.fn(),
  navigate: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../adapters/react-query/bundles-query", () => ({
  useBundle: () => ({
    data: state.data,
    isPending: state.pending,
    isError: state.data === undefined,
  }),
  useSettleBundle: () => ({ mutateAsync: settle, isPending: false }),
  useDeleteBundle: () => ({ mutateAsync: remove }),
}));
vi.mock("../components/ConfirmDialog", () => ({ useConfirm: () => confirm }));
vi.mock("sonner", () => ({ toast: { error, success: vi.fn() } }));
vi.mock("../ui/PagedList", async () => {
  const { createElement: element, Fragment } = await import("react");
  return {
    PagedList: ({
      items,
      getKey,
      renderItem,
      empty,
    }: {
      items: unknown[];
      getKey: (item: unknown) => string;
      renderItem: (item: unknown) => ReactNode;
      empty: ReactNode;
    }) =>
      items.length === 0
        ? empty
        : element(
            Fragment,
            null,
            items.map((item) =>
              element("div", { key: getKey(item) }, renderItem(item)),
            ),
          ),
  };
});
vi.mock("@tanstack/react-router", async () => {
  const { createElement: element } = await import("react");
  return {
    Link: ({ children }: { children: ReactNode }) =>
      element("a", null, children),
    useNavigate: () => navigate,
    useParams: () => ({ bundleId: "bundle_1" }),
  };
});

import { BundlePage } from "./BundlePage";

let host: HTMLDivElement;
let root: Root;

const BUNDLE: ApiBundleDetail = {
  id: "bundle_1",
  name: "Tháng 8",
  games: [
    { id: "g1", code: "G1", name: "Cầu lông" },
    { id: "g2", code: "G2", name: "Pickle" },
  ],
  people: [
    {
      name: "Nam",
      total: 150_000,
      debts: [
        { gameId: "g1", gameName: "Cầu lông", toName: "Huy", amount: 100_000 },
        { gameId: "g2", gameName: "Pickle", toName: "Huy", amount: 50_000 },
      ],
    },
  ],
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.data = BUNDLE;
  state.pending = false;
  remove.mockReset().mockResolvedValue({ ok: true });
  navigate.mockReset();
  error.mockReset();
  settle.mockReset().mockResolvedValue(BUNDLE);
  confirm.mockReset().mockResolvedValue(true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("BundlePage", () => {
  it("lists each person once with the games they owe in", () => {
    act(() => root.render(createElement(BundlePage)));
    expect(host.textContent).toContain("Nam");
    expect(host.textContent).toContain("Cầu lông");
    expect(host.textContent).toContain("Pickle");
  });

  it("settles the picked people in one request", async () => {
    act(() => root.render(createElement(BundlePage)));
    const box = host.querySelector(
      '[aria-label="Chọn Nam"]',
    ) as HTMLInputElement;
    act(() => box.click());
    const submit = [...host.querySelectorAll("button")].find((item) =>
      item.textContent?.startsWith("Ghi nhận 1 người"),
    ) as HTMLButtonElement;
    await act(async () => submit.click());
    expect(confirm).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith({ names: ["Nam"] });
  });

  it("keeps the button off until someone is picked", () => {
    act(() => root.render(createElement(BundlePage)));
    const submit = [...host.querySelectorAll("button")].find((item) =>
      item.textContent?.startsWith("Chọn người"),
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("shows loading and missing states", () => {
    state.pending = true;
    act(() => root.render(createElement(BundlePage)));
    expect(host.textContent).not.toContain("Tháng 8");
    state.pending = false;
    state.data = undefined;
    act(() => root.render(createElement(BundlePage)));
    expect(host.textContent).toContain("Không tìm thấy cuộc chơi cha");
  });

  it("shows an empty state once nobody owes", () => {
    state.data = { ...BUNDLE, people: [] };
    act(() => root.render(createElement(BundlePage)));
    expect(host.textContent).toContain("Không còn ai nợ");
  });

  it("unpicks a person and skips settling when the dialog is declined", async () => {
    act(() => root.render(createElement(BundlePage)));
    const box = host.querySelector(
      '[aria-label="Chọn Nam"]',
    ) as HTMLInputElement;
    act(() => box.click());
    act(() => box.click());
    expect(host.textContent).toContain("Chọn người");
    act(() => box.click());
    confirm.mockResolvedValue(false);
    const submit = [...host.querySelectorAll("button")].find((item) =>
      item.textContent?.startsWith("Ghi nhận 1 người"),
    ) as HTMLButtonElement;
    await act(async () => submit.click());
    expect(settle).not.toHaveBeenCalled();
  });

  it("reports a failed settle", async () => {
    settle.mockRejectedValue(new Error("boom"));
    act(() => root.render(createElement(BundlePage)));
    act(() =>
      (
        host.querySelector('[aria-label="Chọn Nam"]') as HTMLInputElement
      ).click(),
    );
    const submit = [...host.querySelectorAll("button")].find((item) =>
      item.textContent?.startsWith("Ghi nhận 1 người"),
    ) as HTMLButtonElement;
    await act(async () => submit.click());
    expect(error).toHaveBeenCalled();
  });

  it("deletes the bundle after confirming and goes back to the list", async () => {
    act(() => root.render(createElement(BundlePage)));
    const del = host.querySelector(
      '[aria-label="Xóa cuộc chơi cha"]',
    ) as HTMLButtonElement;
    confirm.mockResolvedValueOnce(false);
    await act(async () => del.click());
    expect(remove).not.toHaveBeenCalled();
    await act(async () => del.click());
    expect(remove).toHaveBeenCalledWith("bundle_1");
    expect(navigate).toHaveBeenCalledWith({ to: "/bundles" });
  });
});
