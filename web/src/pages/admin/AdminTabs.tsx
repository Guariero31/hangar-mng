import { NavLink } from 'react-router-dom';
import { useApprovals } from '../../api/hooks';
import { useOpenErrorCount } from '../../api/errors-hooks';
import './admin-tabs.css';

export function AdminTabs() {
  const { data } = useApprovals();
  const { data: errors } = useOpenErrorCount();
  return (
    <nav className="subnav admin-tabs" aria-label="Administração">
      <NavLink to="/admin/visao-geral">Visão geral</NavLink>
      <NavLink to="/admin/aprovacoes">Aprovações{data?.pending ? <span className="tab-badge">{data.pending}</span> : null}</NavLink>
      <NavLink to="/admin" end>Jogadores</NavLink>
      <NavLink to="/admin/aeronaves">Tech tree</NavLink>
      <NavLink to="/admin/missoes">Missões</NavLink>
      <NavLink to="/admin/pontuacao">Pontuação</NavLink>
      <NavLink to="/admin/atividade">Atividade</NavLink>
      <NavLink to="/admin/erros">Erros{errors?.open ? <span className="tab-badge">{errors.open}</span> : null}</NavLink>
    </nav>
  );
}
