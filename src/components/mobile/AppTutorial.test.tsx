import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppTutorial } from "./AppTutorial";

const h = vi.hoisted(() => ({ mobile: true, ios: true }));

vi.mock("../../platform", () => ({
  isMobileApp: () => h.mobile,
  isIOSApp: () => h.ios,
}));

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  h.mobile = true;
  h.ios = true;
});

const finish = () => {
  for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByText("Próximo"));
  fireEvent.click(screen.getByText("Começar"));
};

describe("AppTutorial", () => {
  it("walks through 5 slides and closes on Começar", () => {
    render(<AppTutorial />);
    expect(screen.getByText("Entrar na linha")).toBeTruthy();
    expect(screen.getByText("1 de 5")).toBeTruthy();
    fireEvent.click(screen.getByText("Próximo"));
    expect(screen.getByText("Som e microfone")).toBeTruthy();
    fireEvent.click(screen.getByText("Voltar"));
    expect(screen.getByText("Entrar na linha")).toBeTruthy();
    finish();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows again on the next start unless Não mostrar novamente was checked", () => {
    render(<AppTutorial />);
    finish();
    cleanup();
    render(<AppTutorial />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Não mostrar novamente"));
    finish();
    cleanup();
    render(<AppTutorial />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("iOS explains the green call icon; Android does not", () => {
    render(<AppTutorial />);
    fireEvent.click(screen.getByText("Próximo"));
    fireEvent.click(screen.getByText("Próximo"));
    expect(screen.queryByText(/ícone verde de chamada/)).toBeTruthy();
    cleanup();
    h.ios = false;
    render(<AppTutorial />);
    fireEvent.click(screen.getByText("Próximo"));
    fireEvent.click(screen.getByText("Próximo"));
    expect(screen.getByText("Botão do fone")).toBeTruthy();
    expect(screen.queryByText(/ícone verde de chamada/)).toBeNull();
  });

  it("never shows outside the mobile app", () => {
    h.mobile = false;
    render(<AppTutorial />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
