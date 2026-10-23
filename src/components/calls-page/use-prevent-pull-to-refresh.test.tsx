import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePreventPullToRefresh } from "./use-prevent-pull-to-refresh";

const touch = (type: string, target: HTMLElement, y: number) => {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "touches", { value: [{ clientY: y }] });
  target.dispatchEvent(ev);
  return ev;
};

const pullDown = (target: HTMLElement) => {
  touch("touchstart", target, 100);
  return touch("touchmove", target, 160);
};

describe("usePreventPullToRefresh", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("blocks pulling down at the top of the page (no pull-to-refresh)", () => {
    renderHook(() => usePreventPullToRefresh());
    const el = document.body.appendChild(document.createElement("div"));
    expect(pullDown(el).defaultPrevented).toBe(true);
  });

  it("lets a scrolled container (settings modal) scroll back up", () => {
    renderHook(() => usePreventPullToRefresh());
    const modal = document.body.appendChild(document.createElement("div"));
    Object.defineProperty(modal, "scrollTop", { value: 200 });
    const row = modal.appendChild(document.createElement("p"));
    expect(pullDown(row).defaultPrevented).toBe(false);
  });
});
