import styled from "@emotion/styled";
import { Modal } from "../modal/modal";
import { PrimaryButton } from "../form-elements/form-elements";
import { Checkbox } from "../checkbox/checkbox";

const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  padding-top: 2rem;
`;

const ButtonWrapper = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const CheckboxWrapper = styled.div`
  display: flex;
  flex-direction: row;
  margin-bottom: 1rem;
  margin-top: 1rem;
`;

type AudioFeedModalProps = {
  onClose: () => void;
  onJoin: () => void;
  setIsProgramUser: (value: boolean) => void;
  isProgramUser: boolean;
};

export const AudioFeedModal = ({
  onClose,
  onJoin,
  setIsProgramUser,
  isProgramUser,
}: AudioFeedModalProps) => {
  return (
    <Modal onClose={onClose}>
      <ContentWrapper>
        <p>
          Esta é uma linha de áudio do programa. Deseja entrar na linha como
          feed de áudio ou como ouvinte?
        </p>
        <CheckboxWrapper>
          <Checkbox
            label="Ouvinte"
            checked={!isProgramUser}
            onChange={() => setIsProgramUser(false)}
          />
          <Checkbox
            label="Áudio do programa"
            checked={isProgramUser}
            onChange={() => setIsProgramUser(true)}
          />
        </CheckboxWrapper>
      </ContentWrapper>
      <ButtonWrapper>
        <PrimaryButton onClick={onJoin}>Entrar</PrimaryButton>
      </ButtonWrapper>
    </Modal>
  );
};
