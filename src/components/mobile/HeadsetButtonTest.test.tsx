import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { HeadsetButtonTest } from "./HeadsetButtonTest";
import {
  clearHeadsetLog,
  logHeadsetEvent,
} from "../../mobile-overlay/headset-diagnostics";

const entry = (at: number, key: string) => ({
  at,
  key,
  action: "toggle",
  source: "media",
  result: "ok",
});
const hms = (at: number) => {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

describe("HeadsetButtonTest", () => {
  beforeEach(() => clearHeadsetLog());
  afterEach(cleanup);

  it("shows empty state, heading and instruction", () => {
    render(<HeadsetButtonTest />);
    expect(screen.getByText("Teste do botão do fone")).toBeTruthy();
    expect(
      screen.getByText(
        "Entre numa linha e aperte o botão do fone. Cada aperto aparece aqui."
      )
    ).toBeTruthy();
    expect(screen.getByText("Nenhum aperto recebido ainda.")).toBeTruthy();
  });

  it("lists entries newest first, updates live and clears", () => {
    const t1 = new Date(2026, 0, 1, 9, 5, 7).getTime();
    const t2 = new Date(2026, 0, 1, 13, 45, 30).getTime();
    logHeadsetEvent(entry(t1, "KEY_A"));
    logHeadsetEvent(entry(t2, "KEY_B"));
    render(<HeadsetButtonTest />);
    let rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain(hms(t2));
    expect(rows[0].textContent).toContain("KEY_B");
    expect(rows[1].textContent).toContain("09:05:07");
    expect(rows[1].textContent).toContain("toggle");
    expect(rows[1].textContent).toContain("ok");

    act(() => logHeadsetEvent(entry(t2 + 1000, "KEY_C")));
    rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("KEY_C");

    fireEvent.click(screen.getByText("Limpar"));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("Nenhum aperto recebido ainda.")).toBeTruthy();
  });
});
