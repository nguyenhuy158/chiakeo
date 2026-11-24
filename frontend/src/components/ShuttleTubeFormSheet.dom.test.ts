import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiShuttleTube } from "../../../shared/api-types";
import { ShuttleTubeFormSheet } from "./ShuttleTubeFormSheet";

let host: HTMLDivElement;
let root: Root;
const onSubmit = vi.fn();
const onClose = vi.fn();

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

function render(value: ApiShuttleTube | null, open = true, pending = false) {
  act(() =>
    root.render(
      createElement(ShuttleTubeFormSheet, {
        open,
        tube: value,
        pending,
        onClose,
        onSubmit,
      }),
    ),
  );
}

function field(label: string) {
  const labelElement = [...document.querySelectorAll("label")].find((item) =>
    item.textContent?.startsWith(label),
  ) as HTMLLabelElement;
  return document.getElementById(labelElement.htmlFor) as HTMLInputElement;
}

function fill(label: string, value: string) {
  act(() => {
    const input = field(label);
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
    document
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  onSubmit.mockReset().mockResolvedValue(undefined);
  onClose.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ShuttleTubeFormSheet", () => {
  it("renders nothing while closed", () => {
    render(null, false);
    expect(document.querySelector("form")).toBeNull();
  });

  it("creates a tube with 12 shuttles and a per shuttle price derived from the tube price", async () => {
    render(null);
    expect(field("Số trái trong ống").value).toBe("12");
    fill("Tên ống", "  Ống mới ");
    fill("Giá cả ống", "360000");
    expect(field("Giá mỗi trái").value).toBe("30000");
    await submit();
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Ống mới",
      tubePrice: 360_000,
      shuttlePrice: 30_000,
      initialQuantity: 12,
    });
  });

  it("recomputes the shuttle price when the quantity changes until it is edited by hand", async () => {
    render(null);
    fill("Giá cả ống", "240000");
    fill("Số trái trong ống", "10x");
    expect(field("Số trái trong ống").value).toBe("10");
    expect(field("Giá mỗi trái").value).toBe("24000");
    fill("Giá mỗi trái", "25000");
    fill("Giá cả ống", "300000");
    expect(field("Giá mỗi trái").value).toBe("25000");
    fill("Tên ống", "B");
    await submit();
    expect(onSubmit).toHaveBeenCalledWith({
      name: "B",
      tubePrice: 300_000,
      shuttlePrice: 25_000,
      initialQuantity: 10,
    });
  });

  it("clears the derived price when it would be zero", () => {
    render(null);
    fill("Giá cả ống", "360000");
    fill("Giá cả ống", "");
    expect(field("Giá mỗi trái").value).toBe("");
  });

  it("blocks an empty name and an invalid quantity", async () => {
    render(null);
    fill("Số trái trong ống", "0");
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Nhập tên ống cầu");
    expect(document.body.textContent).toContain("Nhập số trái từ 1 đến");
    fill("Số trái trong ống", "99999");
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    fill("Số trái trong ống", "");
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("edits an existing tube and keeps a hand set shuttle price", async () => {
    render(tube({ shuttlePrice: 28_000 }));
    expect(field("Tên ống").value).toBe("Ống A");
    expect(field("Giá cả ống").value).toBe("360000");
    expect(field("Giá mỗi trái").value).toBe("28000");
    expect(document.body.textContent).toContain("không đổi số cầu còn lại");
    fill("Giá cả ống", "400000");
    expect(field("Giá mỗi trái").value).toBe("28000");
    await submit();
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Ống A",
      tubePrice: 400_000,
      shuttlePrice: 28_000,
      initialQuantity: 12,
    });
  });

  it("follows the tube price when the stored shuttle price was derived and shows free tubes empty", () => {
    render(tube());
    fill("Giá cả ống", "240000");
    expect(field("Giá mỗi trái").value).toBe("20000");
    render(tube({ id: "free", tubePrice: 0, shuttlePrice: 0 }));
    expect(field("Giá cả ống").value).toBe("");
    expect(field("Giá mỗi trái").value).toBe("");
  });
});
