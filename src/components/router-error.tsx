import { useRouteError } from "react-router";
import logger from "../utils/logger";

export const ErrorPage = () => {
  const error = useRouteError();
  logger.red(`Error: ${error}`);

  if (error instanceof Error) {
    return (
      <div id="error-page">
        <h1>Ops!</h1>
        <p>Desculpe, ocorreu um erro inesperado.</p>
        <p>
          <i>{error.message || "Ocorreu um erro inesperado"}</i>
        </p>
      </div>
    );
  }
  return (
    <div>
      <h1>Ops!</h1>
      <p>Ocorreu um erro inesperado.</p>
    </div>
  );
};
