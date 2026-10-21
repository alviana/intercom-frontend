import styled from "@emotion/styled";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router";
import { ErrorPage } from "./components/router-error.tsx";
import { useDevicePermissions } from "./hooks/use-device-permission.ts";
import { LandingPage } from "./components/landing-page/landing-page.tsx";
import { useInitializeGlobalStateReducer } from "./global-state/global-state-reducer.ts";
import {
  GlobalStateContext,
  useGlobalState,
} from "./global-state/context-provider.tsx";
import { ErrorBanner } from "./components/error";
import { useFetchDevices } from "./hooks/use-fetch-devices.ts";
import {
  DisplayContainer,
  FlexContainer,
} from "./components/generic-components.ts";
import { DisplayWarning } from "./components/display-box.tsx";
import { isValidBrowser } from "./bowser.ts";
import { DisplayContainerHeader } from "./components/landing-page/display-container-header.tsx";
import { NavigateToRootButton } from "./components/navigate-to-root-button/navigate-to-root-button.tsx";
import { CallsPage } from "./components/calls-page/calls-page.tsx";
import { Header } from "./components/header.tsx";
import { useLocalUserSettings } from "./hooks/use-local-user-settings.ts";
import { ManageProductionsPage } from "./components/manage-productions-page/manage-productions-page.tsx";
import { CreateProductionPage } from "./components/create-production/create-production-page.tsx";
import { useSetupTokenRefresh } from "./hooks/use-reauth.tsx";
import { TUserSettings } from "./components/user-settings/types";
import { PresetProvider } from "./contexts/preset-context.tsx";
import {
  MobileProviders,
  MobileSettingsModal,
} from "./components/mobile/mobile-extensions";
import {
  renderMobileRoutes,
  useMobileBackgroundLocation,
  useMobileSettingsNavigation,
} from "./components/mobile/mobile-routing";
import { isMobileApp } from "./platform";

const DisplayBoxPositioningContainer = styled(FlexContainer)`
  justify-content: center;
  align-items: center;
  padding-top: 12rem;
`;

const ButtonWrapper = styled.div`
  margin: 0 2rem 2rem;
  display: inline-block;
`;

const LinesToCallsRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={`/calls${search}`} replace />;
};

const NotFound = () => {
  return (
    <DisplayContainer>
      <DisplayContainerHeader>
        <ButtonWrapper>
          <NavigateToRootButton />
        </ButtonWrapper>
        Página não encontrada.
      </DisplayContainerHeader>
    </DisplayContainer>
  );
};

type AppContentProps = {
  continueToApp: boolean;
  denied: boolean;
  permission: boolean;
  apiError: boolean;
  userSettings: TUserSettings | null;
  setUnsupportedContinue: (value: boolean) => void;
  setApiError: Dispatch<SetStateAction<boolean>>;
};

const AppRouterShell = ({
  continueToApp,
  denied,
  permission,
  apiError,
  userSettings,
  setUnsupportedContinue,
  setApiError,
}: AppContentProps) => {
  const location = useLocation();
  const openMobileSettings = useMobileSettingsNavigation();
  const [{ apiError: globalApiError }] = useGlobalState();
  const backgroundLocation = useMobileBackgroundLocation(location);
  const mobileOnSettings = isMobileApp() && location.pathname === "/settings";
  const showRoutes =
    mobileOnSettings ||
    (permission && !denied && userSettings && (!apiError || mobileOnSettings));

  useEffect(() => {
    setApiError(!!globalApiError);
  }, [globalApiError, setApiError]);

  return (
    <>
      <Header />
      <MobileProviders />
      <ErrorBanner />

      {!isValidBrowser && !continueToApp && (
        <DisplayBoxPositioningContainer>
          <DisplayWarning
            text={
              <>
                <p>
                  Para usar este aplicativo, recomendamos um dos seguintes
                  navegadores:
                </p>
                <ul>
                  <li>Chrome 115+</li>
                  <li>Edge 115+</li>
                  <li>Firefox 113+</li>
                  <li>Safari 16.4+</li>
                  <li>Samsung Internet 21+</li>
                  <li>Opera 101+</li>
                </ul>
                <p>
                  Se você já usa um dos navegadores recomendados, a versão é
                  antiga e deve ser atualizada antes de continuar.
                </p>
              </>
            }
            title="Navegador não suportado"
            btn={() => setUnsupportedContinue(true)}
          />
        </DisplayBoxPositioningContainer>
      )}
      {continueToApp && (
        <>
          {denied && (
            <DisplayBoxPositioningContainer>
              <DisplayWarning
                text="Para usar este aplicativo, é preciso permitir o acesso aos dispositivos de áudio. Recarregue o navegador e/ou redefina as permissões para tentar novamente."
                title="Permissões negadas"
              />
            </DisplayBoxPositioningContainer>
          )}
          {!permission && !denied && (
            <DisplayBoxPositioningContainer>
              <DisplayWarning
                text="Para usar este aplicativo, é preciso permitir o acesso aos dispositivos de áudio."
                title="Aguardando permissão dos dispositivos"
              />
            </DisplayBoxPositioningContainer>
          )}
          {apiError && !mobileOnSettings && (
            <DisplayBoxPositioningContainer>
              <DisplayWarning
                text={
                  isMobileApp()
                    ? "O servidor não está disponível. Abra as configurações, verifique a URL do servidor e salve — o app voltará à tela inicial e recarregará a lista de produções."
                    : "O servidor não está disponível. Recarregue a página para tentar novamente."
                }
                title="Servidor indisponível"
                btn={openMobileSettings}
                btnLabel={isMobileApp() ? "Abrir configurações" : undefined}
              />
            </DisplayBoxPositioningContainer>
          )}
          {showRoutes && (
            <>
              <Routes location={backgroundLocation ?? location}>
                <Route
                  path="/"
                  element={<LandingPage />}
                  errorElement={<ErrorPage />}
                />
                <Route
                  path="/create"
                  element={<CreateProductionPage />}
                  errorElement={<ErrorPage />}
                />
                <Route
                  path="/manage"
                  element={<ManageProductionsPage />}
                  errorElement={<ErrorPage />}
                />
                <Route
                  path="/production-lines/production/:productionId/line/:lineId"
                  element={<CallsPage />}
                  errorElement={<ErrorPage />}
                />
                <Route
                  path="/calls"
                  element={<CallsPage />}
                  errorElement={<ErrorPage />}
                />
                <Route path="/lines" element={<LinesToCallsRedirect />} />
                {renderMobileRoutes()}
                <Route path="*" element={<NotFound />} />
              </Routes>
              <MobileSettingsModal
                backgroundLocation={backgroundLocation}
                mobileOnSettings={mobileOnSettings}
              />
            </>
          )}
        </>
      )}
    </>
  );
};

const AppContent = ({
  continueToApp,
  denied,
  permission,
  apiError,
  userSettings,
  setUnsupportedContinue,
  setApiError,
}: AppContentProps) => {
  const { setupTokenRefresh } = useSetupTokenRefresh();

  useEffect(() => {
    const cleanup = setupTokenRefresh();
    return () => cleanup();
  }, [setupTokenRefresh]);

  return (
    <PresetProvider>
      <BrowserRouter>
        <AppRouterShell
          continueToApp={continueToApp}
          denied={denied}
          permission={permission}
          apiError={apiError}
          userSettings={userSettings}
          setUnsupportedContinue={setUnsupportedContinue}
          setApiError={setApiError}
        />
      </BrowserRouter>
    </PresetProvider>
  );
};

const App = () => {
  const [unsupportedContinue, setUnsupportedContinue] = useState(false);
  const continueToApp = isValidBrowser || isMobileApp() || unsupportedContinue;
  const { denied, permission } = useDevicePermissions({ continueToApp });
  const initializedGlobalState = useInitializeGlobalStateReducer();
  const [{ devices, userSettings }, dispatch] = initializedGlobalState;
  const [apiError, setApiError] = useState(false);

  useFetchDevices({
    dispatch,
    permission,
  });

  useLocalUserSettings({ devices, dispatch });

  return (
    <GlobalStateContext.Provider value={initializedGlobalState}>
      <AppContent
        continueToApp={continueToApp}
        denied={denied}
        permission={permission}
        apiError={apiError}
        userSettings={userSettings}
        setUnsupportedContinue={setUnsupportedContinue}
        setApiError={setApiError}
      />
    </GlobalStateContext.Provider>
  );
};

export default App;
