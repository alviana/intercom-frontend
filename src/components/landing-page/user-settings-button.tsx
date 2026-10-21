import styled from "@emotion/styled";
import { FC } from "react";
import { useLocation, useNavigate } from "react-router";
import { UserSettingsIcon } from "../../assets/icons/icon";
import { useStorage } from "../accessing-local-storage/access-local-storage";
import { isMobile } from "../../bowser";
import { isMobileApp } from "../../platform";

const UserSettingsWrapper = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  padding: 1rem 2rem 1rem 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  font-size: 2rem;
  font-weight: bold;

  &:hover {
    cursor: pointer;
  }

  svg {
    width: 2.5rem;
    flex-shrink: 0;
    fill: rgba(255, 92, 77, 1);
  }

  &.mobile {
    width: 50vw;
    justify-content: end;
    font-size: 1.5rem;
  }
`;

const Username = styled.div`
  margin-right: 0.5rem;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
`;

interface UserSettingsButtonProps {
  onClick?: () => void;
  openAsRouteOnMobile?: boolean;
}

export const UserSettingsButton: FC<UserSettingsButtonProps> = (props) => {
  const { onClick, openAsRouteOnMobile = true } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const { readFromStorage } = useStorage();
  const username = readFromStorage("username") || "Guest";

  const handleClick = () => {
    if (isMobileApp() && openAsRouteOnMobile) {
      navigate("/settings", { state: { backgroundLocation: location } });
      return;
    }
    onClick?.();
  };

  return (
    <UserSettingsWrapper
      className={isMobile ? "mobile" : ""}
      onClick={handleClick}
    >
      <Username>{username}</Username>
      <UserSettingsIcon />
    </UserSettingsWrapper>
  );
};
