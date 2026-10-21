import { FC } from "react";
import { useNavigate } from "react-router";
import { useGlobalState } from "../../global-state/context-provider";
import { DisplayContainerHeader } from "../landing-page/display-container-header";
import { ResponsiveFormContainer } from "../generic-components";
import { NavigateToRootButton } from "../navigate-to-root-button/navigate-to-root-button";
import { HeaderWrapper } from "../create-production/create-production-components";
import { UserSettingsForm } from "../user-settings-form/user-settings-form";
import { useAndroidSettingsFormAdapter } from "./android-settings-adapter";
import { HeadsetButtonTest } from "./HeadsetButtonTest";

export const MobileSettingsPage: FC<{
  isModal?: boolean;
  onClose?: () => void;
  onSave?: () => void;
}> = ({ isModal = false, onClose, onSave }) => {
  const navigate = useNavigate();
  const [{ devices, userSettings }] = useGlobalState();
  const settingsAdapter = useAndroidSettingsFormAdapter();

  const defaultValues = {
    username: userSettings?.username,
    audioinput:
      userSettings?.audioinput ??
      devices.input?.find((d) => d.deviceId === "default")?.deviceId ??
      devices.input?.[0]?.deviceId,
    audiooutput: userSettings?.audiooutput,
    backendUrl: userSettings?.backendUrl,
    backendApiKey: userSettings?.backendApiKey,
  };

  const form = devices ? (
    <UserSettingsForm
      buttonText="Salvar"
      defaultValues={defaultValues}
      updateUserSettings
      needsConfirmation
      onSave={onSave ?? (() => navigate("/"))}
      settingsAdapter={settingsAdapter}
    />
  ) : null;

  if (isModal) {
    return (
      <>
        {form}
        <HeadsetButtonTest />
      </>
    );
  }

  return (
    <ResponsiveFormContainer>
      <HeaderWrapper>
        <NavigateToRootButton onNavigate={onClose ?? (() => navigate("/"))} />
        <DisplayContainerHeader>Configurações</DisplayContainerHeader>
      </HeaderWrapper>
      {form}
      <HeadsetButtonTest />
    </ResponsiveFormContainer>
  );
};
