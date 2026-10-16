import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApprovals, useLogout, useMe } from '../api/hooks';
import { fmtPoints, SITE_NAME } from '../lib/format';
import { MedalStrip } from './MedalStrip';
import { NewsBell } from './NewsBell';

export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true" />;
}

/** Barra superior + conteúdo das páginas internas */
export function Layout() {
  const { data: me } = useMe();
  const { data: approvals } = useApprovals(me?.role === 'admin');
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!me) return null;

  return (
    <>
      <header className="topbar">
        <Link className="brand" to="/"><img className="brand-logo" src="/mng-logo-128.png" alt="" /><span>{SITE_NAME}</span></Link>
        <nav className="nav">
          <NavLink to="/" end><span className="nav-long">Árvore de aeronaves</span><span className="nav-short">Árvore</span></NavLink>
          <NavLink to="/perfil"><span className="nav-long">Meu perfil</span><span className="nav-short">Perfil</span></NavLink>
          <NavLink to="/ranking">Ranking</NavLink>
          {me.role === 'admin' && <NavLink to="/admin"><span className="nav-long">Painel admin</span><span className="nav-short">Admin</span>{approvals?.pending ? <span className="tab-badge">{approvals.pending}</span> : null}</NavLink>}
        </nav>
        <div className="pilot">
          <NewsBell />
          <span className="chip points" title="Seus Pontos de Missão">
            <span className="chip-label">PM</span><span id="my-balance">{fmtPoints(me.balance)}</span>
          </span>
          {me.avatarUrl && <img className="avatar" src={me.avatarUrl} alt="" referrerPolicy="no-referrer" />}
          <span className="callsign-wrap">
            <MedalStrip medals={me.medals ?? []} size={18} />
            <Link className="callsign" to="/perfil" title="Meu perfil">{me.nickname}</Link>
          </span>
          <button
            className="btn ghost sm"
            id="logout"
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })}
          >
            Sair
          </button>
        </div>
      </header>
      <main className={`page ${pathname === '/' || pathname === '/admin' ? 'wide' : ''}`}>
        <Outlet />
      </main>
    </>
  );
}
