import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { preferences, mutate, mutateShare } = vi.hoisted(() => ({
  preferences: {
    summaryShowQr: true,
    summaryShowAvatar: true,
    roundDownRefunds: false,
    hideSettledGames: false,
  },
  mutate: vi.fn(),
  mutateShare: vi.fn(),
}));

vi.mock("../adapters/react-query/queries", () => ({
  usePreferences: () => preferences,
  useUpdatePreferences: () => ({ mutate }),
  useUpdateShareShow: () => ({ mutate: mutateShare }),
}));

import { GameSettingsPanel } from "./GameSettingsPanel";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mutate.mockReset();
  mutateShare.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(GameSettingsPanel)));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function toggle(label: string) {
  return [...host.querySelectorAll<HTMLButtonElement>("[role='switch']")].find(
    (item) => item.textContent?.includes(label),
  ) as HTMLButtonElement;
}

describe("GameSettingsPanel", () => {
  it("shows the saved values and saves each toggle", () => {
    expect(toggle("Không hoàn tiền lẻ").getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(toggle("Hiện QR").getAttribute("aria-checked")).toBe("true");
    act(() => toggle("Không hoàn tiền lẻ").click());
    expect(mutate).toHaveBeenCalledWith({ roundDownRefunds: true });
    act(() => toggle("Ẩn cuộc chơi đã thu tiền xong").click());
    expect(mutate).toHaveBeenCalledWith({ hideSettledGames: true });
    act(() => toggle("Hiện QR").click());
    expect(mutate).toHaveBeenCalledWith({ summaryShowQr: false });
    act(() => toggle("Hiện avatar").click());
    expect(mutate).toHaveBeenCalledWith({ summaryShowAvatar: false });
    expect(host.textContent).not.toContain("Link chia sẻ hiện thêm");
  });

  it("saves the share options of one game", () => {
    act(() =>
      root.render(
        createElement(GameSettingsPanel, {
          game: { id: "g1", shareShow: ["matrix"] },
        }),
      ),
    );
    expect(toggle("Bảng chia").getAttribute("aria-checked")).toBe("true");
    expect(toggle("Ảnh").getAttribute("aria-checked")).toBe("false");
    act(() => toggle("Ảnh").click());
    expect(mutateShare).toHaveBeenCalledWith(["matrix", "photos"]);
    act(() => toggle("Bảng chia").click());
    expect(mutateShare).toHaveBeenCalledWith([]);
    act(() => toggle("Các khoản chi").click());
    expect(mutateShare).toHaveBeenCalledWith(["matrix", "expenses"]);
  });
});
