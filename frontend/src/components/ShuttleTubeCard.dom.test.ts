import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiShuttleEntry,
  ApiShuttleTube,
} from "../../../shared/api-types";

const { state, create, remove, confirm, error } = vi.hoisted(() => ({
  state: { creating: false, deleting: false },
  create: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../adapters/react-query/shuttles-query", () => ({
  useCreateShuttleEntry: () => ({
    mutateAsync: create,
    isPending: state.creating,
  }),
  useDeleteShuttleEntry: () => ({
    mutateAsync: remove,
    isPending: state.deleting,
  }),
}));
vi.mock("./ConfirmDialog", () => ({ useConfirm: () => confirm }));
vi.mock("sonner", () => ({ toast: { error } }));

import { ShuttleTubeCard } from "./ShuttleTubeCard";

let host: HTMLDivElement;
let root: Root;
const onEdit = vi.fn();
const onDelete = vi.fn();

function entry(
  id: string,
  kind: ApiShuttleEntry["kind"],
  delta: number,
  expenseId: string | null = null,
): ApiShuttleEntry {
  return {
    id,
    kind,
    delta,
    stockAfter: 8,
    note: id === "add" ? "Mua mới" : "",
    expenseId,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function tube(overrides: Partial<ApiShuttleTube> = {}): ApiShuttleTube {
  return {
    id: "tube-1",
    name: "Ống A",
    tubePrice: 360_000,
    shuttlePrice: 30_000,
    initialQuantity: 12,
    stock: 8,
    createdAt: "2026-01-01T00:00:00Z",
    entries: [],
    ...overrides,
  };
}

function render(value: ApiShuttleTube = tube()) {
  act(() =>
    root.render(
      createElement(ShuttleTubeCard, { tube: value, onEdit, onDelete }),
    ),
  );
}

function button(label: string) {
  return [...host.querySelectorAll("button")].find(
    (item) =>
      item.textContent?.trim() === label ||
      item.getAttribute("aria-label") === label,
  ) as HTMLButtonElement | undefined;
}

function fill(label: string, value: string) {
  act(() => {
    const input = host.querySelector(
      `[aria-label="${label}"]`,
    ) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () =>
    host
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.creating = false;
  state.deleting = false;
  create.mockReset().mockResolvedValue(undefined);
  remove.mockReset().mockResolvedValue(undefined);
  confirm.mockReset().mockResolvedValue(true);
  error.mockReset();
  onEdit.mockReset();
  onDelete.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ShuttleTubeCard", () => {
  it("shows the name, prices and remaining shuttles and raises edit and delete", () => {
    render();
    expect(host.textContent).toContain("Ống A");
    expect(host.textContent).toMatch(/360\.000/);
    expect(host.textContent).toMatch(/30\.000/);
    expect(host.querySelector("[aria-live]")?.textContent).toBe("8");
    act(() => button("Sửa Ống A")?.click());
    act(() => button("Xóa Ống A")?.click());
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("adds and uses stock for this tube with a trimmed note", async () => {
    render(tube({ stock: 3 }));
    expect(button("Dùng 4 trái từ Ống A")?.disabled).toBe(true);
    fill("Ghi chú cho Ống A", "  Mua mới  ");
    await act(async () => button("Thêm 6 trái vào Ống A")?.click());
    expect(create).toHaveBeenCalledWith({
      tubeId: "tube-1",
      input: { kind: "add", quantity: 6, note: "Mua mới" },
    });
    expect(
      (
        host.querySelector(
          '[aria-label="Ghi chú cho Ống A"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("");
    await act(async () => button("Dùng 2 trái từ Ống A")?.click());
    expect(create).toHaveBeenCalledWith({
      tubeId: "tube-1",
      input: { kind: "use", quantity: 2, note: "" },
    });
    state.creating = true;
    render(tube({ stock: 3 }));
    expect(button("Thêm 1 trái vào Ống A")?.disabled).toBe(true);
    expect(button("Dùng 1 trái từ Ống A")?.disabled).toBe(true);
  });

  it("validates and records an exact count", async () => {
    render();
    expect(button("Chốt lại")?.disabled).toBe(true);
    fill("Chốt lại số cầu của Ống A", "9999999");
    await submit();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Nhập số cầu từ 0"),
    );
    expect(create).not.toHaveBeenCalled();
    fill("Chốt lại số cầu của Ống A", "12abc");
    expect(
      (
        host.querySelector(
          '[aria-label="Chốt lại số cầu của Ống A"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("12");
    await submit();
    expect(create).toHaveBeenCalledWith({
      tubeId: "tube-1",
      input: { kind: "set", quantity: 12, note: "" },
    });
    expect(
      (
        host.querySelector(
          '[aria-label="Chốt lại số cầu của Ống A"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("");
  });

  it("maps known and unknown write failures", async () => {
    render(tube({ stock: 2 }));
    create.mockRejectedValueOnce(new Error("shuttle_stock_negative"));
    await act(async () => button("Dùng 1 trái từ Ống A")?.click());
    expect(error).toHaveBeenCalledWith(
      "Trong kho không còn đủ cầu cho thao tác này.",
    );
    create.mockRejectedValueOnce("offline");
    await act(async () => button("Thêm 1 trái vào Ống A")?.click());
    expect(error).toHaveBeenCalledWith("Không ghi được, thử lại sau.");
  });

  it("keeps the history hidden until opened and confirms deletion", async () => {
    render(
      tube({
        entries: [
          entry("add", "add", 6),
          entry("use", "use", -2),
          entry("set", "set", 0),
          entry("linked", "use", -1, "expense-1"),
        ],
      }),
    );
    expect(host.textContent).not.toContain("Mua mới");
    act(() => button("Lịch sử (4)")?.click());
    expect(host.textContent).toContain("Thêm cầu");
    expect(host.textContent).toContain("Dùng cầu");
    expect(host.textContent).toContain("Chốt lại số cầu");
    expect(host.textContent).toContain("Mua mới");
    expect(host.textContent).toContain("Khoản chi");

    const deleteButtons = [
      ...host.querySelectorAll('button[aria-label="Xóa lần ghi này"]'),
    ] as HTMLButtonElement[];
    expect(deleteButtons).toHaveLength(3);
    confirm.mockResolvedValueOnce(false);
    await act(async () => deleteButtons[0].click());
    expect(remove).not.toHaveBeenCalled();
    await act(async () => deleteButtons[0].click());
    expect(remove).toHaveBeenCalledWith("add");
    remove.mockRejectedValueOnce(new Error("shuttle_stock_negative"));
    await act(async () => deleteButtons[1].click());
    expect(error).toHaveBeenCalledWith(
      "Trong kho không còn đủ cầu cho thao tác này.",
    );
    state.deleting = true;
    render(tube({ entries: [entry("add", "add", 6)] }));
    expect(button("Xóa lần ghi này")?.disabled).toBe(true);
    act(() => button("Lịch sử (1)")?.click());
    expect(host.textContent).not.toContain("Mua mới");
  });
});
