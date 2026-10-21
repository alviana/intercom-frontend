import styled from "@emotion/styled";
import { FC } from "react";
import logoAc24horas from "../assets/logo-ac24horas-branco.png";
import { backgroundColour } from "../css-helpers/defaults.ts";
import { mediaQueries } from "./generic-components.ts";

const HeaderWrapper = styled.div`
  width: 100%;
  background: ${backgroundColour};
  margin: 0 0 1rem 0;
`;

const AppTitle = styled.div`
  background: ${backgroundColour};
  padding: 1rem;
  display: flex;
  align-items: center;
  width: fit-content;
  font-size: 3rem;
  font-weight: semi-bold;
  color: rgba(255, 255, 255, 0.87);

  img {
    height: 3.6rem;
    width: auto;
    margin: 0 1.2rem 0 1rem;
  }

  ${mediaQueries.isSmallScreen} {
    font-size: 2rem;

    img {
      height: 2.6rem;
    }
  }
`;

export const Header: FC = () => {
  return (
    <HeaderWrapper>
      <AppTitle aria-label="Intercom ac24horas">
        <img src={logoAc24horas} alt="ac24horas" />
        Intercom
      </AppTitle>
    </HeaderWrapper>
  );
};
