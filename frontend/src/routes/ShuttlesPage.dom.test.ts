import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiShuttleTube } from "../../../shared/api-types";

const { state, createTube, updateTube, deleteTube, confirm, error } =
  vi.hoisted(() => ({
    state: {
      tubes: undefined as unknown[] | undefined,
      loading: false,
      queryError: false,
      saving: false,
    },
    createTube: vi.fn(),
    updateTube: vi.fn(),
    deleteTube: vi.fn(),
    confirm: vi.fn(),
    error: vi.fn(),
  }));

vi.mock("../adapters/react-query/shuttles-query", () => ({
  useShuttleTubes: () => ({
    data: state.tubes === undefined ? undefined : { tubes: state.tubes },
    isPending: state.loading,
    isError: state.queryError,
  }),
  useCreateShuttleTube: () => ({
    mutateAsync: createTube,
    isPending: state.saving,
  }),
  useUpdateShuttleTube: () => ({
    mutateAsync: updateTube,
    isPending: false,
  }),
  useDeleteShuttleTube: () => ({ mutateAsync: deleteTube }),
  useCreateShuttleEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteShuttleEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../components/ConfirmDialog", () => ({ useConfirm: () => confirm }));
vi.mock("sonner", () => ({ toast: { error } }));
vi.mock("@tanstack/react-router", async () => {
  const { createElement: element } = await import("react");
  return {
    Link: ({ children }: { children: ReactNode }) =>
      element("a", null, children),
  };
});

import { ShuttlesPage } from "./ShuttlesPage";

let host: HTMLDivElement;
let root: Root;

function tube(id: string, name: string, stock: number): ApiShuttleTube {
  return {
    id,
    name,
    tubePrice: 360_000,
    shuttlePrice: 30_000,
    initialQuantity: 12,
    stock,
    createdAt: "2026-01-01T00:00:00Z",
    entries: [],
  };
}

function render() {
  act(() => root.render(createElement(ShuttlesPage)));
}

function button(label: string) {
  return [...document.querySelectorAll("button")].find(
    (item) =>
      item.textContent?.trim() === label ||
      item.getAttribute("aria-label") === label,
  ) as HTMLButtonElement | undefined;
}

function fillName(value: string) {
  act(() => {
    const input = document.querySelector(
      '[role="dialog"] form input',
    ) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitForm() {
  await act(async () =>
    document
      .querySelector('[role="dialog"] form')
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.tubes = undefined;
  state.loading = false;
  state.queryError = false;
  state.saving = false;
  createTube.mockReset().mockResolvedValue(undefined);
  updateTube.mockReset().mockResolvedValue(undefined);
  deleteTube.mockReset().mockResolvedValue(undefined);
  confirm.mockReset().mockResolvedValue(true);
  error.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ShuttlesPage", () => {
  it("shows error, loading and empty states", () => {
    state.queryError = true;
    render();
    expect(host.textContent).toContain("Không tải được kho cầu");
    state.queryError = false;
    state.loading = true;
    render();
    expect(host.textContent).toContain("Đang đếm cầu");
    state.loading = false;
    state.tubes = [];
    render();
    expect(host.textContent).toContain("Chưa có ống cầu nào");
  });

  it("lists every tube with its remaining shuttles", () => {
    state.tubes = [tube("a", "Ống A", 8), tube("b", "Ống B", 12)];
    render();
    expect(host.textContent).toContain("Ống A");
    expect(host.textContent).toContain("Ống B");
    expect(host.querySelectorAll("[aria-live]")).toHaveLength(2);
  });

  it("creates a tube from the sheet and closes it", async () => {
    state.tubes = [];
    render();
    act(() => button("Thêm ống")?.click());
    expect(document.body.textContent).toContain("Thêm ống cầu");
    fillName("Ống mới");
    await submitForm();
    expect(createTube).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ống mới", initialQuantity: 12 }),
    );
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).toBeNull(),
    );
  });

  it("keeps the sheet open and reports a failed save", async () => {
    state.tubes = [];
    render();
    act(() => button("Thêm ống")?.click());
    fillName("Ống mới");
    createTube.mockRejectedValueOnce(new Error("boom"));
    await submitForm();
    expect(error).toHaveBeenCalledWith("Không ghi được, thử lại sau.");
    expect(document.querySelector('[role="dialog"] form')).not.toBeNull();
  });

  it("edits an existing tube", async () => {
    state.tubes = [tube("a", "Ống A", 8)];
    render();
    act(() => button("Sửa Ống A")?.click());
    expect(document.body.textContent).toContain("Sửa ống cầu");
    await submitForm();
    expect(updateTube).toHaveBeenCalledWith({
      tubeId: "a",
      input: expect.objectContaining({ name: "Ống A", shuttlePrice: 30_000 }),
    });
    expect(createTube).not.toHaveBeenCalled();
  });

  it("closes the sheet without saving", () => {
    state.tubes = [];
    render();
    act(() => button("Thêm ống")?.click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(createTube).not.toHaveBeenCalled();
  });

  it("confirms before deleting a tube and reports failures", async () => {
    state.tubes = [tube("a", "Ống A", 8)];
    render();
    confirm.mockResolvedValueOnce(false);
    await act(async () => button("Xóa Ống A")?.click());
    expect(deleteTube).not.toHaveBeenCalled();
    await act(async () => button("Xóa Ống A")?.click());
    expect(confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Xóa Ống A?", destructive: true }),
    );
    expect(deleteTube).toHaveBeenCalledWith("a");
    deleteTube.mockRejectedValueOnce(new Error("boom"));
    await act(async () => button("Xóa Ống A")?.click());
    expect(error).toHaveBeenCalledWith("Không ghi được, thử lại sau.");
  });
});
