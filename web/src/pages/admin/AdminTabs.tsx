import { NavLink } from 'react-router-dom';
import { useApprovals } from '../../api/hooks';

export function AdminTabs() {
  const { data } = useApprovals();
  return (
    <nav className="subnav">
      <NavLink to="/admin/visao-geral">Visão geral</NavLink>
      <NavLink to="/admin/aprovacoes">Aprovações{data?.pending ? <span className="tab-badge">{data.pending}</span> : null}</NavLink>
      <NavLink to="/admin" end>Jogadores</NavLink>
      <NavLink to="/admin/aeronaves">Tech tree</NavLink>
      <NavLink to="/admin/atividade">Atividade</NavLink>
    </nav>
  );
}
