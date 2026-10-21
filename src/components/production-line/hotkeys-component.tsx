import styled from "@emotion/styled";
import { useState } from "react";
import { SettingsModal } from "./settings-modal";
import { SettingsIcon } from "../../assets/icons/icon";
import { Hotkeys, TJoinProductionOptions, TLine } from "./types";

const TempDiv = styled.div`
  padding: 0 0 2rem 0;
`;

const HotkeyDiv = styled.div`
  position: relative;
  align-items: center;
`;

const SettingsBtn = styled.div`
  padding: 0;
  width: 3rem;
  position: absolute;
  bottom: 0;
  right: 0;
  cursor: pointer;
  color: white;
  background: transparent;
`;

type HotkeysComponentProps = {
  callId: string;
  savedHotkeys: Hotkeys;
  customGlobalMute: string;
  line: TLine | null;
  joinProductionOptions: TJoinProductionOptions;
};

export const HotkeysComponent = ({
  callId,
  savedHotkeys,
  customGlobalMute,
  line,
  joinProductionOptions,
}: HotkeysComponentProps) => {
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const isProgramOutputLine = line && line.programOutputLine;
  const isProgramUser =
    joinProductionOptions && joinProductionOptions.isProgramUser;

  const handleSettingsClick = () => {
    setIsSettingsModalOpen(!isSettingsModalOpen);
  };

  return (
    <>
      {(isProgramOutputLine ? isProgramUser : !isProgramUser) && (
        <TempDiv>
          <strong>{(savedHotkeys?.muteHotkey || "").toUpperCase()}: </strong>
          Mutar/ativar microfone
        </TempDiv>
      )}
      {!(isProgramOutputLine && isProgramUser) && (
        <>
          <TempDiv>
            <strong>
              {(savedHotkeys?.speakerHotkey || "").toUpperCase()}:{" "}
            </strong>
            Silenciar/ativar alto-falante
          </TempDiv>
          {!isProgramOutputLine && (
            <TempDiv>
              <strong>
                {(savedHotkeys?.pushToTalkHotkey || "").toUpperCase()}:{" "}
              </strong>
              Apertar para falar
            </TempDiv>
          )}
          <TempDiv>
            <strong>
              {savedHotkeys?.increaseVolumeHotkey.toUpperCase()}:{" "}
            </strong>
            Aumentar volume
          </TempDiv>
          <TempDiv>
            <strong>
              {savedHotkeys?.decreaseVolumeHotkey.toUpperCase()}:{" "}
            </strong>
            Diminuir volume
          </TempDiv>
        </>
      )}
      {!isProgramOutputLine && (
        <TempDiv>
          <strong>
            {(savedHotkeys?.globalMuteHotkey || "").toUpperCase()}:{" "}
          </strong>
          Mutar/ativar todos os microfones
        </TempDiv>
      )}
      <HotkeyDiv>
        <SettingsBtn title="Editar atalhos" onClick={handleSettingsClick}>
          <SettingsIcon />
        </SettingsBtn>
      </HotkeyDiv>
      {isSettingsModalOpen && (
        <SettingsModal
          isOpen={isSettingsModalOpen}
          callId={callId}
          savedHotkeys={savedHotkeys}
          customGlobalMute={customGlobalMute}
          lineName={line?.name}
          programOutPutLine={line?.programOutputLine}
          isProgramUser={joinProductionOptions.isProgramUser}
          onSave={() => setIsSettingsModalOpen(false)}
          onClose={handleSettingsClick}
        />
      )}
    </>
  );
};
