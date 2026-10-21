// Perfil privado do piloto: resumo, progresso, próximos objetivos, frota, PM por semana e linha do tempo.
import { Link } from 'react-router-dom';
import { useAchievements, useMe, useProfile, useSetGoal, useTechTree } from '../api/hooks';
import { planPath } from '../lib/path';
import { errorMessage } from '../api/client';
import type { Achievement, Profile } from '../api/types';
import { AircraftIcon, iconOf, ROLE_LABEL } from '../lib/aircraft';
import { fmtDate, fmtPoints, fmtSigned, SOURCE_LABEL } from '../lib/format';
import { MedalPreview } from '../components/MedalPreview';
import { RibbonImage } from '../components/RibbonImage';
import '../components/ribbon-image.css';
import './profile.css';

export function ProfilePage() {
  const { data, isLoading, error } = useProfile();
  if (isLoading) return <div className="loading">CARREGANDO…</div>;
  if (error || !data) return <div className="empty">{errorMessage(error)}</div>;
  return <ProfileView p={data} />;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function ProfileView({ p }: { p: Profile }) {
  const { user, rank, totals, estimate } = p;
  const fleetPct = pct(totals.fleet, totals.aircraftTotal);

  return (
    <div className="pf">
      {/* ------------------------------------------------ cabeçalho */}
      <section className="pf-hero">
        <div className="pf-id">
          {user.avatarUrl
            ? <img className="pf-avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
            : <div className="pf-avatar pf-initial">{user.nickname.slice(0, 1)}</div>}
          <div>
            <span className="label">Piloto</span>
            <h1 className="pf-name">{user.nickname}</h1>
            <span className="muted pf-meta">
              No esquadrão desde {new Date(user.createdAt).toLocaleDateString('pt-BR')}
              {user.role === 'admin' && <> · <span className="badge info">admin</span></>}
            </span>
          </div>
        </div>
        <div className="pf-rank">
          <span className="label">Ranking</span>
          <div className="pf-rank-num">{rank.position ? `${rank.position}º` : '—'}</div>
          <span className="muted">de {rank.total} pilotos · por PM ganhos</span>
        </div>
        <div className="pf-fleetpct">
          <span className="label">Frota da árvore</span>
          <div className="pf-fleetpct-num">{fleetPct}<small>%</small></div>
          <div className="pf-bar"><i style={{ width: `${fleetPct}%` }} /></div>
        </div>
      </section>

      {/* ------------------------------------------------ números */}
      <section className="pf-stats">
        <Stat label="Saldo de PM" value={fmtPoints(totals.balance)} accent />
        <Stat label="PM ganhos" value={fmtPoints(totals.earned)} />
        <Stat label="PM gastos" value={fmtPoints(totals.spent)} />
        <Stat label="Frota" value={`${totals.fleet}`} suffix={`/ ${totals.aircraftTotal}`} />
        <Stat label="Seu PM médio por missão" value={estimate.perMission > 0 ? fmtPoints(estimate.perMission) : '—'} suffix={estimate.perMission > 0 ? 'PM' : undefined} />
      </section>

      <div className="pf-grid">
        <Medals />
        <GoalCard balance={totals.balance} perMission={estimate.perMission} />
        {/* ------------------------------------------------ progresso por tier */}
        <section className="pf-card">
          <h2 className="pf-h">Progresso por tier</h2>
          <div className="pf-bars">
            {p.byTier.map((t) => (
              <div key={t.tier} className="pf-bar-row">
                <span className="pf-bar-label">Tier {t.label}</span>
                <div className="pf-bar"><i style={{ width: `${pct(t.owned, t.total)}%` }} /></div>
                <span className="pf-bar-val">{t.owned}/{t.total}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ progresso por papel */}
        <section className="pf-card">
          <h2 className="pf-h">Por função</h2>
          <div className="pf-bars">
            {p.byRole.map((r) => (
              <div key={r.role} className="pf-bar-row" style={{ '--c': `var(--role-${r.role})` } as React.CSSProperties}>
                <span className="pf-bar-label"><i className="pf-dot" />{ROLE_LABEL[r.role]}</span>
                <div className="pf-bar role"><i style={{ width: `${pct(r.owned, r.total)}%` }} /></div>
                <span className="pf-bar-val">{r.owned}/{r.total}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ próximos objetivos */}
        <section className="pf-card">
          <div className="pf-h-row">
            <h2 className="pf-h">Próximos objetivos</h2>
            <Link to="/" className="pf-link">Abrir a árvore →</Link>
          </div>
          {p.nextGoals.length === 0 && <p className="muted">Nenhuma aeronave liberada para compra agora.</p>}
          <ul className="pf-goals">
            {p.nextGoals.map((g) => (
              <li key={g.id} style={{ color: `var(--role-${g.role})` }}>
                <AircraftIcon icon={iconOf(g)} className="pf-goal-icon" />
                <div className="pf-goal-text">
                  <strong>{g.name}</strong>
                  <span>Tier {g.tierLabel} · {fmtPoints(g.cost)} PM</span>
                </div>
                {g.missing === 0
                  ? <span className="badge ok">pode comprar</span>
                  : <span className="pf-missing">faltam <b>{fmtPoints(g.missing)}</b> PM{estimate.perMission > 0 && <small>~{Math.ceil(g.missing / estimate.perMission)} missões</small>}</span>}
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------ PM por semana */}
        <section className="pf-card">
          <h2 className="pf-h">PM ganhos por semana</h2>
          <WeeklyChart weekly={p.weekly} />
        </section>

        {/* ------------------------------------------------ condecorações */}
        {p.ribbons.length > 0 && <section className="pf-card pf-wide">
          <h2 className="pf-h">Condecorações <span className="muted">({p.ribbons.reduce((n, r) => n + r.count, 0)})</span></h2>
          <ul className="pf-ribbons">{p.ribbons.map((r) => <li key={r.id} title={r.description || r.name}>
            {r.hasImage ? <RibbonImage id={r.id} version={r.imageVersion} count={r.count} valor={r.valor} width={180} name={r.name} /> : null}
            <strong>{r.name}</strong><span className="muted">{r.count > 1 ? `${r.count} concessões` : '1 concessão'}{r.valor ? ' · com valor' : ''}</span>
          </li>)}</ul>
        </section>}

        {/* ------------------------------------------------ frota */}
        <section className="pf-card pf-wide">
          <h2 className="pf-h">Sua frota <span className="muted">({p.fleet.length})</span></h2>
          <div className="pf-fleet">
            {p.fleet.map((a) => (
              <div key={a.id} className="pf-ac" style={{ '--c': `var(--role-${a.role})` } as React.CSSProperties} title={ROLE_LABEL[a.role]}>
                <AircraftIcon icon={iconOf(a)} className="pf-ac-icon" />
                <span className="pf-ac-name">{a.name}</span>
                <span className="pf-ac-tier">{a.tierLabel}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ linha do tempo */}
        <section className="pf-card pf-wide">
          <h2 className="pf-h">Linha do tempo</h2>
          {p.timeline.length === 0 && <p className="muted">Nada por aqui ainda. Voe uma missão!</p>}
          <ol className="pf-timeline">
            {p.timeline.map((t) => (
              <li key={`${t.kind}-${t.id}`} className={`k-${t.source}`}>
                <span className="pf-tl-dot" />
                <span className="when">{fmtDate(t.createdAt)}</span>
                <span className="pf-tl-reason">{t.reason} <span className="muted">· {t.source === 'grant' ? 'admin' : SOURCE_LABEL[t.source]}</span></span>
                {t.amount !== 0 && <span className={`amt ${t.amount > 0 ? 'pos' : 'neg'}`}>{fmtSigned(t.amount)}</span>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, suffix, accent }: { label: string; value: string; suffix?: string; accent?: boolean }) {
  return (
    <div className={`pf-stat ${accent ? 'accent' : ''}`}>
      <span className="label">{label}</span>
      <span className="pf-stat-num">{value}{suffix && <small>{suffix}</small>}</span>
    </div>
  );
}

/** Barras simples em SVG: PM ganhos nas últimas 12 semanas */
function WeeklyChart({ weekly }: { weekly: Profile['weekly'] }) {
  const max = Math.max(...weekly.map((w) => w.earned), 1);
  const total = weekly.reduce((s, w) => s + w.earned, 0);
  const W = 520, H = 170, pad = 22, bw = (W - pad * 2) / weekly.length;
  return (
    <div className="pf-chart">
      <svg viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={`PM ganhos nas últimas ${weekly.length} semanas: ${fmtPoints(total)}`}>
        <line x1={pad} x2={W - pad} y1={H} y2={H} className="pf-axis" />
        {weekly.map((w, i) => {
          const h = (w.earned / max) * (H - 26);
          const x = pad + i * bw + bw * 0.18;
          const d = new Date(w.week + 'T12:00:00');
          return (
            <g key={w.week}>
              <rect x={x} y={H - h} width={bw * 0.64} height={Math.max(h, w.earned ? 2 : 0)} className="pf-col">
                <title>{`Semana de ${d.toLocaleDateString('pt-BR')}: ${fmtPoints(w.earned)} PM`}</title>
              </rect>
              {w.earned > 0 && <text x={x + bw * 0.32} y={H - h - 6} className="pf-col-val">{fmtPoints(w.earned)}</text>}
              {(i % 2 === weekly.length % 2 || i === weekly.length - 1) && (
                <text x={x + bw * 0.32} y={H + 16} className="pf-col-lbl">{d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</text>
              )}
            </g>
          );
        })}
      </svg>
      <span className="muted pf-chart-foot">{fmtPoints(total)} PM nas últimas {weekly.length} semanas</span>
    </div>
  );
}

/** Meta do piloto: progresso em PM e o caminho de compras até ela */
function GoalCard({ balance, perMission }: { balance: number; perMission: number }) {
  const { data: me } = useMe();
  const { data: tree } = useTechTree();
  const setGoal = useSetGoal();
  const goalId = me?.goalAircraftId ?? null;
  const goal = tree?.aircraft.find((a) => a.id === goalId) ?? null;

  if (!tree) return null;

  if (!goal) {
    return (
      <section className="pf-card pf-wide pf-goal empty">
        <div>
          <h2 className="pf-h">Sua meta</h2>
          <p className="muted">Escolha a aeronave que você quer conquistar: na árvore, abra o painel dela e clique na estrela ☆. O progresso aparece aqui.</p>
        </div>
        <Link to="/" className="btn">Escolher na árvore</Link>
      </section>
    );
  }

  const plan = goal.owned ? null : planPath(tree.aircraft, tree.tiers, goal.id);
  const cost = plan?.cost ?? 0;
  const progress = goal.owned ? 100 : cost ? Math.min(100, Math.round((balance / cost) * 100)) : 0;
  const missing = Math.max(0, cost - balance);

  return (
    <section className={`pf-card pf-wide pf-goal ${goal.owned ? 'done' : ''}`} style={{ '--c': `var(--role-${goal.role})` } as React.CSSProperties}>
      <div className="pf-goal-main">
        <AircraftIcon icon={iconOf(goal)} className="pf-goal-big" />
        <div className="pf-goal-info">
          <span className="label">Sua meta</span>
          <h2 className="pf-goal-name">{goal.name}</h2>
          <span className="muted">{ROLE_LABEL[goal.role]}</span>
        </div>
        <div className="pf-goal-progress">
          {goal.owned ? (
            <strong className="pf-goal-done">Meta conquistada! ★</strong>
          ) : (
            <>
              <div className="pf-goal-nums">
                <span><b>{fmtPoints(Math.min(balance, cost))}</b> / {fmtPoints(cost)} PM</span>
                <span className="pf-goal-pct">{progress}%</span>
              </div>
              <div className="pf-bar big"><i style={{ width: `${progress}%` }} /></div>
              <span className="muted pf-goal-sub">
                {plan?.steps.length} {plan?.steps.length === 1 ? 'compra' : 'compras'}
                {missing > 0 ? ` · faltam ${fmtPoints(missing)} PM${perMission > 0 ? ` · ~${Math.ceil(missing / perMission)} missões` : ''}` : ' · você já tem PM para tudo!'}
              </span>
            </>
          )}
        </div>
        <button className="btn ghost sm" onClick={() => setGoal.mutate(null)}>{goal.owned ? 'Escolher outra' : 'Remover meta'}</button>
      </div>
      {plan && plan.steps.length > 0 && (
        <ol className="pf-steps">
          {plan.steps.map((s, i) => (
            <li key={s.id} style={{ color: `var(--role-${s.role})` }} className={s.available ? 'next' : ''}>
              <span className="pf-step-n">{i + 1}</span>
              <AircraftIcon icon={iconOf(s)} className="pf-step-icon" />
              <span className="pf-step-name">{s.name}</span>
              <span className="pf-step-cost">{fmtPoints(s.cost)} PM</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- conquistas
const RARITY = { common: 'Comum', rare: 'Rara', legendary: 'Lendária' } as const;
function Medal({ a }: { a: Achievement }) {
  const done = !!a.earnedAt;
  const p = pct(a.current, a.target);
  return (
    <li className={`medal ${a.rarity} ${done ? 'done' : ''}`} title={a.desc}>
      <MedalPreview achievement={a} />
      <div className="medal-body">
        <strong>{a.name}</strong>
        <span className="medal-desc">{a.desc}</span>
        {done
          ? <span className="medal-when">{RARITY[a.rarity]} · conquistada em {fmtDate(a.earnedAt!)}</span>
          : (
            <>
              <div className="medal-bar"><i style={{ width: `${p}%` }} /></div>
              <span className="medal-when">{RARITY[a.rarity]} · {a.hint ?? `${a.current.toLocaleString('pt-BR')}/${a.target.toLocaleString('pt-BR')}`}</span>
            </>
          )}
      </div>
    </li>
  );
}

function Medals() {
  const { data } = useAchievements();
  if (!data) return null;
  return (
    <section className="pf-card pf-wide">
      <div className="pf-h-row">
        <h2 className="pf-h">Conquistas</h2>
        <span className="muted">{data.earned} de {data.total}</span>
      </div>
      <ul className="medals">{data.items.map((a) => <Medal key={a.key} a={a} />)}</ul>
    </section>
  );
}
