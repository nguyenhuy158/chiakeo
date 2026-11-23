import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { archive, state } = vi.hoisted(() => ({
  archive: vi.fn(),
  state: {
    failedToLoad: false,
    loading: false,
    active: undefined as
      | Array<{ id: string; name: string; isOwner: boolean }>
      | undefined,
    closed: undefined as
      | Array<{ id: string; name: string; isOwner: boolean }>
      | undefined,
  },
}));

vi.mock("../adapters/react-query/queries", () => ({
  useGames: () => ({
    data: state.active,
    isPending: state.loading,
  }),
  useClosedGames: () => ({
    data: state.closed,
    isError: state.failedToLoad,
  }),
  useArchiveGame: () => ({ mutateAsync: archive }),
}));

import { BulkArchiveGames } from "./BulkArchiveGames";

let root: Root;
let host: HTMLDivElement;

function button(text: string) {
  return [...document.querySelectorAll("button")].find(
    (node) => node.textContent === text,
  ) as HTMLButtonElement;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  archive.mockReset().mockResolvedValue(undefined);
  state.failedToLoad = false;
  state.loading = false;
  state.active = [
    { id: "active", name: "Đang chơi", isOwner: true },
    { id: "shared", name: "Được chia sẻ", isOwner: false },
  ];
  state.closed = [{ id: "closed", name: "Đã đóng", isOwner: true }];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(BulkArchiveGames)));
  act(() => button("Lưu trữ nhiều cuộc").click());
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("requires confirmation, archives only owned games and retries only failures", async () => {
  expect(document.body.textContent).not.toContain("Được chia sẻ");
  expect(button("Tiếp tục (0)").disabled).toBe(true);
  act(() =>
    (
      document.querySelector('input[type="checkbox"]') as HTMLInputElement
    ).click(),
  );
  act(() => button("Tiếp tục (2)").click());
  expect(archive).not.toHaveBeenCalled();
  act(() => button("Quay lại").click());
  expect(archive).not.toHaveBeenCalled();
  act(() => button("Tiếp tục (2)").click());
  archive.mockRejectedValueOnce(new Error("temporary failure"));
  await act(async () => button("Xác nhận lưu trữ").click());
  expect(archive.mock.calls).toEqual([["active"], ["closed"]]);
  expect(document.body.textContent).toContain("Đã lưu trữ 1/2 cuộc.");
  expect(button("Tiếp tục (1)").disabled).toBe(false);
  act(() => button("Tiếp tục (1)").click());
  await act(async () => button("Xác nhận lưu trữ").click());
  expect(archive.mock.calls).toEqual([["active"], ["closed"], ["active"]]);
  expect(document.body.textContent).toContain("Đã lưu trữ 1/1 cuộc.");
});

it("does not offer selection when either list failed to load", () => {
  state.failedToLoad = true;
  act(() => root.render(createElement(BulkArchiveGames)));
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Không tải đủ",
  );
  expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  expect(archive).not.toHaveBeenCalled();
});

it("handles loading and empty lists, individual selection and clearing selection", () => {
  state.loading = true;
  state.active = undefined;
  state.closed = undefined;
  act(() => root.render(createElement(BulkArchiveGames)));
  expect(document.body.textContent).toContain("Đang tải cuộc chơi");
  state.loading = false;
  act(() => root.render(createElement(BulkArchiveGames)));
  expect(document.body.textContent).toContain("Không có cuộc nào");
  state.active = [
    { id: "one", name: "Một", isOwner: true },
    { id: "two", name: "Hai", isOwner: true },
  ];
  state.closed = [{ id: "one", name: "Một", isOwner: true }];
  act(() => root.render(createElement(BulkArchiveGames)));
  const inputs = [
    ...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ];
  expect(inputs).toHaveLength(3);
  act(() => inputs[1].click());
  act(() => inputs[2].click());
  act(() => inputs[1].click());
  expect(button("Tiếp tục (1)").disabled).toBe(false);
  act(() => inputs[0].click());
  act(() => inputs[0].click());
  expect(button("Tiếp tục (0)").disabled).toBe(true);
  act(() => button("Đóng").click());
  act(() => button("Lưu trữ nhiều cuộc").click());
  expect(button("Tiếp tục (0)").disabled).toBe(true);
});

it("blocks repeat submits and dismissal while a request is pending", async () => {
  let finish!: () => void;
  archive.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  act(() =>
    document
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]
      .click(),
  );
  act(() => button("Tiếp tục (1)").click());
  await act(async () => button("Xác nhận lưu trữ").click());
  expect(button("Xác nhận lưu trữ").disabled).toBe(true);
  act(() => {
    button("Xác nhận lưu trữ").click();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(archive).toHaveBeenCalledOnce();
  expect(document.body.textContent).toContain("Lưu trữ 1 cuộc đã chọn?");
  await act(async () => finish());
  expect(document.body.textContent).toContain("Đã lưu trữ 1/1 cuộc.");
});
