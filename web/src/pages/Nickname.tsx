import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { checkNickname, useLogout, useMe, useSetNickname } from '../api/hooks';
import { errorMessage } from '../api/client';
import { AuthLogo } from '../components/AuthLogo';
import './auth.css';

const RULE = /^[A-Za-z0-9_]{3,16}$/;
type Check = { state: 'idle' | 'checking' | 'ok' | 'err'; text: string };
const IDLE: Check = { state: 'idle', text: 'De 3 a 16 caracteres: letras, números ou _' };

export function Nickname() {
  const { data: me } = useMe();
  const save = useSetNickname();
  const logout = useLogout();
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [check, setCheck] = useState<Check>(IDLE);

  // checa a disponibilidade enquanto o jogador digita
  useEffect(() => {
    const nick = value.trim();
    if (!nick) return setCheck(IDLE);
    if (!RULE.test(nick)) return setCheck({ state: 'err', text: 'Use de 3 a 16 caracteres: letras, números ou _' });
    setCheck({ state: 'checking', text: 'Verificando…' });
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { available } = await checkNickname(nick);
        if (!cancelled) setCheck(available
          ? { state: 'ok', text: 'Disponível' }
          : { state: 'err', text: 'Esse nickname já está em uso ou é reservado' });
      } catch (e) {
        if (!cancelled) setCheck({ state: 'err', text: errorMessage(e) });
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value]);

  if (!me) return null;
  if (me.nickname) return <Navigate to={me.tutorialStatus === null ? '/boas-vindas' : '/'} replace />;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate(value.trim(), {
      onSuccess: () => navigate('/boas-vindas', { replace: true }),
      onError: (err) => setCheck({ state: 'err', text: errorMessage(err) }),
    });
  }

  return (
    <main className="auth">
      <form className="auth-glass" onSubmit={submit} noValidate>
        <AuthLogo />
        <h1 className="auth-title">Escolha seu nickname</h1>
        <p className="auth-sub">
          É o nome que aparece no ranking. Use o mesmo do servidor DCS. Ele não pode ser trocado depois.
        </p>

        <label className="auth-field">
          <span className="auth-label">Nickname<span className="req">*</span></span>
          <input id="nick" className="auth-input big" maxLength={16} autoComplete="off" spellCheck={false}
            placeholder="Viper_01" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          <span id="hint" className={`auth-hint ${check.state === 'ok' ? 'ok' : check.state === 'err' ? 'err' : ''}`}>{check.text}</span>
        </label>

        <button id="submit" className="auth-btn" disabled={check.state !== 'ok' || save.isPending}>
          {save.isPending ? 'Salvando…' : 'Confirmar'}
        </button>

        <p className="auth-foot">
          Logado como <span className="mono">{me.email}</span> ·{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); logout.mutate(undefined, { onSettled: () => navigate('/login') }); }}>
            trocar conta
          </a>
        </p>
      </form>
    </main>
  );
}
