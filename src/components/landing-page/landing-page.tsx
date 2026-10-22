import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ProductionsListContainer } from "./productions-list-container.tsx";
import { useGlobalState } from "../../global-state/context-provider.tsx";
import { UserSettings } from "../user-settings/user-settings.tsx";
import { UserSettingsButton } from "./user-settings-button.tsx";
import { TUserSettings } from "../user-settings/types.ts";
import { isMobile } from "../../bowser.ts";
import { isMobileApp } from "../../platform.ts";

export const LandingPage = () => {
  const [{ userSettings }] = useGlobalState();
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const isUserSettingsComplete = (settings: TUserSettings | null) => {
    return (
      settings &&
      settings.username &&
      (settings.audioinput || settings.audiooutput)
    );
  };

  const settingsLoaded = userSettings?.username !== undefined;

  const showInlineWebSettings =
    !isMobileApp() && (showSettings || !isUserSettingsComplete(userSettings));

  // The app has no inline form: without a name it would join as "Guest" and fail, so ask for it first.
  const navigate = useNavigate();
  const location = useLocation();
  const needsName = isMobileApp() && settingsLoaded && !userSettings?.username;
  useEffect(() => {
    if (needsName)
      navigate("/settings", { state: { backgroundLocation: location } });
  }, [needsName, navigate, location]);

  return (
    <div>
      {settingsLoaded &&
        (showInlineWebSettings ? (
          <UserSettings
            buttonText={showSettings ? "Salvar" : "Próximo"}
            className={isMobile ? "" : "desktop"}
            onSave={() => setShowSettings(false)}
            showBackButton={showSettings}
            onBack={() => setShowSettings(false)}
          />
        ) : (
          <>
            <UserSettingsButton
              onClick={() => setShowSettings(!showSettings)}
            />
            <ProductionsListContainer />
          </>
        ))}
    </div>
  );
};
