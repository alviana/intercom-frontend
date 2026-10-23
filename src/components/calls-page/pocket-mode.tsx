import styled from "@emotion/styled";
import { useEffect, useRef, useState } from "react";

const HOLD_MS = 1500;

// iOS home-screen web app: no Safari toolbar or swipe-back outside the overlay.
const standalone =
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  window.matchMedia?.("(display-mode: standalone)").matches === true;

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

/** Looks like the line card's control buttons, at the right above the lines. */
const Open = styled.button`
  display: block;
  margin: 0 1rem 1rem auto;
  padding: 1rem 1.6rem;
  background: rgba(50, 56, 59, 1);
  border: 0.2rem solid #6d6d6d;
  border-radius: 0.8rem;
  color: white;
  font-size: 1.6rem;
  font-weight: 700;
  cursor: pointer;
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

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const cancel = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };

  if (!on) {
    return (
      <Open type="button" onClick={() => setOn(true)}>
        Modo bolso
      </Open>
    );
  }

  return (
    <Overlay onContextMenu={(e) => e.preventDefault()}>
      <div>
        Modo bolso: a tela fica escura e não responde a toques.
        <br />O áudio e o microfone continuam.
        {!standalone && (
          <>
            <br />
            <br />
            Use pelo ícone na tela de início: no Safari, os botões do navegador
            continuam ativos.
          </>
        )}
      </div>
      <Hold
        type="button"
        className={holding ? "holding" : ""}
        onPointerDown={() => {
          window.clearTimeout(timer.current);
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
