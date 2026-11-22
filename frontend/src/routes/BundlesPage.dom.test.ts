import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, create, navigate, error } = vi.hoisted(() => ({
  state: {
    bundles: undefined as
      | { id: string; name: string; createdAt: string; gameCount: number }[]
      | undefined,
    pending: false,
    creating: false,
    games: undefined as { id: string; name: string }[] | undefined,
  },
  create: vi.fn(),
  navigate: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../adapters/react-query/bundles-query", () => ({
  useBundles: () => ({
    data: state.bundles,
    isPending: state.pending,
    isError: state.bundles === undefined,
  }),
  useCreateBundle: () => ({
    mutateAsync: create,
    isPending: state.creating,
  }),
}));
vi.mock("../adapters/react-query/queries", () => ({
  useGames: () => ({ data: state.games }),
}));
vi.mock("sonner", () => ({ toast: { error } }));
vi.mock("../ui/Sheet", async () => {
  const { createElement: element } = await import("react");
  return {
    Sheet: ({
      open,
      onClose,
      children,
    }: {
      open: boolean;
      onClose: () => void;
      children: ReactNode;
    }) =>
      open
        ? element(
            "div",
            null,
            element("button", { type: "button", onClick: onClose }, "Đóng"),
            children,
          )
        : null,
  };
});
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
  };
});

import { BundlesPage } from "./BundlesPage";

let host: HTMLDivElement;
let root: Root;

function render() {
  act(() => root.render(createElement(BundlesPage)));
}

function button(label: string) {
  return [...host.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label,
  ) as HTMLButtonElement;
}

function openForm() {
  render();
  act(() => button("Tạo").click());
}

function fillName(value: string) {
  act(() => {
    const input = host.querySelector(
      '[aria-label="Tên cuộc chơi cha"]',
    ) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pick(index: number) {
  act(() =>
    (
      host.querySelectorAll('input[type="checkbox"]')[index] as HTMLInputElement
    ).click(),
  );
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.bundles = [];
  state.pending = false;
  state.creating = false;
  state.games = Array.from({ length: 9 }, (_unused, index) => ({
    id: `g${index + 1}`,
    name: `Game ${index + 1}`,
  }));
  create.mockReset().mockResolvedValue({ id: "bundle_9" });
  navigate.mockReset();
  error.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("BundlesPage", () => {
  it("shows loading, error and empty states", () => {
    state.pending = true;
    render();
    expect(host.textContent).not.toContain("Cuộc chơi cha");
    state.pending = false;
    state.bundles = undefined;
    render();
    expect(host.textContent).toContain("Không tải được cuộc chơi cha");
    state.bundles = [];
    render();
    expect(host.textContent).toContain("Chưa có cuộc chơi cha");
  });

  it("lists the parent games", () => {
    state.bundles = [
      { id: "b1", name: "Tháng 8", createdAt: "2026-08-01", gameCount: 2 },
    ];
    render();
    expect(host.textContent).toContain("Tháng 8");
    expect(host.textContent).toContain("2 cuộc");
  });

  it("needs a name and two games before it can create", async () => {
    openForm();
    expect(button("Tạo cuộc chơi cha").disabled).toBe(true);
    fillName("Tháng 8");
    pick(0);
    expect(button("Tạo cuộc chơi cha").disabled).toBe(true);
    pick(1);
    pick(1);
    pick(1);
    expect(button("Tạo cuộc chơi cha").disabled).toBe(false);
    await act(async () => button("Tạo cuộc chơi cha").click());
    expect(create).toHaveBeenCalledWith({
      name: "Tháng 8",
      gameIds: ["g1", "g2"],
    });
    expect(navigate).toHaveBeenCalledWith({
      to: "/bundles/$bundleId",
      params: { bundleId: "bundle_9" },
    });
  });

  it("caps the picked games and locks the button while creating", () => {
    openForm();
    fillName("A");
    for (let index = 0; index < 9; index += 1) pick(index);
    expect(host.textContent).toContain("đã chọn 8");
    expect(button("Tạo cuộc chơi cha").disabled).toBe(false);
    state.creating = true;
    render();
    expect(button("Tạo cuộc chơi cha").disabled).toBe(true);
  });

  it("shows no games to pick while they are still loading", () => {
    state.games = undefined;
    openForm();
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it("closes the create sheet", () => {
    openForm();
    expect(
      host.querySelector('[aria-label="Tên cuộc chơi cha"]'),
    ).not.toBeNull();
    act(() => button("Đóng").click());
    expect(host.querySelector('[aria-label="Tên cuộc chơi cha"]')).toBeNull();
  });

  it("reports a failed create", async () => {
    create.mockRejectedValue(new Error("boom"));
    openForm();
    fillName("A");
    pick(0);
    pick(2);
    await act(async () => button("Tạo cuộc chơi cha").click());
    expect(error).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
