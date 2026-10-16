// =====================================================================
//  TECH TREE DCS
//  Porte em React da tela original (tech-tree-dcs.html), agora ligada
//  aos dados reais: saldo, frota e compras vêm do servidor.
// =====================================================================
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMe, useSetGoal, useTechTree, useUndoUnlock, useUnlock } from '../api/hooks';
import { planPath, type PathPlan } from '../lib/path';
import { errorMessage } from '../api/client';
import type { TechTreeState, TreeAircraft } from '../api/types';
import { useToast } from '../components/Toast';
import { AircraftIcon, fmtMult, iconOf, ROLE_LABEL } from '../lib/aircraft';
import { fmtPoints } from '../lib/format';
import './techtree.css';

// Medidas do desenho (px)
const TILE = 76, CHIP = 22, CW = 250, G = 56, HEAD = 50, PAD = 30, RH = 110, BGAP = 36;

export function TechTree() {
  const { data, isLoading, error } = useTechTree();
  if (isLoading) return <div className="loading">CARREGANDO…</div>;
  if (error || !data) return <div className="empty">{errorMessage(error)}</div>;
  if (!data.aircraft.length) return <div className="empty">Nenhuma aeronave cadastrada ainda.</div>;
  return (
    <>
      <TechTreeView state={data} />
    </>
  );
}

function TechTreeView({ state }: { state: TechTreeState }) {
  const { tiers, bands, aircraft, balance, baseMissionPoints } = state;
  const unlock = useUnlock();
  const undo = useUndoUnlock();
  const setGoal = useSetGoal();
  const { data: me } = useMe();
  const goalId = me?.goalAircraftId ?? null;
  const toast = useToast();

  // ------------------------------------------------------------ dados derivados
  const byId = useMemo(() => Object.fromEntries(aircraft.map((a) => [a.id, a])), [aircraft]);
  const tierIdx = useMemo(() => new Map(tiers.map((t, i) => [t.tier, i])), [tiers]);
  const tierOf = useCallback((a: TreeAircraft) => tiers[tierIdx.get(a.tier) ?? 0], [tiers, tierIdx]);
  const fleet = aircraft.filter((a) => a.owned);

  // estimativa de ganho voando a aeronave da frota com o maior bônus
  const bestMult = fleet.reduce((m, a) => Math.max(m, tierOf(a).multiplier), 1);
  const gain = baseMissionPoints * bestMult;

  // ------------------------------------------------------------ layout
  const L = useMemo(() => {
    const rows = [...new Set(aircraft.map((a) => a.row))].sort((x, y) => x - y);
    const bandIdx = (r: number) => Math.max(0, bands.filter((b) => b.rowStart <= r).length - 1);
    const rowY = (r: number) => HEAD + PAD + rows.indexOf(r) * RH + bandIdx(r) * BGAP;
    const pos = (a: TreeAircraft) => ({ x: G + (tierIdx.get(a.tier) ?? 0) * CW + (CW - TILE) / 2, y: rowY(a.row) });
    const W = G + tiers.length * CW + 20;
    const H = rowY(rows[rows.length - 1]) + TILE + CHIP + PAD;

    const bandBoxes = bands.flatMap((b) => {
      const inside = rows.filter((r) => r >= b.rowStart && r <= b.rowEnd);
      if (!inside.length) return [];
      const y = rowY(inside[0]) - 18;
      return [{ ...b, y, h: rowY(inside[inside.length - 1]) + TILE + CHIP + 14 - y }];
    });

    // manchas de fundo (pseudoaleatórias, sempre iguais)
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const patches = Array.from({ length: 28 }, () => {
      const x = rnd() * W, y = HEAD + rnd() * (H - HEAD), w = 120 + rnd() * 340, h = 80 + rnd() * 280, o = 0.18 + rnd() * 0.3;
      return { x, y, w, h, bg: rnd() > 0.5 ? `rgba(0,0,0,${o.toFixed(2)})` : `rgba(70,52,14,${(o / 2.6).toFixed(2)})` };
    });
    return { pos, W, H, bandBoxes, patches };
  }, [aircraft, bands, tiers, tierIdx]);

  const edges = useMemo(() => {
    const P = (p: TreeAircraft, a: TreeAircraft) => {
      const pp = L.pos(p), pa = L.pos(a);
      if (p.tier === a.tier) return `M${pa.x + TILE / 2} ${pp.y + TILE + CHIP}V${pa.y}`;
      const x1 = pp.x + TILE, y1 = pp.y + TILE / 2, x2 = pa.x, y2 = pa.y + TILE / 2, m = x2 - 30;
      return `M${x1} ${y1}H${m}V${y2}H${x2}`;
    };
    const out: { key: string; to: string; from: string; cls: string; d: string }[] = [];
    for (const a of aircraft) {
      for (const pid of a.parents) {
        const p = byId[pid];
        if (p && !a.bound.includes(pid)) out.push({ key: `s-${pid}-${a.id}`, to: a.id, from: pid, cls: `e soft${p.owned && a.owned ? ' lit' : ''}`, d: P(p, a) });
      }
    }
    for (const a of aircraft) {
      for (const pid of a.bound) {
        const p = byId[pid];
        if (p) out.push({ key: `b-${pid}-${a.id}`, to: a.id, from: pid, cls: `e bound${p.owned ? ' met' : ''}`, d: P(p, a) });
      }
    }
    return out;
  }, [aircraft, byId, L]);

  // ------------------------------------------------------------ painel de detalhes
  const [tipId, setTipId] = useState<string | null>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const tipRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number>();
  const touchMode = useRef(false); // último toque foi com o dedo: o painel só fecha tocando fora

  const showTip = (id: string) => { window.clearTimeout(hideTimer.current); setTipId(id); };
  const hideNow = useCallback(() => { window.clearTimeout(hideTimer.current); setTipId(null); }, []);
  const hideSoon = () => { if (touchMode.current) return; window.clearTimeout(hideTimer.current); hideTimer.current = window.setTimeout(hideNow, 180); };

  useLayoutEffect(() => {
    if (!tipId || !tipRef.current) return;
    const tile = stageRef.current?.querySelector(`.node[data-id="${CSS.escape(tipId)}"] .tile`);
    if (!tile) return;
    const r = tile.getBoundingClientRect();
    const w = tipRef.current.offsetWidth, h = tipRef.current.offsetHeight;
    const x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
    let y = r.bottom + 8;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 8);
    setTipPos({ x, y });
  }, [tipId, state]);

  useEffect(() => {
    const onClick = (e: PointerEvent) => {
      touchMode.current = e.pointerType !== 'mouse';
      if (!(e.target as Element).closest?.('.tt .node, .tt .tip')) hideNow();
    };
    document.addEventListener('pointerdown', onClick);
    window.addEventListener('scroll', hideNow, { passive: true });
    return () => { document.removeEventListener('pointerdown', onClick); window.removeEventListener('scroll', hideNow); };
  }, [hideNow]);

  // ------------------------------------------------------------ zoom e arraste
  const chartRef = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState(1);
  const zRef = useRef(z);
  /** enquanto o jogador não mexe no zoom, a árvore acompanha a largura da tela */
  const autoFit = useRef(true);
  const anchor = useRef<{ ox: number; oy: number; cx: number; cy: number } | null>(null);

  const setZoom = useCallback((nz: number, cx?: number, cy?: number) => {
    const ch = chartRef.current;
    if (!ch) return;
    cx ??= ch.clientWidth / 2;
    cy ??= ch.clientHeight / 2;
    anchor.current = { ox: (ch.scrollLeft + cx) / zRef.current, oy: (ch.scrollTop + cy) / zRef.current, cx, cy };
    const next = Math.min(1.6, Math.max(0.35, Math.round(nz * 100) / 100));
    autoFit.current = false;
    zRef.current = next;
    setZ(next);
    hideNow();
  }, [hideNow]);

  useLayoutEffect(() => {
    const ch = chartRef.current, a = anchor.current;
    if (!ch || !a) return;
    ch.scrollLeft = a.ox * z - a.cx;
    ch.scrollTop = a.oy * z - a.cy;
    anchor.current = null;
  }, [z]);

  useEffect(() => {
    const ch = chartRef.current;
    if (!ch) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = ch.getBoundingClientRect();
      setZoom(zRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
    };
    ch.addEventListener('wheel', onWheel, { passive: false });
    return () => ch.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || (e.target as Element).closest('.node')) return;
    const ch = e.currentTarget;
    drag.current = { x: e.clientX, y: e.clientY, l: ch.scrollLeft, t: ch.scrollTop };
    setGrabbing(true);
    ch.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    e.currentTarget.scrollLeft = d.l - (e.clientX - d.x);
    e.currentTarget.scrollTop = d.t - (e.clientY - d.y);
  };
  const endDrag = () => { drag.current = null; setGrabbing(false); };

  /** Enquadra a árvore na largura da tela (em telas pequenas, mantém um tamanho legível) */
  const fit = useCallback(() => {
    const ch = chartRef.current;
    if (!ch) return;
    const w = ch.clientWidth;
    const nz = w < 700 ? 0.6 : w / L.W;
    autoFit.current = true;
    anchor.current = null;
    zRef.current = Math.min(1.3, Math.max(0.35, Math.floor(nz * 100) / 100));
    setZ(zRef.current);
    ch.scrollLeft = 0;
    ch.scrollTop = 0;
    hideNow();
  }, [L.W, hideNow]);

  useLayoutEffect(() => { fit(); }, [fit]);

  useEffect(() => {
    const ch = chartRef.current;
    if (!ch) return;
    const ro = new ResizeObserver(() => { if (autoFit.current) fit(); });
    ro.observe(ch);
    return () => ro.disconnect();
  }, [fit]);

  // ------------------------------------------------------------ compra
  const [unlockedId, setUnlockedId] = useState<string | null>(null);

  useEffect(() => {
    if (!unlockedId) return;
    const timeout = window.setTimeout(() => setUnlockedId(null), 1400);
    return () => window.clearTimeout(timeout);
  }, [unlockedId]);

  function buy(a: TreeAircraft) {
    unlock.mutate(a.id, {
      onSuccess: (r) => {
        setUnlockedId(a.id);
        r.achievements?.forEach((m, i) => setTimeout(() => toast(`Conquista: ${m.name}`, 'ok', { duration: 5000, medal: m }), 600 + i * 5200));
        toast(`${a.name} adicionada à frota · ${fmtPoints(a.cost)} PM`, 'ok', {
        duration: Math.max(3000, (r.undoSeconds - 2) * 1000),
        action: {
          label: 'Desfazer',
          onClick: () => undo.mutate(a.id, {
            onSuccess: () => { setUnlockedId(null); toast(`Compra desfeita: ${fmtPoints(a.cost)} PM devolvidos.`); },
            onError: (e) => toast(errorMessage(e), 'err'),
          }),
        },
      }); },
      onError: (e) => toast(errorMessage(e), 'err'),
    });
  }

  function toggleGoal(a: TreeAircraft) {
    const next = goalId === a.id ? null : a.id;
    setGoal.mutate(next, {
      onSuccess: () => toast(next ? `${a.name} é a sua nova meta. Acompanhe no seu perfil.` : 'Meta removida.'),
      onError: (e) => toast(errorMessage(e), 'err'),
    });
  }

  const tip = tipId ? byId[tipId] : null;

  // caminho de compras até a aeronave bloqueada sob o mouse
  const path: PathPlan | null = useMemo(
    () => (tip && !tip.owned && !tip.available ? planPath(aircraft, tiers, tip.id) : null),
    [tip, aircraft, tiers]);
  const pathIds = useMemo(() => new Set(path?.steps.map((s) => s.id) ?? []), [path]);
  const routeMaskId = useId().replace(/:/g, '');
  const routeDelays = useMemo(() => {
    const active = edges.filter((edge) => edge.to === tipId || (pathIds.has(edge.to) && (pathIds.has(edge.from) || byId[edge.from]?.owned)));
    const levels = new Map<string, number>();
    const levelOf = (id: string, visited = new Set<string>()): number => {
      if (levels.has(id)) return levels.get(id)!;
      if (visited.has(id)) return 0;
      const ancestors = new Set([...visited, id]);
      const incoming = active.filter((edge) => edge.to === id);
      const level = incoming.length ? Math.max(...incoming.map((edge) => levelOf(edge.from, ancestors) + 1)) : 0;
      levels.set(id, level);
      return level;
    };
    return new Map(active.map((edge) => [edge.key, levelOf(edge.from) * 550]));
  }, [edges, tipId, pathIds, byId]);
  const firstTier = tiers[0]?.tier;

  return (
    <>
    <div className="tt tt-screen">
      <div className="tt-top">
        <header className="tt-head">
          <div className="kicker">Hangar</div>
          <h1>Tech Tree <b>DCS</b>
            <span className="info" tabIndex={0} aria-label="Como funciona a árvore">
              <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 7v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="8" cy="4.6" r="1" fill="currentColor" /></svg>
              <span className="info-pop" role="tooltip">
                <b>Como funciona</b>
                <span>Compre com Pontos de Missão e ganhe mais PM voando aeronaves de tiers antigos.</span>
                <span><em>Regra 1:</em> aeronaves a partir do tier II exigem ao menos uma das aeronaves ligadas a elas pela linha tracejada (o tier anterior).</span>
                <span><em className="b">Regra 2:</em> aeronaves Bound exigem também a compra da aeronave ligada pela linha magenta.</span>
                <span>Passe o mouse (ou toque) em uma aeronave para ver as especificações e desbloquear.</span>
                <span>Navegue com a roda do mouse (Shift + roda para os lados) ou arrastando o fundo. Ctrl + roda dá zoom e “Ajustar” volta a encaixar na tela.</span>
              </span>
            </span>
          </h1>
        </header>

        <section className="stats" aria-label="Painel">
        <div className="stat"><span className="lbl">Pontos de missão</span><span className="num pm" id="pm">{fmtPoints(balance)}</span></div>
        <div className="stat"><span className="lbl">PM base por missão</span><span className="num">{fmtPoints(baseMissionPoints)}</span></div>
        <div className="stat"><span className="lbl">Ganho por missão</span><span className="num">{fmtPoints(gain)}<small>PM</small></span></div>
        <div className="stat"><span className="lbl">Frota</span><span className="num">{fleet.length}<small>/ {aircraft.length}</small></span></div>
        </section>
      </div>

      <div className="toolbar">
        <div className="legend">
          {(Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]).map((r) => (
            <span key={r}><i className="sq" style={{ '--c': `var(--r-${r})` } as React.CSSProperties} />{ROLE_LABEL[r]}</span>
          ))}
          <span className="sep" />
          <span><i className="st own" />Na frota</span>
          <span><i className="st av" />Liberada, saldo ok</span>
          <span><i className="st avd" />Liberada, falta PM</span>
          <span><i className="st lk" />Bloqueada</span>
          <span className="sep" />
          <span><i className="ln" />Bound</span>
          <span><i className="ln d" />Mesma família</span>
        </div>
        <div className="zoom">
          <button className="ghost" onClick={() => setZoom(z / 1.15)} aria-label="Diminuir zoom">−</button>
          <span>{Math.round(z * 100)}%</span>
          <button className="ghost" onClick={() => setZoom(z * 1.15)} aria-label="Aumentar zoom">+</button>
          <button className="ghost" onClick={fit}>Ajustar</button>
        </div>
      </div>

      <div
        className={`chart ${grabbing ? 'grab' : ''}`}
        ref={chartRef}
        onScroll={hideNow}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="canvas" style={{ width: L.W * z, height: L.H * z }}>
          <div className="stage" ref={stageRef} style={{ width: L.W, height: L.H, transform: `scale(${z})` }}>
            {L.patches.map((p, i) => (
              <div key={i} className="patch" style={{ left: p.x | 0, top: p.y | 0, width: p.w | 0, height: p.h | 0, background: p.bg }} />
            ))}
            {L.bandBoxes.map((b) => (
              <div key={b.id} className="band" style={{ top: b.y, height: b.h }}><span style={{ width: G }}>{b.name}</span></div>
            ))}
            {tiers.map((t, i) => <div key={t.tier} className="col" style={{ left: G + i * CW, top: HEAD }} />)}
            <div className="thead" style={{ height: HEAD }}>
              {tiers.map((t, i) => (
                <div key={t.tier} className="th" style={{ left: G + i * CW, width: CW }}>
                  <b><i style={{ opacity: 0.45 + i * 0.14 }} />Tier {t.label}</b>
                </div>
              ))}
            </div>
            <svg className="edges" width={L.W} height={L.H} aria-hidden="true">
              {/* o caminho destacado vai por último para ficar por cima */}
              {[...edges.filter((e) => e.to !== tipId), ...edges.filter((e) => e.to === tipId)].map((e) => {
                const selected = e.to === tipId;
                const onPath = pathIds.has(e.to) && !selected && (pathIds.has(e.from) || byId[e.from]?.owned);
                const maskId = `${routeMaskId}-${e.key}`;
                return <g key={`${tipId ?? 'idle'}-${e.key}`}>
                  <path className={e.cls} d={e.d} />
                  {(selected || onPath) && <>
                    <defs>
                      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={L.W} height={L.H}>
                        <path className="route-reveal" pathLength="1" d={e.d}
                          style={{ animationDelay: `${routeDelays.get(e.key) ?? 0}ms` }} />
                      </mask>
                    </defs>
                    <g mask={`url(#${maskId})`}>
                      <path className={`${e.cls}${selected ? ' hl' : ' pathe'}`} d={e.d} />
                      <path className="e route-flow" d={e.d} />
                    </g>
                  </>}
                </g>;
              })}
            </svg>
            {aircraft.map((a) => {
              const p = L.pos(a);
              const t = tierOf(a);
              const afford = a.available && balance >= a.cost;
              const cls = [
                'node', `r-${a.role}`,
                a.owned && 'owned', a.available && 'avail', afford && 'afford',
                !a.owned && !a.available && 'locked', a.id === tipId && 'sel',
                pathIds.has(a.id) && a.id !== tipId && 'path', a.id === goalId && 'goal',
                a.id === unlockedId && 'just-unlocked',
              ].filter(Boolean).join(' ');
              const step = path ? path.steps.findIndex((x) => x.id === a.id) + 1 : 0;
              return (
                <button
                  key={a.id}
                  className={cls}
                  data-id={a.id}
                  aria-label={`${a.name}, tier ${t.label}`}
                  style={{ left: p.x, top: p.y }}
                  onMouseEnter={() => showTip(a.id)}
                  onFocus={() => showTip(a.id)}
                  onClick={() => showTip(a.id)}
                  onMouseLeave={hideSoon}
                  onBlur={hideSoon}
                >
                  <span className="tile">
                    <span className="nm">{a.name}</span>
                    <span className="tn">{t.label}</span>
                    <AircraftIcon className="ic" icon={iconOf(a)} />
                    <svg className="lk" viewBox="0 0 12 12" aria-hidden="true"><use href="/aircraft-icons.svg#i-lock" /></svg>
                    {step > 0 && a.id !== tipId && <span className="step">{step}</span>}
                    {a.id === goalId && <span className="star" aria-label="Sua meta">★</span>}
                  </span>
                  <span className="slots">
                    {a.owned ? <span className="slot k-own"><i />Frota</span>
                      : a.available ? <span className="slot k-av"><i />{fmtPoints(a.cost)} PM</span>
                      : <span className="slot k-lk"><i />Bloq.</span>}
                    {a.bound.length > 0 && <span className="slot k-b"><i />Bound</span>}
                    {a.id === goalId && <span className="slot k-goal"><i />Meta</span>}
                    {a.restriction && a.id !== goalId && <span className="slot k-r"><i />Época</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {tip && (
        <div
          className="tip"
          ref={tipRef}
          role="tooltip"
          style={{ left: tipPos.x, top: tipPos.y, '--rc': `var(--r-${tip.role})` } as React.CSSProperties}
          onMouseEnter={() => window.clearTimeout(hideTimer.current)}
          onFocusCapture={() => window.clearTimeout(hideTimer.current)}
          onMouseLeave={hideSoon}
        >
          <TipContent
            key={tip.id}
            a={tip}
            path={path}
            isGoal={goalId === tip.id}
            onToggleGoal={() => toggleGoal(tip)}
            tierLabel={tierOf(tip).label}
            prevLabel={tip.tier === firstTier ? null : tiers[(tierIdx.get(tip.tier) ?? 1) - 1]?.label ?? null}
            multiplier={tierOf(tip).multiplier}
            balance={balance}
            gain={gain}
            base={baseMissionPoints}
            bestMult={bestMult}
            nameOf={(id) => byId[id]?.name ?? id}
            busy={unlock.isPending}
            onBuy={() => buy(tip)}
          />
        </div>
      )}

    </div>

    </>
  );
}

function TipContent(p: {
  a: TreeAircraft;
  path: PathPlan | null;
  isGoal: boolean;
  onToggleGoal: () => void;
  tierLabel: string;
  prevLabel: string | null;
  multiplier: number;
  balance: number;
  gain: number;
  base: number;
  bestMult: number;
  nameOf: (id: string) => string;
  busy: boolean;
  onBuy: () => void;
}) {
  const { a, balance, gain } = p;
  const c = a.cost;
  const [confirming, setConfirming] = useState(false);
  const missions = (pm: number, per: number) => Math.ceil(pm / Math.max(per, 1));

  let msg: string;
  if (a.owned) msg = 'Já está na sua frota.';
  else if (a.lockReason === 'previous_tier') msg = a.needAnyOf.length ? `Compre antes ${a.needAnyOf.map(p.nameOf).join(' ou ')}.` : `Compre antes uma aeronave do tier ${p.prevLabel}.`;
  else if (a.lockReason === 'bound') msg = `Bound: compre antes ${a.missingBound.map(p.nameOf).join(' e ')}.`;
  else if (balance >= c) msg = 'Saldo suficiente.';
  else msg = `Faltam ${fmtPoints(c - balance)} PM, cerca de ${missions(c - balance, gain)} missões com o maior bônus da sua frota (${fmtMult(p.bestMult)}).`;

  const [statusLabel, statusColor] = a.owned ? ['Na frota', 'var(--own)'] : a.available ? ['Liberada', 'var(--sel)'] : ['Bloqueada', 'var(--faint)'];

  return (
    <>
      <div className="row">
        <span className="pill" style={{ color: statusColor }}>{statusLabel}</span>
        <span className="lbl">Tier {p.tierLabel}</span>
      </div>
      <div className="head">
        <AircraftIcon icon={iconOf(a)} />
        <div><span className="role">{ROLE_LABEL[a.role]}</span><h2>{a.name}</h2></div>
      </div>
      {a.description && <span className="hint">{a.description}</span>}
      <dl className="kv">
        <dt>Custo</dt><dd>{c ? `${fmtPoints(c)} PM` : 'Gratuito'}</dd>
        <dt>Voando nela</dt><dd>{fmtMult(p.multiplier)} nos PM</dd>
        <dt>Regra 1</dt><dd>{!p.prevLabel ? 'Nenhum' : a.needAnyOf.length ? a.needAnyOf.map(p.nameOf).join(' ou ') : `Qualquer aeronave do tier ${p.prevLabel}`}</dd>
        {a.bound.length > 0 && <><dt>Bound</dt><dd style={{ color: 'var(--bound)' }}>{a.bound.map(p.nameOf).join(' e ')}</dd></>}
        <dt>Armamento</dt><dd style={a.restriction ? { color: 'var(--pm)' } : undefined}>{a.restriction || 'Sem restrição'}</dd>
        {!a.owned && a.available && c > 0 && (
          <>
            <dt>Missões com bônus</dt><dd>{missions(c, gain)}</dd>
            <dt>Missões sem bônus</dt><dd>{missions(c, p.base)}</dd>
          </>
        )}
      </dl>
      <span className="hint">{msg}</span>

      {p.path && (
        <div className="pathbox">
          <div className="row">
            <span className="lbl">Caminho até ela</span>
            <span className="pathsum">{p.path.steps.length} compras · {fmtPoints(p.path.cost)} PM</span>
          </div>
          <ol>
            {p.path.steps.map((s) => <li key={s.id}>{s.name}<em>{fmtPoints(s.cost)}</em></li>)}
          </ol>
          {p.path.cost > balance && (
            <span className="hint">Faltam {fmtPoints(p.path.cost - balance)} PM · ~{missions(p.path.cost - balance, gain)} missões</span>
          )}
        </div>
      )}

      {!a.owned && !confirming && (
        <div className="tip-actions">
          <button className="buy" id="buy" disabled={!a.available || balance < c || p.busy} onClick={() => setConfirming(true)}>
            Desbloquear · {fmtPoints(c)} PM
          </button>
          <button className={`goal-btn ${p.isGoal ? 'on' : ''}`} onClick={p.onToggleGoal} title={p.isGoal ? 'Remover meta' : 'Definir como meta'}
            aria-pressed={p.isGoal}>
            {p.isGoal ? '★' : '☆'}
          </button>
        </div>
      )}
      {!a.owned && confirming && (
        <div className="confirm" role="alertdialog" aria-label="Confirmar compra">
          <span>Comprar <b>{a.name}</b> por <b className="pm">{fmtPoints(c)} PM</b>?</span>
          <span className="hint">Saldo depois: {fmtPoints(balance - c)} PM</span>
          <div className="tip-actions">
            <button className="ghost" onClick={() => setConfirming(false)}>Cancelar</button>
            <button className="buy" id="confirm-buy" autoFocus disabled={p.busy} onClick={() => { setConfirming(false); p.onBuy(); }}>Confirmar</button>
          </div>
        </div>
      )}
    </>
  );
}
