import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../components/McpTokenPanel", () => ({
  McpTokenPanel: () => "MCP token panel",
}));
vi.mock("../components/GameSettingsPanel", () => ({
  GameSettingsPanel: () => "Game settings panel",
}));
vi.mock("../components/TagPanel", () => ({
  TagPanel: () => "Tag panel",
}));
vi.mock("../components/ProfileNamePanel", () => ({
  ProfileNamePanel: () => "Profile name panel",
}));

import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("shows account settings and a way back to the home page", () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(createElement(SettingsPage)));
    expect(host.textContent).toContain("Trang chính");
    expect(host.textContent).toContain("Cài đặt");
    expect(host.textContent).toContain("Profile name panel");
    expect(host.textContent).toContain("Tag panel");
    expect(host.textContent).toContain("MCP token panel");
    expect(host.textContent).toContain("Game settings panel");
    const panels = [...host.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(panels.map((panel) => panel.hidden)).toEqual([
      false,
      true,
      true,
      true,
    ]);
    for (const [index, tab] of tabs.entries()) {
      act(() => tab.click());
      expect(panels.map((panel) => panel.hidden)).toEqual(
        panels.map((_panel, panelIndex) => panelIndex !== index),
      );
      expect([...host.querySelectorAll('[role="tabpanel"]')]).toEqual(panels);
      expect(tab.getAttribute("aria-selected")).toBe("true");
    }
    act(() => root.unmount());
    host.remove();
  });
});
