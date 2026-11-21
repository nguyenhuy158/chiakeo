import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mutation, session, ssoLoginUrl } = vi.hoisted(() => ({
  mutation: {
    mutate: vi.fn(),
    isSuccess: false,
    isPending: false,
    data: undefined as { name: string } | undefined,
    error: null as Error | null,
  },
  session: {
    user: { id: "u1", name: "Huy" } as { id: string; name: string } | null,
    isPending: false,
  },
  ssoLoginUrl: vi.fn(),
}));

vi.mock("../adapters/react-query/queries", () => ({
  useApproveDeviceLogin: () => mutation,
}));
vi.mock("../adapters/react-query/session-query", () => ({
  useAppSession: () => session,
}));
vi.mock("../adapters/browser/sso", () => ({ ssoLoginUrl }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) =>
    createElement("a", { href: to }, children),
}));
vi.mock("../components/theme", () => ({ ThemeToggle: () => "theme toggle" }));
vi.mock("../components/brand", () => ({ BrandMark: () => "brand mark" }));
vi.mock("../components/ui", () => ({ LoadingState: () => "loading session" }));

import { DeviceLoginPage } from "./DeviceLoginPage";

let host: HTMLDivElement;
let root: Root;

function render() {
  act(() => root.render(createElement(DeviceLoginPage)));
}

function codeInput() {
  return host.querySelector("input") as HTMLInputElement;
}

function submitButton() {
  return host.querySelector('button[type="submit"]') as HTMLButtonElement;
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
  Object.assign(session, { user: { id: "u1", name: "Huy" }, isPending: false });
  ssoLoginUrl.mockReset().mockReturnValue("https://sso.example/login");
  window.history.replaceState(null, "", "/login/device");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("DeviceLoginPage", () => {
  it("waits for the session", () => {
    session.isPending = true;
    render();
    expect(host.textContent).toContain("loading session");
  });

  it("asks a signed-out user to sign in and comes back to this page", () => {
    session.user = null;
    const fakeWindow = Object.create(window) as Window;
    Object.defineProperty(fakeWindow, "location", {
      value: { href: "", search: "?user_code=ABCD-2345" },
      configurable: true,
    });
    vi.stubGlobal("window", fakeWindow);
    render();
    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toContain("Tiếp tục với Google");
    act(() => button.click());
    expect(ssoLoginUrl).toHaveBeenCalledWith(
      "/login/device?user_code=ABCD-2345",
    );
    expect(fakeWindow.location.href).toBe("https://sso.example/login");
  });

  it("shows who is signed in and formats the code as the user types", () => {
    render();
    expect(host.textContent).toContain("Huy");
    expect(submitButton().disabled).toBe(true);
    expect(host.textContent).toContain("Nhập đủ 8 ký tự");
    type(codeInput(), "abcd2345zz");
    expect(codeInput().value).toBe("ABCD-2345");
    type(codeInput(), "ab");
    expect(codeInput().value).toBe("AB");
    type(codeInput(), "abcd-2345");
    expect(submitButton().disabled).toBe(false);
    expect(host.textContent).not.toContain("Nhập đủ 8 ký tự");
    submit();
    expect(mutation.mutate).toHaveBeenCalledWith("ABCD-2345");
  });

  it("fills the code from the link", () => {
    window.history.replaceState(null, "", "/login/device?user_code=wxyz9876");
    render();
    expect(codeInput().value).toBe("WXYZ-9876");
    expect(submitButton().disabled).toBe(false);
  });

  it("starts empty when the link has no code", () => {
    render();
    expect(codeInput().value).toBe("");
  });

  it("shows a message for known and unknown errors and a pending state", () => {
    mutation.error = new Error("not_found");
    render();
    expect(host.textContent).toContain("hết hạn");
    mutation.error = new Error("code_already_used");
    render();
    expect(host.textContent).toContain("đã được dùng");
    mutation.error = new Error("boom");
    render();
    expect(host.textContent).toContain("Không duyệt được");
    mutation.error = null;
    mutation.isPending = true;
    render();
    expect(submitButton().getAttribute("aria-busy")).toBe("true");
  });

  it("confirms with the device name once approved", () => {
    mutation.isSuccess = true;
    mutation.data = { name: "May ban" };
    render();
    expect(host.textContent).toContain("Đã cho phép");
    expect(host.textContent).toContain("May ban");
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector('a[href="/"]')).not.toBeNull();
  });
});
