import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Mutation = {
  mutate: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  isSuccess: boolean;
  isPending: boolean;
  data: { name: string; user_code?: string } | undefined;
  error: Error | null;
};

const { lookup, approve, deny, session, ssoLoginUrl } = vi.hoisted(() => {
  const blank = () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isSuccess: false,
    isPending: false,
    data: undefined,
    error: null,
  });
  return {
    lookup: blank() as Mutation,
    approve: blank() as Mutation,
    deny: blank() as Mutation,
    session: {
      user: { id: "u1", name: "Huy" } as { id: string; name: string } | null,
      isPending: false,
    },
    ssoLoginUrl: vi.fn(),
  };
});

vi.mock("../adapters/react-query/queries", () => ({
  useLookupDeviceLogin: () => lookup,
  useApproveDeviceLogin: () => approve,
  useDenyDeviceLogin: () => deny,
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

function button(label: string) {
  return [...host.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(label),
  ) as HTMLButtonElement;
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

function showConfirmStep() {
  lookup.isSuccess = true;
  lookup.data = { name: "May ban", user_code: "ABCD-2345" };
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  for (const mutation of [lookup, approve, deny]) {
    Object.assign(mutation, {
      isSuccess: false,
      isPending: false,
      data: undefined,
      error: null,
    });
    mutation.mutate.mockReset();
    mutation.reset.mockReset();
  }
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

  it("asks a signed-out user to sign in and returns to the plain page", () => {
    session.user = null;
    const fakeWindow = Object.create(window) as Window;
    Object.defineProperty(fakeWindow, "location", {
      value: { href: "", search: "?user_code=ABCD-2345" },
      configurable: true,
    });
    vi.stubGlobal("window", fakeWindow);
    render();
    act(() => button("Tiếp tục với Google").click());
    expect(ssoLoginUrl).toHaveBeenCalledWith("/login/device");
    expect(fakeWindow.location.href).toBe("https://sso.example/login");
  });

  it("step 1: formats the typed code and looks it up", () => {
    render();
    expect(host.textContent).toContain("Huy");
    expect(button("Tiếp tục").disabled).toBe(true);
    expect(host.textContent).toContain("Nhập đủ 8 ký tự");
    type(codeInput(), "abcd2345zz");
    expect(codeInput().value).toBe("ABCD2345");
    expect(host.textContent).toContain("ABCD-2345");
    type(codeInput(), "ab");
    expect(codeInput().value).toBe("AB");
    type(codeInput(), "abcd-2345");
    expect(codeInput().value).toBe("ABCD2345");
    expect(button("Tiếp tục").disabled).toBe(false);
    expect(host.textContent).not.toContain("Nhập đủ 8 ký tự");
    submit();
    expect(lookup.mutate).toHaveBeenCalledWith("ABCD2345");
  });

  it("never fills the code from the link", () => {
    window.history.replaceState(null, "", "/login/device?user_code=WXYZ-9876");
    render();
    expect(codeInput().value).toBe("");
  });

  it("step 1: shows a message for known and unknown errors", () => {
    lookup.error = new Error("not_found");
    render();
    expect(host.textContent).toContain("hết hạn");
    lookup.error = new Error("code_already_used");
    render();
    expect(host.textContent).toContain("đã bị từ chối");
    lookup.error = new Error("boom");
    render();
    expect(host.textContent).toContain("Không duyệt được");
    lookup.error = null;
    lookup.isPending = true;
    render();
    expect(button("Tiếp tục").getAttribute("aria-busy")).toBe("true");
  });

  it("step 2: shows the device and the code and lets the user allow", () => {
    showConfirmStep();
    render();
    expect(host.textContent).toContain('"May ban"');
    expect(host.textContent).toContain("ABCD-2345");
    expect(host.textContent).toContain("đang hiện trên terminal");
    act(() => button("Cho phép").click());
    expect(approve.mutate).toHaveBeenCalledWith("ABCD-2345");
    expect(deny.mutate).not.toHaveBeenCalled();
  });

  it("step 2: lets the user deny", () => {
    showConfirmStep();
    render();
    act(() => button("Từ chối").click());
    expect(deny.mutate).toHaveBeenCalledWith("ABCD-2345");
    expect(approve.mutate).not.toHaveBeenCalled();
  });

  it("step 2: disables the other choice while one is running", () => {
    showConfirmStep();
    approve.isPending = true;
    render();
    expect(button("Từ chối").disabled).toBe(true);
    approve.isPending = false;
    deny.isPending = true;
    render();
    expect(button("Cho phép").disabled).toBe(true);
  });

  it("step 2: shows an error from allow or deny", () => {
    showConfirmStep();
    approve.error = new Error("too_many_mcp_tokens");
    render();
    expect(host.textContent).toContain("Đã đủ số token");
    approve.error = null;
    deny.error = new Error("boom");
    render();
    expect(host.textContent).toContain("Không duyệt được");
  });

  it("step 2: goes back to typing another code", () => {
    showConfirmStep();
    render();
    act(() => button("Nhập mã khác").click());
    expect(lookup.reset).toHaveBeenCalled();
    expect(approve.reset).toHaveBeenCalled();
    expect(deny.reset).toHaveBeenCalled();
  });

  it("confirms with the device name once approved", () => {
    showConfirmStep();
    approve.isSuccess = true;
    approve.data = { name: "May ban" };
    render();
    expect(host.textContent).toContain('Đã cho phép "May ban"');
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector('a[href="/"]')).not.toBeNull();
  });

  it("says so once the request is denied", () => {
    showConfirmStep();
    deny.isSuccess = true;
    deny.data = { name: "May ban" };
    render();
    expect(host.textContent).toContain('Đã từ chối "May ban"');
    expect(host.querySelector('a[href="/"]')).not.toBeNull();
  });
});
