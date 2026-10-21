import { Component, ReactNode } from "react";
import logger from "../utils/logger";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.red(`Uncaught error: ${error.message}`);
    if (info.componentStack) {
      logger.red(`Component stack: ${info.componentStack}`);
    }
  }

  render() {
    const { hasError } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "4rem 2rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "2.4rem", marginBottom: "1rem" }}>
            Algo deu errado
          </h1>
          <p
            style={{
              fontSize: "1.6rem",
              color: "#9aa3ab",
              marginBottom: "2rem",
            }}
          >
            Ocorreu um erro inesperado. Recarregue a página.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "1rem 2rem",
              fontSize: "1.4rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#59cbe8",
              color: "#1a1a1a",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Recarregar página
          </button>
        </div>
      );
    }

    return children;
  }
}
