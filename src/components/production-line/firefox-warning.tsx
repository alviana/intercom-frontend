import { Tooltip } from "../tooltip/tooltip";
import { WarningIcon } from "../../assets/icons/icon";

export const FirefoxWarning = ({
  type,
}: {
  type: "collapsable-header" | "firefox-warning";
}) => {
  return (
    <Tooltip
      tooltipText={
        <p>
          Se um novo dispositivo foi adicionado, o Firefox precisa que a
          permissão seja redefinida manualmente. Se o seu dispositivo não
          aparecer, remova a permissão e recarregue a página.
        </p>
      }
      type={type}
    >
      <WarningIcon />
    </Tooltip>
  );
};
