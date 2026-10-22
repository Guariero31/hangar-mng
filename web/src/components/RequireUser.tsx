import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../api/hooks';
import { ApiError } from '../api/client';

export function Loading() {
  return <div className="full-center"><div className="loading">CARREGANDO…</div></div>;
}

/**
 * Protege uma rota:
 *  - sem sessão           → /login
 *  - conta suspensa       → /login?banned=1
 *  - sem nickname         → /nickname   (se needNickname)
 *  - não é admin          → /           (se admin)
 */
export function RequireUser({ children, needNickname = true, admin = false, needTutorial = true }: {
  children: ReactNode;
  needNickname?: boolean;
  admin?: boolean;
  needTutorial?: boolean;
}) {
  const { data: me, isLoading, error, refetch } = useMe();

  if (isLoading) return <Loading />;
  if (error) {
    if (error instanceof ApiError && (error.code === 'PENDING_APPROVAL' || error.code === 'REJECTED')) return <Navigate to="/pendente" replace />;
    if (error instanceof ApiError && error.code === 'BANNED') return <Navigate to="/login?banned=1" replace />;
    return (
      <div className="full-center">
        <div className="card error-box">
          <h2>Sem conexão</h2>
          <p className="muted">{error.message}</p>
          <button className="btn" onClick={() => refetch()}>Tentar de novo</button>
        </div>
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace />;
  if (needNickname && !me.nickname) return <Navigate to="/nickname" replace />;
  if (needTutorial && me.nickname && me.tutorialStatus === null) return <Navigate to="/boas-vindas" replace />;
  if (admin && me.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
