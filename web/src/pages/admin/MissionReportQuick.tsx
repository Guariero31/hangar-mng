// Relatório pós-missão em uma tela: importa a gravação do Tacview, mostra tudo numa tabela e deixa só as dúvidas para o admin.
// Usa as mesmas rotas e regras do fluxo completo (MissionReportEditor); é uma forma mais curta de preencher o mesmo relatório.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../api/client';
import type { Aircraft, Mission, MissionReport, ReportPilot, ReportTarget } from '../../api/types';
import { useMission } from '../../api/hooks';
import { invalidatePlayerData } from '../../api/cache';
import { useToast } from '../../components/Toast';
import { Select } from '../../components/Select';
import { fmtPoints } from '../../lib/format';
import { aircraftMultiplier, previewPilot, reportPayload, reportPilot, REPORT_TARGETS } from '../../lib/mission-report';
import './mission-report-quick.css';

interface Doubt { kind: 'unclaimed' | 'vanished'; tSec: number | null; label: string; detail: string; category?: ReportTarget; pilot?: string }
interface AnalyzedPilot { name: string; key: string; aircraft: string[]; deaths: number; survived: boolean; counts: Partial<Record<ReportTarget, number>> }
interface TacviewResult {
  analysis: { title: string; durationSec: number; pilots: AnalyzedPilot[]; doubts: Doubt[]; stats: { targets: number; claimed: number; unclaimed: number } };
  matches: { key: string; userId: string | null }[];
}

const mmss = (sec: number | null) => (sec == null ? '' : `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`);
const zeroCounts = () => Object.fromEntries(REPORT_TARGETS.map(({ key }) => [key, 0])) as Record<ReportTarget, number>;
const totalTargets = (p: ReportPilot) => REPORT_TARGETS.reduce((n, { key }) => n + p.counts[key], 0);

function QuickEditor({ mission, initial }: { mission: Mission; initial: MissionReport }) {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [report, setReport] = useState<MissionReport>(() => ({
    ...initial,
    pilots: [...initial.pilots, ...mission.signups.filter((s) => !initial.pilots.some((p) => p.userId === s.userId)).map((s) => reportPilot(s.userId, s.nickname, s.aircraftId, s.aircraftName))],
  }));
  const [imported, setImported] = useState<TacviewResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [doubts, setDoubts] = useState<Doubt[]>([]);
  const [resolved, setResolved] = useState<Record<number, string>>({});
  const [unlinked, setUnlinked] = useState<AnalyzedPilot[]>([]);
  const [open, setOpen] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const aircraft = useQuery({ queryKey: ['admin', 'tree'], queryFn: () => api.get<{ aircraft: Aircraft[] }>('/admin/tree') });

  const edit = (update: (current: MissionReport) => MissionReport) => { setReport(update); setDirty(true); setConfirmed(false); };
  const patch = (userId: string, change: Partial<ReportPilot>) => edit((cur) => ({ ...cur, pilots: cur.pilots.map((p) => (p.userId === userId ? { ...p, reviewed: false, ...change } : p)) }));
  const setCount = (userId: string, key: ReportTarget, value: number) => edit((cur) => ({ ...cur, pilots: cur.pilots.map((p) => (p.userId === userId ? { ...p, reviewed: false, counts: { ...p.counts, [key]: Math.max(0, Math.min(99, value || 0)) } } : p)) }));
  const fromAnalysis = (a: AnalyzedPilot): Partial<ReportPilot> => ({ attended: true, survived: a.survived, counts: { ...zeroCounts(), ...a.counts } });

  const upload = useMutation({
    mutationFn: (file: File) => api.upload<TacviewResult>(`/admin/missions/${mission.id}/report/tacview`, file),
    onSuccess: (data) => {
      setImported(data);
      const byUser = new Map(data.matches.filter((m) => m.userId).map((m) => [m.userId as string, data.analysis.pilots.find((p) => p.key === m.key) as AnalyzedPilot]));
      edit((cur) => ({ ...cur, source: `Tacview: ${fileName}`, pilots: cur.pilots.map((p) => {
        const a = byUser.get(p.userId);
        return a ? { ...p, reviewed: false, ...fromAnalysis(a) } : { ...p, reviewed: false, attended: false, survived: null, counts: zeroCounts() };
      }) }));
      setUnlinked(data.analysis.pilots.filter((p) => !data.matches.find((m) => m.key === p.key)?.userId));
      setDoubts(data.analysis.doubts.filter((d) => d.kind === 'unclaimed' || d.kind === 'vanished'));
      setResolved({});
      toast('Tacview lido. Confira a tabela e as dúvidas.');
    },
  });

  const save = useMutation({
    mutationFn: (publish: boolean) => {
      const body = reportPayload(publish ? { ...report, pilots: report.pilots.map((p) => ({ ...p, reviewed: true })) } : report);
      return publish ? api.post<MissionReport>(`/admin/missions/${mission.id}/report/publish`, body) : api.put<MissionReport>(`/admin/missions/${mission.id}/report`, body);
    },
    onSuccess: async (saved, publish) => {
      queryClient.setQueryData(['admin', 'mission-report', mission.id], saved);
      if (publish) {
        toast('Relatório publicado e missão finalizada.');
        await Promise.all([invalidatePlayerData(queryClient), queryClient.invalidateQueries({ queryKey: ['missions'] })]);
        navigate(`/admin/missoes/${mission.id}/relatorio`);
      } else { setReport(saved); setDirty(false); toast('Rascunho salvo. Nenhum ponto foi distribuído.'); }
    },
  });

  const plane = (id: string) => aircraft.data?.aircraft.find((a) => a.id === id);
  const calc = (p: ReportPilot) => previewPilot(p, report.rules, aircraftMultiplier(mission.tier, plane(p.aircraftId)?.tier, report.rules.tierBonuses));
  const rows = report.pilots;
  const totalPm = rows.reduce((n, p) => n + calc(p).total, 0);
  const attendedCount = rows.filter((p) => p.attended).length;
  const pending = rows.filter((p) => p.attended === null || (p.attended && p.survived === null)).length;
  const open_ = doubts.filter((_, i) => !resolved[i]).length + unlinked.length;
  const resolve = (i: number, text: string) => setResolved((cur) => ({ ...cur, [i]: text }));
  const pilotOptions = rows.map((p) => ({ value: p.userId, label: p.nickname }));

  const assign = (i: number, userId: string) => {
    const d = doubts[i]; const p = rows.find((x) => x.userId === userId);
    if (!d.category || !p) return;
    edit((cur) => ({ ...cur, pilots: cur.pilots.map((x) => (x.userId === userId ? { ...x, reviewed: false, attended: true, survived: x.survived ?? true, counts: { ...x.counts, [d.category as ReportTarget]: x.counts[d.category as ReportTarget] + 1 } } : x)) }));
    resolve(i, `Atribuído a ${p.nickname}`);
  };
  const linkPilot = (a: AnalyzedPilot, userId: string) => {
    patch(userId, fromAnalysis(a));
    setUnlinked((cur) => cur.filter((x) => x.key !== a.key));
  };

  return (
    <div className="rq">
      <Link className="op-back" to="/admin/missoes">← Administração de missões</Link>
      <header className="rq-head">
        <div>
          <span className="label">Administração / Missões</span>
          <h1>Relatório pós-missão</h1>
          <p className="muted">{mission.title} · versão simplificada em uma tela. <Link to={`/admin/missoes/${mission.id}/relatorio`}>Usar o fluxo completo</Link></p>
        </div>
      </header>

      <section className="card rq-import" aria-label="Importar o Tacview">
        <div>
          <strong>1. Importe a gravação do Tacview</strong>
          <p className="muted">Arquivo <code>.acmi</code> ou <code>.zip.acmi</code>. O site sugere quem participou, os abates e quem sobreviveu. Você confere e ajusta. Sem arquivo, preencha a tabela à mão.</p>
        </div>
        <label className="btn" style={{ cursor: upload.isPending ? 'wait' : 'pointer' }}>
          {upload.isPending ? 'Lendo…' : imported ? 'Trocar arquivo' : 'Escolher arquivo'}
          <input type="file" accept=".acmi,.zip,.txt" hidden disabled={upload.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFileName(f.name); upload.mutate(f); } e.target.value = ''; }} />
        </label>
        {upload.error && <p role="alert" className="op-error rq-wide">{errorMessage(upload.error)}</p>}
        {imported && <p className="rq-wide muted" role="status">Lido: {imported.analysis.pilots.length} pilotos · {imported.analysis.stats.targets} alvos destruídos ({imported.analysis.stats.claimed} atribuídos, {imported.analysis.stats.unclaimed} sem dono) · {mmss(imported.analysis.durationSec)} de gravação.</p>}
      </section>

      <section className="rq-kpis" aria-label="Resumo">
        <div><span>Pilotos que voaram</span><strong>{attendedCount}</strong></div>
        <div><span>Alvos destruídos</span><strong>{rows.reduce((n, p) => n + (p.attended ? totalTargets(p) : 0), 0)}</strong></div>
        <div className="accent"><span>PM a distribuir</span><strong>{fmtPoints(totalPm)}</strong></div>
        <div className={open_ || pending ? 'warn' : ''}><span>Para conferir</span><strong>{open_ + pending}</strong></div>
      </section>

      {(doubts.length > 0 || unlinked.length > 0) && (
        <section className="card rq-doubts" aria-label="Dúvidas">
          <h2>{open_ ? `${open_} ${open_ === 1 ? 'item precisa' : 'itens precisam'} da sua decisão` : 'Todas as dúvidas foram resolvidas'}</h2>
          {unlinked.map((a) => (
            <div key={a.key} className="rq-doubt">
              <span><strong>{a.name}</strong> aparece no arquivo, mas não bate com nenhum inscrito. <span className="muted">Voou {a.aircraft.join(', ')} · {Object.values(a.counts).reduce((n, v) => n + (v ?? 0), 0)} alvos.</span></span>
              <Select aria-label={`Vincular ${a.name} a um inscrito`} value="" options={[{ value: '', label: 'Vincular a…' }, ...pilotOptions]} onChange={(v) => v && linkPilot(a, v)} />
            </div>
          ))}
          {doubts.map((d, i) => (
            <div key={i} className={`rq-doubt${resolved[i] ? ' done' : ''}`}>
              <span><strong>{mmss(d.tSec)}</strong> · {d.kind === 'vanished' ? <><strong>{d.label}</strong> sumiu do mapa.</> : <>{d.label} destruído sem dono.</>} <span className="muted">{d.detail}</span></span>
              {resolved[i] ? <span className="rq-done">{resolved[i]} <button type="button" className="btn ghost sm" onClick={() => setResolved((c) => { const n = { ...c }; delete n[i]; return n; })}>Desfazer</button></span>
                : d.kind === 'vanished' ? (
                  <span className="rq-actions">
                    <button type="button" className="btn ghost sm" onClick={() => resolve(i, 'Mantido como sobreviveu')}>Sobreviveu</button>
                    <button type="button" className="btn ghost sm" onClick={() => { const p = rows.find((x) => x.nickname === d.label || x.nickname.toLowerCase() === d.label.toLowerCase()) ?? rows.find((x) => d.label.toLowerCase().includes(x.nickname.toLowerCase())); if (p) patch(p.userId, { survived: false }); resolve(i, 'Marcado como perdido'); }}>Foi perdido</button>
                  </span>
                ) : (
                  <span className="rq-actions">
                    <Select aria-label="Atribuir a um piloto" value="" options={[{ value: '', label: 'Atribuir a…' }, ...pilotOptions.filter((o) => rows.find((p) => p.userId === o.value)?.attended !== false)]} onChange={(v) => v && assign(i, v)} />
                    <button type="button" className="btn ghost sm" onClick={() => resolve(i, 'Ignorado')}>Ignorar</button>
                  </span>
                )}
            </div>
          ))}
        </section>
      )}

      <section className="rq-table" aria-label="Pontuação por piloto">
        <div className="rq-row rq-head-row"><span>Piloto</span><span>Aeronave</span><span>Voou</span><span>Sobreviveu</span><span className="num">Alvos</span><span className="num">PM</span></div>
        {rows.map((p) => {
          const c = calc(p);
          return (
            <div key={p.userId} className={`rq-item${open === p.userId ? ' open' : ''}`}>
              <div className="rq-row">
                <button type="button" className="rq-name" aria-expanded={open === p.userId} onClick={() => setOpen(open === p.userId ? '' : p.userId)}>{p.nickname}</button>
                <span className="muted">{p.aircraftName}</span>
                <span><button type="button" className={`rq-chip ${p.attended ? 'ok' : p.attended === false ? 'no' : ''}`} aria-pressed={!!p.attended} onClick={() => patch(p.userId, p.attended ? { attended: false, survived: null, counts: zeroCounts() } : { attended: true, survived: p.survived ?? true })}>{p.attended ? 'Sim' : p.attended === false ? 'Não' : '—'}</button></span>
                <span>{p.attended ? <button type="button" className={`rq-chip ${p.survived ? 'ok' : p.survived === false ? 'no' : ''}`} aria-pressed={!!p.survived} onClick={() => patch(p.userId, { survived: !p.survived })}>{p.survived ? 'Sim' : p.survived === false ? 'Não' : '—'}</button> : <span className="muted">—</span>}</span>
                <span className="num">{p.attended ? totalTargets(p) : '—'}</span>
                <span className="num rq-pm">{fmtPoints(c.total)}</span>
              </div>
              {open === p.userId && (
                <div className="rq-detail">
                  <div className="rq-counts">
                    {REPORT_TARGETS.map(({ key, label }) => (
                      <label key={key}><span>{label}</span><input type="number" min={0} max={99} disabled={!p.attended} value={p.counts[key]} onChange={(e) => setCount(p.userId, key, Number(e.target.value))} /></label>
                    ))}
                  </div>
                  <p className="muted">Base {fmtPoints(c.subtotal)}{c.aircraftBonus ? ` · bônus da aeronave +${fmtPoints(c.aircraftBonus)}` : ''}{c.survivalBonus ? ` · bônus de sobrevivência +${fmtPoints(c.survivalBonus)}` : ''}</p>
                </div>
              )}
            </div>
          );
        })}
        <div className="rq-row rq-total"><span>Total</span><span /><span /><span /><span className="num">{rows.reduce((n, p) => n + (p.attended ? totalTargets(p) : 0), 0)}</span><span className="num rq-pm">{fmtPoints(totalPm)}</span></div>
      </section>

      <footer className="card rq-foot">
        <div>
          <label className="rq-confirm"><input type="checkbox" checked={confirmed} disabled={pending > 0} onChange={(e) => setConfirmed(e.target.checked)} />Conferi os valores e as dúvidas</label>
          <p className="muted">{pending > 0 ? `Faltam ${pending} ${pending === 1 ? 'piloto' : 'pilotos'} com participação ou sobrevivência em aberto.` : 'Ao publicar, os PM entram no saldo dos pilotos e a missão é encerrada.'}</p>
          {save.error && <p role="alert" className="op-error">{errorMessage(save.error)}</p>}
        </div>
        <div className="rq-actions">
          <button type="button" className="btn ghost" disabled={save.isPending || !dirty} onClick={() => save.mutate(false)}>Salvar rascunho</button>
          <button type="button" className="btn" disabled={save.isPending || !confirmed || pending > 0 || !rows.length} onClick={() => save.mutate(true)}>{save.isPending ? 'Salvando…' : 'Publicar relatório'}</button>
        </div>
      </footer>
    </div>
  );
}

export function MissionReportQuick() {
  const { id = '' } = useParams();
  const mission = useMission(id, { poll: false });
  const report = useQuery({ queryKey: ['admin', 'mission-report', id], queryFn: () => api.get<MissionReport>(`/admin/missions/${id}/report`), enabled: !!id });
  return (
    <div className="rq-page">
      {(mission.isLoading || report.isLoading) && <p className="loading">Preparando relatório…</p>}
      {(mission.error || report.error) && <div role="alert"><p>{errorMessage(mission.error || report.error)}</p><button type="button" className="btn ghost" onClick={() => { void mission.refetch(); void report.refetch(); }}>Tentar novamente</button></div>}
      {report.data?.state === 'published'
        ? <section className="card report-section"><h2>Relatório publicado</h2><p>Esta missão já foi finalizada e os pontos foram distribuídos.</p><Link className="btn" to={`/missoes/${id}/relatorio`}>Ver relatório publicado</Link></section>
        : mission.data && report.data && <QuickEditor key={id} mission={mission.data} initial={report.data} />}
    </div>
  );
}
