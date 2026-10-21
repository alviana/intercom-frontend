import { API } from "../../api/api";
import { useRequest } from "../../hooks/use-request";

export const useDeleteProduction = (id: string | null) => {
  return useRequest<string, string>({
    params: id,
    apiCall: API.deleteProduction,
    errorMessage: () => "Falha ao excluir a produção",
  });
};
