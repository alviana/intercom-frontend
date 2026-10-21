import { useEffect, useRef, useState, useCallback } from "react";
import { generateWhepUrl } from "../../../utils/generateWhepUrl";
import { CopyButton } from "../../copy-button/copy-button";
import { DecorativeLabel } from "../../form-elements/form-elements";
import { Modal } from "../../modal/modal";
import { RefreshButton } from "../../refresh-button/refresh-button";
import {
  CombinedInputWrapper,
  InputWrapper,
  LinkLabel,
  ModalNoteWrapper,
  ModalText,
  ModalTextBold,
  ModalTextItalic,
  Wrapper,
} from "../generate-urls-components";

type TGenerateWhepUrlModalProps = {
  productionId: string;
  lineId: string;
  onClose: () => void;
};

export const GenerateWhepUrlModal = ({
  productionId,
  lineId,
  onClose,
}: TGenerateWhepUrlModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [username, setUsername] = useState("");
  const [whepUrl, setWhepUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const generateUrl = useCallback(() => {
    if (username.trim()) {
      const url = generateWhepUrl(productionId, lineId, username.trim());
      setWhepUrl(url);
    } else {
      setWhepUrl("");
    }
  }, [username, productionId, lineId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    generateUrl();
  }, [generateUrl]);

  const handleRefresh = () => {
    setIsLoading(true);
    generateUrl();
    setTimeout(() => {
      setIsLoading(false);
    }, 500);
  };

  return (
    <Modal onClose={onClose} title="Gerar link de saída de áudio (WHEP)">
      <div ref={modalRef}>
        <ModalText>
          Informe um nome de usuário para gerar o link de saída de áudio (WHEP)
          de conexão com o servidor.
        </ModalText>
        <ModalNoteWrapper>
          <ModalTextBold>Observação:</ModalTextBold>
          <ModalTextItalic>
            Este link está vinculado ao nome de usuário e muda se você o
            renovar.
          </ModalTextItalic>
        </ModalNoteWrapper>

        <Wrapper>
          <InputWrapper>
            <LinkLabel>
              <DecorativeLabel>Link de saída (WHEP)</DecorativeLabel>
              <CombinedInputWrapper>
                <span>{generateWhepUrl(productionId, lineId, "")}</span>
                <input
                  aria-label="Nome de usuário da saída (WHEP)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="nome de usuário"
                />
              </CombinedInputWrapper>
            </LinkLabel>
            <CopyButton
              urls={[whepUrl]}
              className="share-line-link-modal"
              disabled={!whepUrl}
            />
          </InputWrapper>
        </Wrapper>

        <RefreshButton
          label="Renovar link"
          isLoading={isLoading}
          onRefresh={handleRefresh}
        />
      </div>
    </Modal>
  );
};
