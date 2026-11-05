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
import { QuickDoubts } from './QuickDoubts';
import { QuickPilotTable } from './QuickPilotTable';
import { nameKey, zeroCounts, totalTargets, type AnalyzedPilot, type Doubt } from './quick-shared';
import { fmtPoints } from '../../lib/format';
import { aircraftMultiplier, previewPilot, reportPayload, reportPilot, REPORT_TARGETS } from '../../lib/mission-report';
import './mission-report-quick.css';

interface TacviewResult {
  analysis: { title: string; durationSec: number; pilots: AnalyzedPilot[]; doubts: Doubt[]; stats: { targets: number; claimed: number; unclaimed: number } };
  matches: { key: string; userId: string | null }[];
}

function QuickEditor({ mission, initial }: { mission: Mission; initial: MissionReport }) {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [report, setReport] = useState<MissionReport>(() => ({
    ...initial,
    pilots: [...initial.pilots, ...mission.signups.filter((s) => !initial.pilots.some((p) => p.userId === s.userId)).map((s) => reportPilot(s.userId, s.nickname, s.aircraftId, s.aircraftName))],
  }));
  
  const [fileName, setFileName] = useState('');
  const [doubts, setDoubts] = useState<Doubt[]>([]);
  const [idByName, setIdByName] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [skipped, setSkipped] = useState(0);
  const [resolved, setResolved] = useState<Record<number, string>>({});
  const [unlinked, setUnlinked] = useState<AnalyzedPilot[]>([]);
  const [open, setOpen] = useState('');
  const [stage, setStage] = useState<'import' | 'review'>(initial.source ? 'review' : 'import');
  const [dragging, setDragging] = useState(false);
  const [dirty, setDirty] = useState(false);
  const aircraft = useQuery({ queryKey: ['admin', 'tree'], queryFn: () => api.get<{ aircraft: Aircraft[] }>('/admin/tree') });

  const edit = (update: (current: MissionReport) => MissionReport) => { setReport(update); setDirty(true); };
  const patch = (userId: string, change: Partial<ReportPilot>) => edit((cur) => ({ ...cur, pilots: cur.pilots.map((p) => (p.userId === userId ? { ...p, reviewed: false, ...change } : p)) }));
  const setCount = (userId: string, key: ReportTarget, value: number) => edit((cur) => ({ ...cur, pilots: cur.pilots.map((p) => (p.userId === userId ? { ...p, reviewed: false, counts: { ...p.counts, [key]: Math.max(0, Math.min(99, value || 0)) } } : p)) }));
  const fromAnalysis = (a: AnalyzedPilot): Partial<ReportPilot> => ({ attended: true, survived: a.survived, counts: { ...zeroCounts(), ...a.counts } });

  const upload = useMutation({
    mutationFn: (file: File) => api.upload<TacviewResult>(`/admin/missions/${mission.id}/report/tacview`, file),
    onSuccess: (data) => {

      const byUser = new Map(data.matches.filter((m) => m.userId).map((m) => [m.userId as string, data.analysis.pilots.find((p) => p.key === m.key) as AnalyzedPilot]));
      edit((cur) => ({ ...cur, source: `Tacview: ${fileName}`, pilots: cur.pilots.map((p) => {
        const a = byUser.get(p.userId);
        return a ? { ...p, reviewed: false, ...fromAnalysis(a) } : { ...p, reviewed: false, attended: false, survived: null, counts: zeroCounts() };
      }) }));
      setIdByName(Object.fromEntries(data.analysis.pilots.flatMap((p) => { const m = data.matches.find((x) => x.key === p.key)?.userId; return m ? [[p.name, m]] : []; })));
      setSkipped(data.analysis.doubts.filter((d) => d.kind !== 'unclaimed' && d.kind !== 'vanished').length);
      setUnlinked(data.analysis.pilots.filter((p) => !data.matches.find((m) => m.key === p.key)?.userId));
      setDoubts(data.analysis.doubts.filter((d) => d.kind === 'unclaimed' || d.kind === 'vanished'));
      setResolved({});
      setStage('review');
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
        navigate(`/admin/missoes/${mission.id}/relatorio?publicado=1`);
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
  const pilotByLabel = (label: string) => rows.find((x) => x.userId === idByName[label]) ?? rows.find((x) => nameKey(x.nickname) === nameKey(label));
  const flagged = new Set(doubts.flatMap((d, i) => (d.kind === 'vanished' && !resolved[i] ? [pilotByLabel(d.pilot ?? d.label)?.userId ?? ''] : [])));
  const targetsTotal = rows.reduce((n, p) => n + (p.attended ? totalTargets(p) : 0), 0);
  const baseTotal = rows.reduce((n, p) => n + calc(p).subtotal, 0);
  const blocked = pending > 0 || open_ > 0 || !rows.length;

  const assign = (i: number, userId: string) => {
    const d = doubts[i]; const p = rows.find((x) => x.userId === userId);
    if (!d.category || !p) return;
    edit((cur) => ({ ...cur, pilots: cur.pilots.map((x) => (x.userId === userId ? { ...x, reviewed: false, attended: true, survived: x.survived ?? true, counts: { ...x.counts, [d.category as ReportTarget]: x.counts[d.category as ReportTarget] + 1 } } : x)) }));
    resolve(i, `Atribuído a ${p.nickname}`);
  };
  const markLost = (i: number) => { const d = doubts[i]; const p = pilotByLabel(d.pilot ?? d.label); if (!p) { setNotice(`Não achei ${d.pilot ?? d.label} na tabela. Corrija o Sobreviveu dele à mão.`); return; } setNotice(''); patch(p.userId, { survived: false }); resolve(i, 'Marcado como perdido'); };
  const linkPilot = (a: AnalyzedPilot, userId: string) => {
    const cur = rows.find((p) => p.userId === userId);
    const had = !!cur && cur.attended === true && totalTargets(cur) > 0; // o piloto já recebeu abates de outro nome do arquivo: soma
    const add = fromAnalysis(a);
    patch(userId, had && cur ? { attended: true, survived: !!cur.survived && a.survived, counts: Object.fromEntries(REPORT_TARGETS.map(({ key }) => [key, Math.min(99, cur.counts[key] + (a.counts[key] ?? 0))])) as Record<ReportTarget, number> } : add);
    setUnlinked((c) => c.filter((x) => x.key !== a.key));
  };
  const pick = (file?: File) => { if (file && dirty && !window.confirm('Importar de novo substitui os abates e as atribuições já feitos nesta tela. Continuar?')) return; if (file) { setFileName(file.name); upload.mutate(file); } };

  const steps = (
    <div className="rq-steps" aria-label="Etapas">
      <span className={stage === 'import' ? 'on' : ''}>1 · Importar</span>
      <span className={stage === 'review' ? 'on' : ''}>2 · Conferir</span>
      <span>3 · Publicar</span>
    </div>
  );
  const title = (sub: React.ReactNode) => (
    <header className="rq-head">
      <div>
        <span className="rq-eyebrow">Administração / Missões</span>
        <h1>{stage === 'import' ? 'Finalizar missão' : 'Relatório pós-missão'}</h1>
        <p className="muted">{sub}</p>
      </div>
      {steps}
    </header>
  );

  if (stage === 'import') {
    return (
      <div className="rq">
        <Link className="op-back" to="/admin/missoes">← Administração de missões</Link>
        {title(<>{mission.title} · <Link to={`/admin/missoes/${mission.id}/relatorio`}>usar o fluxo completo</Link></>)}
        <div className="rq-import-grid">
          <div className="rq-col">
            <label className={`rq-drop${dragging ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>
              <strong>{upload.isPending ? 'Lendo o arquivo…' : 'Arraste o arquivo do Tacview aqui'}</strong>
              <span className="muted">Arquivo <code>.acmi</code> gravado durante a missão · até 60 MB</span>
              <span className="btn">Escolher arquivo</span>
              <input type="file" accept=".acmi,.zip,.txt" hidden disabled={upload.isPending} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {upload.error && <p role="alert" className="op-error">{errorMessage(upload.error)}</p>}
            <div className="card rq-manual">
              <div><strong>Prefere lançar à mão?</strong><p className="muted">Abre a mesma tabela para você preencher os abates.</p></div>
              <button type="button" className="btn ghost" onClick={() => setStage('review')}>Abrir tabela</button>
            </div>
          </div>
          <aside className="card rq-side">
            <span className="rq-eyebrow muted">O que o site lê do arquivo</span>
            <ul>
              <li><b>1</b><span><strong>Quem participou</strong><br /><span className="muted">Pilotos que entraram em voo, com a aeronave usada.</span></span></li>
              <li><b>2</b><span><strong>Quem abateu o quê</strong><br /><span className="muted">Alvos destruídos por piloto, ligados à arma que acertou.</span></span></li>
              <li><b>3</b><span><strong>Quem sobreviveu</strong><br /><span className="muted">Perdas por ação inimiga contam como não sobreviveu.</span></span></li>
            </ul>
            <p className="muted rq-side-note">O Tacview nem sempre mostra quem deu o tiro. O que ficar em dúvida aparece na próxima tela para você decidir.</p>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="rq">
      <Link className="op-back" to="/admin/missoes">← Administração de missões</Link>
      {title(<>{mission.title}{fileName || report.source ? <> · lido de <code>{fileName || report.source.replace(/^Tacview: /, '')}</code></> : null}</>)}

      <section className="rq-kpis" aria-label="Resumo">
        <div><span>Pilotos</span><strong>{attendedCount}</strong></div>
        <div><span>Alvos destruídos</span><strong>{targetsTotal}</strong></div>
        <div className="accent"><span>PM a distribuir</span><strong>{fmtPoints(totalPm)}</strong></div>
        <div className="warn"><span>Para conferir</span><strong>{open_ + pending}</strong></div>
      </section>

      {skipped > 0 && <p className="rq-block" role="status">{skipped} {skipped === 1 ? 'objeto do arquivo não pôde' : 'objetos do arquivo não puderam'} ser classificados e ficou de fora da pontuação.</p>}
      {notice && <p className="rq-block" role="alert">{notice}</p>}
      {(doubts.length > 0 || unlinked.length > 0) && (
        <QuickDoubts pendingCount={open_} unlinked={unlinked} doubts={doubts} resolved={resolved} rows={rows} pilotOptions={pilotOptions}
          onLink={linkPilot} onResolve={resolve} onUndo={(i) => setResolved((c) => { const n = { ...c }; delete n[i]; return n; })} onAssign={assign} onLost={markLost} />
      )}

      <QuickPilotTable rows={rows} calc={calc} flagged={flagged} open={open} targetsTotal={targetsTotal} baseTotal={baseTotal} totalPm={totalPm} onOpen={setOpen} patch={patch} setCount={setCount} />

      <p className="rq-note muted">Bônus de sobrevivência ×{report.rules.survivalMultiplier.toString().replace('.', ',')} para quem sobreviveu. O bônus por tier da aeronave entra automaticamente quando a missão tem tier acima do 1. Clique em um piloto para ver o detalhe dos alvos ou corrigir um valor.</p>

      <footer className="rq-foot">
        <div>
          <span className="muted">Ao publicar, os PM entram no saldo dos pilotos e a missão é encerrada. Você ainda pode conceder as condecorações depois.</span>
          {blocked && rows.length > 0 && <p className="rq-block">{pending > 0 ? `Faltam ${pending} ${pending === 1 ? 'piloto' : 'pilotos'} com participação ou sobrevivência em aberto.` : 'Resolva os itens para conferir antes de publicar.'}</p>}
          {save.error && <p role="alert" className="op-error">{errorMessage(save.error)}</p>}
        </div>
        <div className="rq-actions">
          <button type="button" className="btn ghost" onClick={() => setStage('import')}>Voltar</button>
          <button type="button" className="btn ghost" disabled={save.isPending || !dirty} onClick={() => save.mutate(false)}>Salvar rascunho</button>
          <button type="button" className="btn" disabled={save.isPending || blocked} onClick={() => save.mutate(true)}>{save.isPending ? 'Salvando…' : 'Publicar relatório'}</button>
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
