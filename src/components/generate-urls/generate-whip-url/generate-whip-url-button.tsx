import { useCallback } from "react";
import { isMobile } from "../../../bowser";
import { GenerateUrlButton } from "../generate-url-button";
import { GenerateWhipUrlModal } from "./generate-whip-url-modal";

export const GenerateWhipUrlButton = ({
  isMinified,
  productionId,
  lineId,
}: {
  isMinified?: boolean;
  productionId: string;
  lineId: string;
}) => {
  const renderButtonLabel = () => {
    if (isMinified) {
      if (isMobile) {
        return "Entrada";
      }
      return "Entrada (WHIP)";
    }
    return "Link de entrada de áudio (WHIP)";
  };

  const renderModalContent = useCallback(
    (onClose: () => void) => (
      <GenerateWhipUrlModal
        productionId={productionId}
        lineId={lineId}
        onClose={onClose}
      />
    ),
    [productionId, lineId]
  );

  return (
    <GenerateUrlButton
      isMinified={isMinified}
      label={renderButtonLabel()}
      modalContent={renderModalContent}
    />
  );
};
