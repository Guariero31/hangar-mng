import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { useLogout } from '../api/hooks';
import { AuthLogo } from '../components/AuthLogo';
import { Loading } from '../components/RequireUser';
import './auth.css';

/** Tela do cadastro novo: espera um admin aprovar. Confere sozinha a cada 20 s. */
export function Pending() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const logout = useLogout();
  const { data, error, refetch, isFetching } = useQuery({
    queryKey: ['auth-status'],
    queryFn: () => api.get<{ status: string }>('/auth/status'),
    refetchInterval: 20_000,
    retry: false,
  });

  useEffect(() => {
    if (error instanceof ApiError && (error.status === 401 || error.code === 'BANNED')) navigate('/login', { replace: true });
    if (data?.status === 'active') {
      qc.invalidateQueries({ queryKey: ['me'] }).then(() => navigate('/', { replace: true }));
    }
  }, [data, error, navigate, qc]);

  if (!data) return <Loading />;
  const rejected = data.status === 'rejected';

  return (
    <main className="auth">
      <section className="auth-glass">
        <AuthLogo />
        <h1 className="auth-title">{rejected ? 'Cadastro não aprovado' : 'Aguardando aprovação'}</h1>
        <p className="auth-sub">
          {rejected
            ? 'Um administrador não aprovou este cadastro. Se foi engano, fale com o comando do esquadrão.'
            : 'Seu cadastro foi recebido. Assim que um administrador aprovar, você entra automaticamente. Esta página confere sozinha.'}
        </p>
        {!rejected && (
          <button className="auth-btn" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Verificando…' : 'Verificar agora'}
          </button>
        )}
        <p className="auth-foot">
          <a href="#" onClick={(e) => { e.preventDefault(); logout.mutate(undefined, { onSettled: () => navigate('/login') }); }}>
            sair / trocar conta
          </a>
        </p>
      </section>
    </main>
  );
}
