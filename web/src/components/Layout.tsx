import { ThemeToggle } from './ThemeToggle';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApprovals, useLogout, useMe } from '../api/hooks';
import { fmtPoints, SITE_NAME } from '../lib/format';
import { NewsBell } from './NewsBell';
import './navigation.css';

function NavIcon({ type }: { type: 'aircraft' | 'profile' | 'missions' | 'ranking' | 'admin' | 'logout' }) {
  const paths = {
    aircraft: 'm21 3-6 18-4-8-8-4 18-6ZM11 13 21 3',
    profile: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    missions: 'M8 3H5a2 2 0 0 0-2 2v15a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V5a2 2 0 0 0-2-2h-3M8 2h8v4H8V2ZM7 11h10M7 16h6',
    ranking: 'M8 21h8M12 17v4M7 3h10v7a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4',
    admin: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-3 9 2 2 4-4',
    logout: 'M9 4H4v16h5M13 7l5 5-5 5M8 12h13',
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={paths[type]} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

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
      <header className="topbar mng-topbar">
        <Link className="brand" to="/" aria-label={`${SITE_NAME} — início`}><img className="brand-logo" src="/mng-logo-128.png" alt="" /><span className="brand-copy"><strong>{SITE_NAME}</strong><span>Esquadrão virtual</span></span></Link>
        <nav className="nav" aria-label="Navegação principal">
          <NavLink to="/" end><NavIcon type="aircraft" /><span className="nav-long">Aeronaves</span><span className="nav-short">Frota</span></NavLink>
          <NavLink to="/perfil"><NavIcon type="profile" /><span className="nav-long">Meu perfil</span><span className="nav-short">Perfil</span></NavLink>
          <NavLink to="/missoes"><NavIcon type="missions" /><span>Missões</span></NavLink>
          <NavLink to="/ranking"><NavIcon type="ranking" /><span>Ranking</span></NavLink>
          {me.role === 'admin' && <NavLink to="/admin"><NavIcon type="admin" /><span className="nav-long">Administração</span><span className="nav-short">Admin</span>{approvals?.pending ? <span className="tab-badge">{approvals.pending}</span> : null}</NavLink>}
        </nav>
        <div className="pilot">
          <ThemeToggle />
          <NewsBell />
          <Link className="btn ghost sm" to="/ajuda" aria-label="Ajuda: rever tutorial">Ajuda</Link>
          <span className="chip points" title="Seus Pontos de Missão">
            <span className="chip-label">PM</span><span id="my-balance">{fmtPoints(me.balance)}</span>
          </span>
          <Link className="pilot-profile" to="/perfil" title="Meu perfil" aria-label={`Meu perfil: ${me.nickname}`}>
            {me.avatarUrl ? <img className="avatar" src={me.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span className="pilot-initial" aria-hidden="true">{me.nickname?.slice(0, 1).toUpperCase()}</span>}
            <span className="pilot-profile-copy"><strong>{me.nickname}</strong><span>{me.role === 'admin' ? 'Administrador' : 'Piloto MNG'}</span></span>
          </Link>
          <button
            className="btn ghost sm"
            id="logout"
            aria-label="Sair da conta"
            title="Sair da conta"
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })}
          >
            <NavIcon type="logout" /><span>Sair</span>
          </button>
        </div>
      </header>
      <main className={`page ${pathname === '/' ? 'wide' : ''}`}>
        <Outlet />
      </main>
    </>
  );
}
