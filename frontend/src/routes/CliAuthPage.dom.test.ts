import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mutation } = vi.hoisted(() => ({
  mutation: {
    mutate: vi.fn(),
    isSuccess: false,
    isPending: false,
    data: undefined as { name: string } | undefined,
    error: null as Error | null,
  },
}));

vi.mock("../adapters/react-query/queries", () => ({
  useApproveCliAuth: () => mutation,
}));

import { CliAuthPage } from "./CliAuthPage";

let host: HTMLDivElement;
let root: Root;

function render() {
  act(() => root.render(createElement(CliAuthPage)));
}

function codeInput() {
  return host.querySelector("input") as HTMLInputElement;
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submit() {
  act(() => {
    host
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(mutation, {
    isSuccess: false,
    isPending: false,
    data: undefined,
    error: null,
  });
  mutation.mutate.mockReset();
  window.history.replaceState(null, "", "/cli-auth");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("CliAuthPage", () => {
  it("keeps the button off until a code is typed, then sends it", () => {
    render();
    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    type(codeInput(), "abcd-2345");
    expect(button.disabled).toBe(false);
    submit();
    expect(mutation.mutate).toHaveBeenCalledWith("abcd-2345");
  });

  it("fills the code from the link", () => {
    window.history.replaceState(null, "", "/cli-auth?code=WXYZ-9876");
    render();
    expect(codeInput().value).toBe("WXYZ-9876");
  });

  it("shows a message for known and unknown errors and a pending label", () => {
    mutation.error = new Error("not_found");
    render();
    expect(host.textContent).toContain("hết hạn");
    mutation.error = new Error("code_already_used");
    render();
    expect(host.textContent).toContain("đã được dùng");
    mutation.error = new Error("boom");
    render();
    expect(host.textContent).toContain("Không duyệt được");
    mutation.isPending = true;
    render();
    expect(host.textContent).toContain("Đang duyệt");
  });

  it("confirms with the device name once approved", () => {
    mutation.isSuccess = true;
    mutation.data = { name: "May ban" };
    render();
    expect(host.textContent).toContain("Đã cho phép");
    expect(host.textContent).toContain("May ban");
    expect(host.querySelector("form")).toBeNull();
  });
});
