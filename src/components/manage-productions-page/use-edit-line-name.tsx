import { API, TBasicProductionResponse } from "../../api/api";
import { useRequest } from "../../hooks/use-request";

type EditLineNameParams = {
  productionId: string;
  lineId: string;
  name: string;
};

export const useEditLineName = (params: EditLineNameParams | null) => {
  return useRequest<EditLineNameParams, TBasicProductionResponse>({
    params,
    apiCall: API.updateLineName,
    errorMessage: (p) => `Falha ao editar o nome da linha: ${p.name}`,
  });
};
