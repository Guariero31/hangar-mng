import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import { useAuthConfig, useMe } from '../api/hooks';
import type { Me } from '../api/types';
import { AuthLogo } from '../components/AuthLogo';
import { Loading } from '../components/RequireUser';
import './auth.css';

export function Login() {
  const [params] = useSearchParams();
  const { data: me, isLoading } = useMe();
  const { data: cfg, error: cfgError } = useAuthConfig();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState(params.has('banned') ? 'Sua conta está suspensa. Fale com um administrador.' : '');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('admin@dev.local');
  const [asAdmin, setAsAdmin] = useState(true);

  if (isLoading) return <Loading />;
  if (me) return <Navigate to={me.nickname ? '/' : '/nickname'} replace />;

  async function finish(request: Promise<Me>) {
    setBusy(true);
    setError('');
    try {
      const user = await request;
      if (user.status === 'pending') { navigate('/pendente', { replace: true }); return; }
      qc.setQueryData(['me'], user);
      navigate(user.nickname ? '/' : '/nickname', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function devSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) finish(api.post<Me>('/auth/dev', { email: email.trim(), admin: asAdmin }));
  }

  return (
    <main className="auth">
      <section className="auth-glass">
        <AuthLogo />
        <h1 className="auth-title">Faça login</h1>
        <p className="auth-sub">Acesse sua pontuação e a árvore de aeronaves.</p>

        {(error || cfgError) && <div className="auth-alert" role="alert">{error || errorMessage(cfgError)}</div>}

        {cfg?.googleClientId && (
          <GoogleOAuthProvider clientId={cfg.googleClientId}>
            <div className="auth-google">
              <GoogleLogin
                onSuccess={(r) => r.credential && finish(api.post<Me>('/auth/google', { credential: r.credential }))}
                onError={() => setError('O login com Google falhou. Se você é o administrador: confira se este endereço (' + window.location.origin + ') está em "Origens JavaScript autorizadas" no Google Cloud.')}
                theme="filled_black"
                size="large"
                shape="rectangular"
                text="signin_with"
                width="340"
                locale="pt-BR"
              />
            </div>
          </GoogleOAuthProvider>
        )}

        {cfg?.devLogin && (
          <form onSubmit={devSubmit} noValidate>
            {cfg.googleClientId
              ? <div className="auth-divider">ou modo desenvolvimento</div>
              : <span className="auth-dev-tag" title="O login com Google ainda não foi configurado">Modo desenvolvimento</span>}

            <label className="auth-field">
              <span className="auth-label">E-mail<span className="req">*</span></span>
              <input
                className="auth-input"
                type="email"
                autoComplete="email"
                placeholder="voce@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="auth-check">
              <input type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} />
              Entrar como administrador
            </label>

            <button className="auth-btn" id="dev-login" disabled={busy || !email.trim()}>
              {busy ? 'Entrando…' : 'Login'}
            </button>
          </form>
        )}

        <p className="auth-foot">No primeiro acesso você escolhe o nickname usado no servidor.</p>
      </section>
    </main>
  );
}
