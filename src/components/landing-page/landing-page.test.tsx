import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LandingPage } from "./landing-page";
import { useGlobalState } from "../../global-state/context-provider";

const { navigate, platform } = vi.hoisted(() => ({
  navigate: vi.fn(),
  platform: { mobile: true },
}));

vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: "/" }),
}));
vi.mock("../../platform", () => ({ isMobileApp: () => platform.mobile }));
vi.mock("../../global-state/context-provider", () => ({
  useGlobalState: vi.fn(),
}));
vi.mock("./productions-list-container.tsx", () => ({
  ProductionsListContainer: () => null,
}));
vi.mock("./user-settings-button.tsx", () => ({
  UserSettingsButton: () => null,
}));
vi.mock("../user-settings/user-settings.tsx", () => ({
  UserSettings: () => null,
}));

const withUsername = (username: string) =>
  vi
    .mocked(useGlobalState)
    .mockReturnValue([{ userSettings: { username } }, vi.fn()] as never);

describe("LandingPage first run on the app", () => {
  afterEach(() => {
    cleanup();
    navigate.mockClear();
    platform.mobile = true;
  });

  it("opens the settings to ask the name when it is empty", () => {
    withUsername("");
    render(<LandingPage />);
    expect(navigate).toHaveBeenCalledWith("/settings", {
      state: { backgroundLocation: { pathname: "/" } },
    });
  });

  it("asks only once while the name is still empty (no redirect loop)", () => {
    withUsername("");
    const { rerender } = render(<LandingPage />);
    rerender(<LandingPage />);
    rerender(<LandingPage />);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("does not open the settings when a name is saved", () => {
    withUsername("Ale");
    render(<LandingPage />);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps the inline web form on the browser", () => {
    platform.mobile = false;
    withUsername("");
    render(<LandingPage />);
    expect(navigate).not.toHaveBeenCalled();
  });
});
