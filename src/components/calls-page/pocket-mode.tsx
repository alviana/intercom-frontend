import styled from "@emotion/styled";
import { useRef, useState } from "react";
import { SecondaryButton } from "../form-elements/form-elements";

const HOLD_MS = 1500;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: #000;
  color: #777;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3rem;
  font-size: 1.8rem;
  text-align: center;
  padding: 2rem;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
`;

const Hold = styled.button`
  width: 16rem;
  height: 16rem;
  border-radius: 50%;
  border: 0.3rem solid #444;
  background: #111;
  color: #aaa;
  font-size: 1.8rem;
  font-weight: 700;
  -webkit-touch-callout: none;

  &.holding {
    border-color: #6fd84f;
    color: #6fd84f;
    transition: border-color ${HOLD_MS}ms;
  }
`;

/**
 * Phone browser only: a black screen that ignores touches, so the phone can stay unlocked
 * (the browser cuts the mic when the screen locks) in a pocket. Hold to leave.
 */
export const PocketMode = () => {
  const [on, setOn] = useState(false);
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const cancel = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };

  if (!on) {
    return (
      <SecondaryButton type="button" onClick={() => setOn(true)}>
        Modo bolso
      </SecondaryButton>
    );
  }

  return (
    <Overlay onContextMenu={(e) => e.preventDefault()}>
      <div>
        Modo bolso: a tela fica escura e não responde a toques.
        <br />O áudio e o microfone continuam.
      </div>
      <Hold
        type="button"
        className={holding ? "holding" : ""}
        onPointerDown={() => {
          setHolding(true);
          timer.current = window.setTimeout(() => {
            setHolding(false);
            setOn(false);
          }, HOLD_MS);
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
      >
        Segure para sair
      </Hold>
    </Overlay>
  );
};
