import { useState } from "react";
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
