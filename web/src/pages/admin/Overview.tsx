// Visão geral para o admin calibrar custos e bônus: pilotos, PM do mês e aeronaves mais/menos compradas.
import { Link } from 'react-router-dom';
import { useOverview } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import type { OverviewAircraft } from '../../api/types';
import { AircraftIcon, iconOf, ROLE_LABEL } from '../../lib/aircraft';
import { fmtPoints } from '../../lib/format';
import { AdminTabs } from './AdminTabs';
import './admin.css';

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`kpi ${accent ? 'accent' : ''}`}>
      <span className="label">{label}</span>
      <strong>{value}</strong>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev) return <span className="muted">sem mês anterior para comparar</span>;
  const d = Math.round(((cur - prev) / prev) * 100);
  return <span className={d >= 0 ? 'pos' : 'neg'}>{d >= 0 ? '▲' : '▼'} {Math.abs(d)}% vs. mês anterior</span>;
}

function AircraftRow({ a, right }: { a: OverviewAircraft; right: React.ReactNode }) {
  return (
    <li style={{ '--c': `var(--role-${a.role})` } as React.CSSProperties}>
      <AircraftIcon icon={iconOf(a)} className="ov-ico" />
      <span className="ov-name">{a.name}<small className="muted"> · Tier {a.tierLabel} · {ROLE_LABEL[a.role]}</small></span>
      <span className="ov-right">{right}</span>
    </li>
  );
}

export function Overview() {
  const { data: o, isLoading, error } = useOverview();
  const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long' });
  const maxWeek = Math.max(1, ...(o?.weekly.map((w) => w.earned) ?? [0]));
  const maxOwners = Math.max(1, ...(o?.topAircraft.map((a) => a.owners ?? 0) ?? [0]));

  return (
    <>
      <div className="page-head">
        <div>
          <span className="label">Administração</span>
          <h1>Visão geral</h1>
          <p>Números para calibrar custos e bônus: quanto PM entra, quanto é gasto e o que os pilotos mais compram.</p>
        </div>
      </div>
      <AdminTabs />

      {isLoading && <div className="loading">CARREGANDO…</div>}
      {error && <div className="empty">{errorMessage(error)}</div>}

      {o && (
        <div className="ov">
          <section className="kpis">
            <Kpi accent label="Pilotos ativos" value={String(o.players.active)}
              sub={<>{o.players.recent} novos em 30 dias{o.players.pending ? ` · ${o.players.pending} sem nickname` : ''}{o.players.awaiting ? ` · ${o.players.awaiting} aguardando aprovação` : ''}{o.players.banned ? ` · ${o.players.banned} suspensos` : ''}</>} />
            <Kpi label={`PM distribuídos em ${monthName}`} value={fmtPoints(o.month.current.distributed)}
              sub={<Delta cur={o.month.current.distributed} prev={o.month.previous.distributed} />} />
            <Kpi label={`PM gastos em ${monthName}`} value={fmtPoints(o.month.current.spent)}
              sub={`${o.month.current.purchases} compra(s) no mês`} />
            <Kpi label="PM parados nas contas" value={fmtPoints(o.circulation.circulating)}
              sub={`média de ${fmtPoints(o.circulation.avg)} por piloto`} />
          </section>

          <div className="ov-grid">
            <section className="card pf-card">
              <h2 className="pf-h">PM distribuídos por semana</h2>
              <div className="ov-bars" aria-label="PM por semana, últimas 12 semanas">
                {o.weekly.map((w) => (
                  <div key={w.week} className="ov-bar" title={`${w.week}: ${fmtPoints(w.earned)} PM`}>
                    <i style={{ height: `${(w.earned / maxWeek) * 100}%` }} />
                    <small>{w.week.slice(8)}/{w.week.slice(5, 7)}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="card pf-card">
              <h2 className="pf-h">Compras por tier</h2>
              <table className="ov-tiers">
                <thead><tr><th>Tier</th><th className="num">Custo</th><th className="num">Aeronaves</th><th className="num">Compras</th><th className="num">PM gastos</th></tr></thead>
                <tbody>
                  {o.tiers.map((t) => (
                    <tr key={t.tier}>
                      <td><strong>{t.label}</strong></td>
                      <td className="num">{fmtPoints(t.cost)}</td>
                      <td className="num">{t.aircraft}</td>
                      <td className="num">{t.purchases}</td>
                      <td className="num">{fmtPoints(t.spent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted ov-note">Tier I é de graça para todos e não entra na conta.</p>
            </section>

            <section className="card pf-card">
              <h2 className="pf-h">Mais compradas</h2>
              {o.topAircraft.every((a) => !a.owners) && <p className="muted">Ninguém comprou aeronaves ainda.</p>}
              <ul className="ov-list">
                {o.topAircraft.filter((a) => a.owners).map((a) => (
                  <AircraftRow key={a.id} a={a} right={
                    <><span className="ov-meter"><i style={{ width: `${((a.owners ?? 0) / maxOwners) * 100}%` }} /></span><b>{a.owners}</b></>} />
                ))}
              </ul>
            </section>

            <section className="card pf-card">
              <div className="pf-h-row">
                <h2 className="pf-h">Nunca compradas</h2>
                <Link to="/admin/aeronaves" className="pf-link">Ajustar custos →</Link>
              </div>
              {o.neverBought.length === 0 && <p className="muted">Todas as aeronaves já foram compradas por alguém.</p>}
              <ul className="ov-list scroll">
                {o.neverBought.map((a) => <AircraftRow key={a.id} a={a} right={<span className="muted">{fmtPoints(a.cost)} PM</span>} />)}
              </ul>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
