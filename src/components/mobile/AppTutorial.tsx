import styled from "@emotion/styled";
import { useState } from "react";
import {
  HeadsetIcon,
  LogoutIcon,
  MicMuted,
  MicUnmuted,
  SpeakerOn,
} from "../../assets/icons/icon";
import { isIOSApp, isMobileApp } from "../../platform";
import { Modal } from "../modal/modal";
import { PrimaryButton, SecondaryButton } from "../form-elements/form-elements";

// Same "id." prefix and JSON value as the other stored settings (see ios-callkit-mode).
const STORAGE_KEY = "id.tutorialHidden";

const readHidden = (): boolean => {
  try {
    return (
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "false") === true
    );
  } catch {
    return false;
  }
};

const Picture = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding: 1.6rem;
  margin-bottom: 1.4rem;
  background: #2b2d31;
  border: 0.1rem solid #4a4d52;
  border-radius: 1.2rem;
  color: white;
  font-weight: 700;
  font-size: 1.4rem;
`;

/** Looks like the line card's Som / Microfone buttons. */
const Key = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  min-width: 7rem;
  height: 5rem;
  padding: 0 1rem;
  background: rgba(50, 56, 59, 1);
  border: 0.2rem solid #6d6d6d;
  border-radius: 0.8rem;

  svg {
    width: 2.6rem;
  }
  &.on svg {
    fill: #6fd84f;
  }
  &.off svg {
    fill: #f96c6c;
  }
`;

const BigIcon = styled.div`
  svg {
    width: 6rem;
    fill: white;
  }
`;

const Text = styled.div`
  font-size: 1.6rem;
  line-height: 1.5;
  /* Same height on every slide, so Próximo stays under the thumb. */
  min-height: 15rem;

  p {
    margin: 0 0 0.8rem;
  }
`;

const Footer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  margin-top: 1.6rem;
`;

const Check = styled.label`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  font-size: 1.5rem;

  input {
    width: 2.2rem;
    height: 2.2rem;
  }
`;

const Nav = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;

  span {
    flex: 1;
    font-size: 1.4rem;
    color: #bbb;
  }

  button {
    min-height: 4.8rem;
    min-width: 10rem;
    font-size: 1.6rem;
  }
`;

type Slide = { title: string; picture: React.ReactNode; body: React.ReactNode };

const slides = (ios: boolean): Slide[] => [
  {
    title: "Entrar na linha",
    picture: (
      <BigIcon>
        <HeadsetIcon />
      </BigIcon>
    ),
    body: (
      <>
        <p>
          Na tela inicial, abra a produção e toque em <b>Entrar</b> na sua
          linha.
        </p>
        <p>Use fone de ouvido: com fio, EarPods ou Bluetooth.</p>
      </>
    ),
  },
  {
    title: "Som e microfone",
    picture: (
      <>
        <Key className="on">
          <SpeakerOn />
        </Key>
        <Key className="off">
          <MicMuted />
        </Key>
      </>
    ),
    body: (
      <>
        <p>
          <b>Som</b>: liga ou desliga o que você ouve.
        </p>
        <p>
          <b>Microfone</b>: um toque abre, outro toque fecha. Vermelho é
          fechado.
        </p>
        <p>
          <b>Apertar para falar</b>: segure, fale e solte, como um rádio.
        </p>
      </>
    ),
  },
  {
    title: "Botão do fone",
    picture: (
      <>
        <BigIcon>
          <HeadsetIcon />
        </BigIcon>
        <Key className="on">
          <MicUnmuted />
        </Key>
      </>
    ),
    body: (
      <>
        <p>Um aperto no botão do fone liga ou desliga o microfone.</p>
        {ios && (
          <p>
            No iPhone aparece um ícone verde de chamada no alto da tela. É
            normal: é ele que faz o botão do fone funcionar.
          </p>
        )}
      </>
    ),
  },
  {
    title: "Tela bloqueada",
    picture: ios ? (
      <>
        <Key className="on">
          <SpeakerOn /> Som
        </Key>
        <Key className="off">
          <MicMuted /> Microfone
        </Key>
      </>
    ) : (
      <Key className="on">FALAR</Key>
    ),
    body: ios ? (
      <p>
        Pode bloquear o iPhone e guardar no bolso. Na tela bloqueada aparece o
        cartão do Intercom com <b>Som</b>, <b>Microfone</b> e quem está falando.
      </p>
    ) : (
      <p>
        Pode bloquear o celular e guardar no bolso. Fora do app, os controles
        flutuantes mostram sua linha com o botão <b>FALAR</b>.
      </p>
    ),
  },
  {
    title: "Sair",
    picture: (
      <BigIcon>
        <LogoutIcon />
      </BigIcon>
    ),
    body: (
      <>
        <p>
          Ao terminar, toque em <b>Sair da linha</b>.
        </p>
        {ios && <p>Fechar o app arrastando para cima também sai da linha.</p>}
      </>
    ),
  },
];

/** Mobile app only: a short tutorial on every app start until "Não mostrar novamente". */
export const AppTutorial = () => {
  const [open, setOpen] = useState(() => isMobileApp() && !readHidden());
  const [index, setIndex] = useState(0);
  const [hide, setHide] = useState(false);

  if (!open) return null;

  const all = slides(isIOSApp());
  const slide = all[index];
  const last = index === all.length - 1;

  const close = () => {
    if (hide) {
      try {
        window.localStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // ignore
      }
    }
    setOpen(false);
  };

  return (
    <Modal onClose={close} title={slide.title}>
      <Picture>{slide.picture}</Picture>
      <Text>{slide.body}</Text>
      <Footer>
        <Check>
          <input
            id="tutorial-hide"
            type="checkbox"
            checked={hide}
            onChange={(e) => setHide(e.target.checked)}
          />
          Não mostrar novamente
        </Check>
        <Nav>
          <span>
            {index + 1} de {all.length}
          </span>
          {index > 0 && (
            <SecondaryButton type="button" onClick={() => setIndex(index - 1)}>
              Voltar
            </SecondaryButton>
          )}
          <PrimaryButton
            type="button"
            onClick={() => (last ? close() : setIndex(index + 1))}
          >
            {last ? "Começar" : "Próximo"}
          </PrimaryButton>
        </Nav>
      </Footer>
    </Modal>
  );
};
