// Histórico de auditoria: tudo o que os admins fizeram (PM, aeronaves, contas, tech tree, configurações).
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
  { key: 'missions', label: 'Missões' },
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
  update_scoring_rules: { label: 'Pontuação', tone: 'info' },
  create_mission: { label: 'Nova missão', tone: 'info' },
  update_mission: { label: 'Missão editada', tone: 'info' },
  cancel_mission: { label: 'Missão cancelada', tone: 'danger' },
  close_mission: { label: 'Missão encerrada', tone: 'ok' },
  save_mission_report: { label: 'Rascunho de relatório', tone: 'info' },
  publish_mission_report: { label: 'Relatório publicado', tone: 'ok' },
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
    case 'update_scoring_rules': return 'Atualizou os pontos por alvo, objetivos e bônus de sobrevivência';
    case 'create_mission': return `Criou a missão ${d.title}${(d.copies ?? 1) > 1 ? ` (${d.copies} semanas)` : ''}`;
    case 'update_mission': return `Editou a missão ${d.title}`;
    case 'cancel_mission': return `Cancelou a missão ${d.title}`;
    case 'close_mission': return `Encerrou ${d.title}: ${d.pilots} pilotos, ${fmtPoints(d.totalPm ?? 0)} PM`;
    case 'save_mission_report': return `Salvou o relatório de ${d.title} como rascunho`;
    case 'publish_mission_report': return `Publicou o relatório de ${d.title}: ${d.pilots} pilotos, ${fmtPoints(d.totalPm ?? 0)} PM`;
    default: return it.action;
  }
}

const nameOf = (n: string | null, email: string | null) => n ?? email ?? '—';
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function Activity() {
  const [group, setGroup] = useState('');
  const [limit, setLimit] = useState(50);
  const { data, isLoading, error } = useActivity(group, limit);

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
                onClick={() => { setGroup(g.key); setLimit(50); }}>{g.label}</button>
            ))}
          </div>
          <span className="label count">{data ? `${data.items.length} de ${data.total} registros` : ''}</span>
        </div>
        <div className="table-wrap table-scroll" style={{ ["--row-h" as string]: "53px" }}>
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
        {data && data.items.length < data.total && (
          <div className="more"><button className="btn ghost" onClick={() => setLimit(limit + 50)}>Carregar mais</button></div>
        )}
      </section>
    </>
  );
}
