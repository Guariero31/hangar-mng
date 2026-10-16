// Histórico de auditoria: tudo o que os admins fizeram (PM, aeronaves, contas, tech tree, configurações).
import { Pagination } from '../../components/Pagination';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useActivity } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import type { ActivityItem } from '../../api/types';
import { fmtPoints } from '../../lib/format';
import { AdminTabs } from './AdminTabs';
import './admin.css';

const GROUPS = [
  { key: '', label: 'Tudo' },
  { key: 'players', label: 'Jogadores' },
  { key: 'tree', label: 'Tech tree' },
  { key: 'settings', label: 'Configurações' },
];

const KIND: Record<string, { label: string; tone: string }> = {
  add_points: { label: 'PM', tone: 'ok' },
  grant_aircraft: { label: 'Aeronave liberada', tone: 'ok' },
  revoke_aircraft: { label: 'Aeronave removida', tone: 'danger' },
  set_status: { label: 'Conta', tone: 'danger' },
  set_role: { label: 'Permissão', tone: 'info' },
  approve_user: { label: 'Cadastro aprovado', tone: 'ok' },
  reject_user: { label: 'Cadastro recusado', tone: 'danger' },
  delete_user: { label: 'Conta excluída', tone: 'danger' },
  rename_player: { label: 'Nickname', tone: 'info' },
  create_aircraft: { label: 'Nova aeronave', tone: 'info' },
  update_aircraft: { label: 'Aeronave editada', tone: 'info' },
  create_tier: { label: 'Novo tier', tone: 'info' },
  update_tier: { label: 'Tier editado', tone: 'info' },
  update_settings: { label: 'Configuração', tone: 'info' },
};

function describe(it: ActivityItem): string {
  const d = it.details;
  switch (it.action) {
    case 'add_points': return `${(d.amount ?? 0) > 0 ? 'Lançou' : 'Retirou'} ${fmtPoints(Math.abs(d.amount ?? 0))} PM — ${d.reason}${d.batch ? ` (lote de ${d.batch})` : ''}`;
    case 'grant_aircraft': return `Liberou ${d.aircraftName ?? d.aircraft}`;
    case 'revoke_aircraft': return `Removeu ${d.aircraftName ?? d.aircraft}${d.refund ? ' e devolveu os PM' : ' sem devolver PM'}`;
    case 'set_status': return d.status === 'banned' ? 'Suspendeu a conta' : 'Reativou a conta';
    case 'rename_player': return `Renomeou ${d.from ?? '(sem nickname)'} para ${d.to}`;
    case 'approve_user': return `Aprovou o cadastro de ${d.email ?? 'um jogador'}`;
    case 'delete_user': return `Excluiu a conta de ${d.nickname ?? d.email ?? 'um jogador'}`;
    case 'reject_user': return `Recusou o cadastro de ${d.email ?? 'um jogador'}`;
    case 'set_role': return d.role === 'admin' ? 'Tornou administrador' : 'Removeu o acesso de administrador';
    case 'create_aircraft': return `Criou ${d.aircraftName ?? d.name}`;
    case 'update_aircraft': return `Editou ${d.aircraftName ?? d.name ?? d.id}${d.active === false ? ' (desativada)' : ''}`;
    case 'create_tier': return `Criou o tier ${d.label ?? d.tier} (${fmtPoints(d.cost ?? 0)} PM)`;
    case 'update_tier': return `Editou o tier ${d.label ?? d.tier}: custo ${fmtPoints(d.cost ?? 0)} PM, bônus ${d.multiplier ?? ''}x`;
    case 'update_settings': return `PM base por missão: ${fmtPoints(d.baseMissionPoints ?? 0)}`;
    default: return it.action;
  }
}

const nameOf = (n: string | null, email: string | null) => n ?? email ?? '—';
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function Activity() {
  const [group, setGroup] = useState('');
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isFetching, error } = useActivity(group, 50, offset);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="label">Administração</span>
          <h1>Atividade</h1>
          <p>Registro de tudo o que os administradores fizeram, com data, autor e jogador afetado.</p>
        </div>
      </div>
      <AdminTabs />

      <section className="card">
        <div className="toolbar">
          <div className="seg" role="tablist">
            {GROUPS.map((g) => (
              <button key={g.key} type="button" className={group === g.key ? 'on' : ''}
                onClick={() => { setGroup(g.key); setOffset(0); }}>{g.label}</button>
            ))}
          </div>
          <span className="label count">{data ? `${data.items.length} de ${data.total} registros` : ''}</span>
        </div>
        <div className="table-wrap">
          <table className="players act">
            <thead><tr><th>Quando</th><th>Admin</th><th>Tipo</th><th>O que foi feito</th><th>Jogador</th></tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="loading">CARREGANDO…</td></tr>}
              {error && <tr><td colSpan={5} className="empty">{errorMessage(error)}</td></tr>}
              {data && !data.items.length && <tr><td colSpan={5} className="empty">Nenhuma ação registrada ainda.</td></tr>}
              {data?.items.map((it) => {
                const k = KIND[it.action] ?? { label: it.action, tone: '' };
                return (
                  <tr key={it.id}>
                    <td className="muted mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{when(it.createdAt)}</td>
                    <td><strong className="mono">{nameOf(it.adminNickname, it.adminEmail)}</strong></td>
                    <td><span className={`badge ${k.tone}`}>{k.label}</span></td>
                    <td>{describe(it)}</td>
                    <td>{it.targetId
                      ? <Link to={`/admin?p=${it.targetId}`} className="mono">{nameOf(it.targetNickname, it.targetEmail)}</Link>
                      : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination offset={offset} total={data?.total ?? 0} busy={isFetching} onChange={setOffset} />
      </section>
    </>
  );
}
