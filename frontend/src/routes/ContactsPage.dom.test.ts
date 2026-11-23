import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../components/ContactBookCard", () => ({
  ContactBookCard: ({ alwaysOpen }: { alwaysOpen?: boolean }) =>
    alwaysOpen ? "Contact book open" : "Contact book closed",
}));

import { ContactsPage } from "./ContactsPage";

describe("ContactsPage", () => {
  it("shows the open contact book and a way back to the home page", () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(createElement(ContactsPage)));
    expect(host.textContent).toContain("Trang chính");
    expect(host.textContent).toContain("Danh bạ");
    expect(host.textContent).toContain("Contact book open");
    act(() => root.unmount());
    host.remove();
  });
});
