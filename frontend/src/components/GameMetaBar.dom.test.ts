import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TAGS_PER_GAME } from "../../../shared/schemas";

const { state, mutateAsync, success, error } = vi.hoisted(() => ({
  state: { known: [] as string[], pending: false },
  mutateAsync: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success, error } }));
vi.mock("../adapters/react-query/queries", () => ({
  usePreferences: () => ({ tags: state.known }),
  useUpdateGameMeta: () => ({ mutateAsync, isPending: state.pending }),
}));
vi.mock("./AdaptiveSheet", () => ({
  AdaptiveSheet: (props: { children: ReactNode; onClose: () => void }) =>
    createElement(
      "div",
      null,
      props.children,
      createElement(
        "button",
        { type: "button", onClick: props.onClose },
        "close",
      ),
    ),
}));

import { GameMetaBar } from "./GameMetaBar";

let host: HTMLDivElement;
let root: Root;

function render(location = "", tags: string[] = []) {
  act(() =>
    root.render(createElement(GameMetaBar, { gameId: "g1", location, tags })),
  );
}

function button(label: string) {
  return [...host.querySelectorAll("button")].find(
    (item) =>
      item.textContent?.trim() === label ||
      item.getAttribute("aria-label") === label,
  ) as HTMLButtonElement;
}

function type(placeholder: string, value: string) {
  const field = host.querySelector(
    `input[placeholder='${placeholder}']`,
  ) as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return field;
}

function enter(field: HTMLInputElement, key = "Enter") {
  act(() => {
    field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.known = [];
  state.pending = false;
  mutateAsync.mockReset().mockResolvedValue(undefined);
  success.mockReset();
  error.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("GameMetaBar", () => {
  it("shows a prompt when empty and the place and tags when set", () => {
    render();
    expect(host.textContent).toContain("Thêm tag, địa điểm");
    render("Sân Q7", ["Cầu lông"]);
    expect(host.textContent).toContain("Sân Q7");
    expect(host.textContent).toContain("Cầu lông");
    expect(host.textContent).not.toContain("Thêm tag, địa điểm");
  });

  it("opens, picks a known tag, creates a new one and saves", async () => {
    state.known = ["Cầu lông", "Thứ 7"];
    render("Sân Q7", ["Cầu lông"]);
    act(() => button("Sửa tag và địa điểm").click());
    const options = [...host.querySelectorAll("button[aria-pressed]")];
    expect(options.map((item) => item.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
    ]);
    act(() => (options[1] as HTMLButtonElement).click());
    type("Ví dụ: Sân cầu lông Q7", " Sân Q8 ");
    type("Tạo tag mới", " Giải ");
    act(() => button("Thêm").click());
    const created = type("Tạo tag mới", "");
    expect(created.value).toBe("");
    await act(async () => button("Lưu").click());
    expect(mutateAsync).toHaveBeenCalledWith({
      location: "Sân Q8",
      tags: ["Cầu lông", "Thứ 7", "Giải"],
    });
    expect(success).toHaveBeenCalled();
    expect(host.querySelector("input")).toBeNull();
  });

  it("unticks a tag, ignores blank and other keys, and shows an empty list", () => {
    render("", ["Cầu lông"]);
    act(() => button("Sửa tag và địa điểm").click());
    act(() =>
      (host.querySelector("button[aria-pressed]") as HTMLElement).click(),
    );
    expect(host.querySelector("button[aria-pressed='true']")).toBeNull();
    type("Tạo tag mới", "  ");
    act(() => button("Thêm").click());
    expect(host.querySelector("button[aria-pressed]")).toBeNull();
    enter(type("Tạo tag mới", "x"), "a");
    expect(host.querySelector("button[aria-pressed]")).toBeNull();
  });

  it("shows no tags message when none are known or picked", () => {
    render();
    act(() => button("Sửa tag và địa điểm").click());
    expect(host.textContent).toContain("Chưa có tag nào.");
    enter(type("Tạo tag mới", "Mới"));
    expect(host.querySelector("button[aria-pressed='true']")).not.toBeNull();
  });

  it("stops at the tag limit but still accepts an existing one", () => {
    const tags = Array.from({ length: MAX_TAGS_PER_GAME }, (_, i) => `t${i}`);
    render("", tags);
    act(() => button("Sửa tag và địa điểm").click());
    type("Tạo tag mới", "mới");
    act(() => button("Thêm").click());
    expect(error).toHaveBeenCalled();
    type("Tạo tag mới", "T0");
    act(() => button("Thêm").click());
    expect(host.querySelectorAll("button[aria-pressed='true']")).toHaveLength(
      MAX_TAGS_PER_GAME,
    );
  });

  it("reports a failed save and closes with the close button", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("x"));
    state.pending = true;
    render();
    act(() => button("Sửa tag và địa điểm").click());
    expect(button("Lưu").disabled).toBe(true);
    state.pending = false;
    render();
    await act(async () => button("Lưu").click());
    expect(error).toHaveBeenCalledWith("Lưu thất bại, thử lại sau");
    expect(host.querySelector("input")).not.toBeNull();
    act(() => button("close").click());
    expect(host.querySelector("input")).toBeNull();
  });
});
