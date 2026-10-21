import styled from "@emotion/styled";
import { FC } from "react";
import { HeadsetIcon } from "../assets/icons/icon.tsx";
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

  svg {
    width: 2.4rem;
    height: 2.4rem;
    margin-right: 1rem;
    margin-left: 1rem;
    fill: #59cbe8;
  }

  ${mediaQueries.isSmallScreen} {
    font-size: 2rem;

    svg {
      width: 2rem;
      height: 2rem;
    }
  }
`;

export const Header: FC = () => {
  return (
    <HeaderWrapper>
      <AppTitle aria-label="Intercom ac24horas">
        <HeadsetIcon />
        Intercom ac24horas
      </AppTitle>
    </HeaderWrapper>
  );
};
