import styled from "@emotion/styled";
import { useNavigate } from "react-router";
import { BackArrow } from "../../assets/icons/icon";

const StyledBackBtn = styled.div`
  cursor: pointer;
  color: #ff5c4d;
  background: transparent;
  padding: 0;
  margin: 0;
  width: 4rem;
  height: 4rem;

  svg {
    fill: #ff5c4d;
  }
`;

export const NavigateToRootButton = ({
  onNavigate,
}: {
  onNavigate?: () => void;
}) => {
  const navigate = useNavigate();

  return (
    <StyledBackBtn
      onClick={() => {
        if (onNavigate) {
          onNavigate();
        } else {
          navigate("/");
        }
      }}
    >
      <BackArrow />
    </StyledBackBtn>
  );
};
