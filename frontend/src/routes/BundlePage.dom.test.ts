import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBundleDetail } from "../../../shared/api-types";

const { state, settle, confirm } = vi.hoisted(() => ({
  state: { data: undefined as ApiBundleDetail | undefined },
  settle: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("../adapters/react-query/bundles-query", () => ({
  useBundle: () => ({
    data: state.data,
    isPending: false,
    isError: state.data === undefined,
  }),
  useSettleBundle: () => ({ mutateAsync: settle, isPending: false }),
  useDeleteBundle: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../components/ConfirmDialog", () => ({ useConfirm: () => confirm }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("../ui/PagedList", async () => {
  const { createElement: element, Fragment } = await import("react");
  return {
    PagedList: ({
      items,
      getKey,
      renderItem,
    }: {
      items: unknown[];
      getKey: (item: unknown) => string;
      renderItem: (item: unknown) => ReactNode;
    }) =>
      element(
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
    useNavigate: () => vi.fn(),
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
});
