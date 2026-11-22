import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_USER_TAGS } from "../../../shared/schemas";

const { state, mutate } = vi.hoisted(() => ({
  state: { tags: [] as string[] },
  mutate: vi.fn(),
}));

vi.mock("../adapters/react-query/queries", () => ({
  usePreferences: () => ({ tags: state.tags }),
  useUpdatePreferences: () => ({ mutate }),
}));

import { TagPanel } from "./TagPanel";

let host: HTMLDivElement;
let root: Root;

function render(tags: string[]) {
  state.tags = tags;
  act(() => root.render(createElement(TagPanel)));
}

function input() {
  return host.querySelector("input") as HTMLInputElement;
}

function type(value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function button(label: string) {
  return [...host.querySelectorAll("button")].find(
    (item) =>
      item.textContent?.trim() === label ||
      item.getAttribute("aria-label") === label,
  ) as HTMLButtonElement;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mutate.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("TagPanel", () => {
  it("shows an empty state and ignores a blank name", () => {
    render([]);
    expect(host.textContent).toContain("Chưa có tag nào.");
    type("   ");
    act(() => button("Thêm").click());
    expect(mutate).not.toHaveBeenCalled();
  });

  it("adds a tag with the button or Enter, without duplicates", () => {
    render(["Cầu lông"]);
    type(" Thứ 7 ");
    act(() => button("Thêm").click());
    expect(mutate).toHaveBeenLastCalledWith({ tags: ["Cầu lông", "Thứ 7"] });
    expect(input().value).toBe("");
    type("cầu lông");
    act(() => {
      input().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(mutate).toHaveBeenLastCalledWith({ tags: ["Cầu lông"] });
    type("x");
    act(() => {
      input().dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", bubbles: true }),
      );
    });
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it("removes a tag", () => {
    render(["Cầu lông", "Thứ 7"]);
    act(() => button("Xóa tag Cầu lông").click());
    expect(mutate).toHaveBeenCalledWith({ tags: ["Thứ 7"] });
  });

  it("stops adding at the limit", () => {
    render(Array.from({ length: MAX_USER_TAGS }, (_, index) => `t${index}`));
    expect(button("Thêm").disabled).toBe(true);
    type("mới");
    act(() => {
      input().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(mutate).not.toHaveBeenCalled();
  });
});
