import styled from "@emotion/styled";
import { useNavigate, type Location } from "react-router";
import { isMobileApp } from "../../platform";
import { BackendStatus } from "../backend-status/backend-status";
import { CompanionStatus } from "../companion-status/companion-status";
import { Modal } from "../modal/modal";
import { BubbleActionHandler } from "./BubbleActionHandler";
import { CallServiceManager } from "./CallServiceManager";
import { HeadsetButtonManager } from "./HeadsetButtonManager";
import { CompanionManager } from "./CompanionManager";
import { MobileInit } from "./MobileInit";
import { AudioRouteManager } from "./AudioRouteManager";
import { StartupPermissions } from "./StartupPermissions";
import { MobileSettingsPage } from "./MobileSettingsPage";
import { companionFeatureEnabled } from "../../config";

const StatusBar = styled.div`
  display: flex;
  justify-content: center;
  padding: 0.4rem 1rem 0.8rem 1rem;
`;

export const MobileProviders = () => {
  if (!isMobileApp()) return null;

  return (
    <>
      <StartupPermissions />
      <AudioRouteManager />
      <StatusBar>
        <BackendStatus />
        {companionFeatureEnabled && (
          <>
            <span style={{ width: 8 }} />
            <CompanionStatus />
          </>
        )}
      </StatusBar>
      <BubbleActionHandler />
      <MobileInit />
      <CallServiceManager />
      <HeadsetButtonManager />
      {companionFeatureEnabled && <CompanionManager />}
    </>
  );
};

export const MobileSettingsModal = ({
  backgroundLocation,
  mobileOnSettings,
}: {
  backgroundLocation: Location | null;
  mobileOnSettings: boolean;
}) => {
  const navigate = useNavigate();

  if (!isMobileApp() || !backgroundLocation || !mobileOnSettings) return null;

  return (
    <Modal onClose={() => navigate(-1)} title="Configurações">
      <MobileSettingsPage
        isModal
        onClose={() => navigate(-1)}
        onSave={() => navigate(-1)}
      />
    </Modal>
  );
};
