import { useState } from "react";
import styled from "@emotion/styled";
import { generateWhipUrl } from "../../utils/generateWhipUrl";
import { generateWhepUrl } from "../../utils/generateWhepUrl";
import { DecorativeLabel, FormInput } from "../form-elements/form-elements";
import { Modal } from "../modal/modal";

const Description = styled.p`
  font-size: 1.4rem;
  color: rgba(255, 255, 255, 0.7);
  margin: 0 0 1.5rem 0;
  line-height: 1.5;
`;

const UsernameField = styled.div`
  margin-bottom: 1.5rem;
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const CopyButton = styled.button<{ copied: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 1rem 1.5rem;
  font-size: 1.6rem;
  font-weight: 600;
  background: #383838;
  color: ${({ copied }) => (copied ? "#91fa8c" : "white")};
  border: 0.1rem solid ${({ copied }) => (copied ? "#91fa8c" : "#6d6d6d")};
  border-radius: 0.6rem;
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    border-color: ${({ copied }) => (copied ? "#91fa8c" : "#ff5c4d")};
    color: ${({ copied }) => (copied ? "#91fa8c" : "#ff5c4d")};
  }
`;

type TGenerateWhipWhepUrlModalProps = {
  productionId: string;
  lineId: string;
  onClose: () => void;
};

export const GenerateWhipWhepUrlModal = ({
  productionId,
  lineId,
  onClose,
}: TGenerateWhipWhepUrlModalProps) => {
  const [username, setUsername] = useState("");
  const [whipCopied, setWhipCopied] = useState(false);
  const [whepCopied, setWhepCopied] = useState(false);

  const trimmed = username.trim();
  const whipUrl = trimmed ? generateWhipUrl(productionId, lineId, trimmed) : "";
  const whepUrl = trimmed ? generateWhepUrl(productionId, lineId, trimmed) : "";

  const handleCopy = (url: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Modal onClose={onClose} title="Áudio em tempo real (WebRTC)">
      <Description>
        Informe um nome de usuário para gerar links de conexão WHIP e WHEP.
      </Description>
      <UsernameField>
        <DecorativeLabel>Nome de usuário</DecorativeLabel>
        <FormInput
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="nome de usuário"
        />
      </UsernameField>
      <ButtonGroup>
        <CopyButton
          type="button"
          copied={whipCopied}
          disabled={!whipUrl}
          onClick={() => handleCopy(whipUrl, setWhipCopied)}
        >
          {whipCopied
            ? "✓ Link de entrada copiado!"
            : "Copiar link de entrada (WHIP)"}
        </CopyButton>
        <CopyButton
          type="button"
          copied={whepCopied}
          disabled={!whepUrl}
          onClick={() => handleCopy(whepUrl, setWhepCopied)}
        >
          {whepCopied
            ? "✓ Link de saída copiado!"
            : "Copiar link de saída (WHEP)"}
        </CopyButton>
      </ButtonGroup>
    </Modal>
  );
};
