import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '../lib/report-error';

/** Se uma tela quebrar, mostra um aviso em vez de tela branca e registra o erro no painel de admin. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(error.message, `${error.stack ?? ''}\n${info.componentStack ?? ''}`);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 80 }}>
        <span className="label">Algo deu errado</span>
        <h1>Esta tela não carregou</h1>
        <p className="muted">O erro foi registrado para os administradores. Tente recarregar a página.</p>
        <button className="btn" onClick={() => window.location.reload()}>Recarregar</button>
      </div>
    );
  }
}
