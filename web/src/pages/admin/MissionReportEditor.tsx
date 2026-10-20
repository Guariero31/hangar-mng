import { useToast } from '../../components/Toast';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../api/client';
import type { Aircraft, Mission, MissionReport, ReportPilot } from '../../api/types';
import { useMission } from '../../api/hooks';
import { invalidatePlayerData } from '../../api/cache';
import { Select } from '../../components/Select';
import { fmtPoints } from '../../lib/format';
import { previewPilot, reportPayload, reportPilot, REPORT_TARGETS, reportWhen } from '../../lib/mission-report';
import '../mission-report.css';

function ReportEditor({ mission, initial }: { mission: Mission; initial: MissionReport }) {
  const toast = useToast();
  const [report, setReport] = useState<MissionReport>(() => ({ ...initial, pilots: [...initial.pilots, ...mission.signups.filter((signup) => !initial.pilots.some((pilot) => pilot.userId === signup.userId)).map((signup) => reportPilot(signup.userId, signup.nickname, signup.aircraftId, signup.aircraftName))] }));
  const [step, setStep] = useState(0);
  const [expanded, setExpanded] = useState('');
  const [adding, setAdding] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pendingParticipation = report.pilots.filter((pilot) => pilot.attended === null);
  function goToStep(index: number) {
    if (index > 0 && pendingParticipation.length) { setStep(0); }
    else { setStep(index); }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const aircraft = useQuery({ queryKey: ['admin', 'tree'], queryFn: () => api.get<{ aircraft: Aircraft[]; tiers: { tier: number; multiplier: number }[] }>('/admin/tree') });
  const players = useQuery({ queryKey: ['admin', 'report-players'], queryFn: async () => {
    const registered: { id: string; nickname: string }[] = [];
    let total = 0;
    do {
      const page = await api.get<{ players: { id: string; nickname: string }[]; total: number }>(`/admin/players?filter=active&limit=200&offset=${registered.length}&sort=nickname&direction=asc`);
      registered.push(...page.players);
      total = page.total;
      if (!page.players.length) break;
    } while (registered.length < total);
    return registered;
  }, enabled: step === 0 });
  const save = useMutation({ mutationFn: (publish: boolean) => publish
    ? api.post<MissionReport>(`/admin/missions/${mission.id}/report/publish`, reportPayload(report))
    : api.put<MissionReport>(`/admin/missions/${mission.id}/report`, reportPayload(report)),
    onSuccess: async (saved, publish) => {
      toast(publish ? 'Relatório publicado e missão finalizada.' : 'Rascunho salvo com sucesso.');
      setReport(saved); setDirty(false); setConfirmed(false); setMessage('Rascunho salvo. Nenhum ponto foi distribuído.');
      queryClient.setQueryData(['admin', 'mission-report', mission.id], saved);
      if (publish) { await Promise.all([invalidatePlayerData(queryClient), queryClient.invalidateQueries({ queryKey: ['missions'] })]); navigate(`/missoes/${mission.id}/relatorio`); }
    },
  });
  function change(update: (current: MissionReport) => MissionReport) { setReport(update); setDirty(true); setConfirmed(false); setMessage(''); save.reset(); }
  function updatePilot(userId: string, patch: Partial<ReportPilot>) {
    change((current) => ({ ...current, pilots: current.pilots.map((pilot) => pilot.userId === userId ? { ...pilot, reviewed: false, ...patch } : pilot) }));
  }
  const attended = report.pilots.filter((pilot) => pilot.attended);
  const bonusOf = (aircraftId: string) => { const plane = aircraft.data?.aircraft.find((item) => item.id === aircraftId); return aircraft.data?.tiers.find((item) => item.tier === plane?.tier)?.multiplier ?? 1; };
  const preview = (pilot: ReportPilot) => previewPilot(pilot, report.rules, bonusOf(pilot.aircraftId));
  const ready = report.pilots.every((pilot) => pilot.attended !== null && pilot.reviewed && (!pilot.attended || pilot.survived !== null));
  const total = report.pilots.reduce((sum, pilot) => sum + preview(pilot).total, 0);
  const pilotOptions = players.data?.filter((pilot) => !report.pilots.some((item) => item.userId === pilot.id)) ?? [];
  return <form className="report-editor" onSubmit={(event) => { event.preventDefault(); save.mutate(false); }}>
    <header className="report-editor-head"><div><span className="report-editor-eyebrow">Relatório pós-missão</span><h1>{mission.title}</h1><p>Confirme os participantes, apure os resultados e publique para o esquadrão.</p></div><span className={`report-save-status${dirty ? ' is-dirty' : ''}`} role="status"><span aria-hidden="true" />{dirty ? 'Alterações não salvas' : report.savedAt ? `Salvo em ${reportWhen(report.savedAt)}` : 'Novo rascunho'}</span></header>
    <nav className="report-steps" aria-label="Etapas do relatório">{['Participação', 'Resultados', 'Conferência'].map((label, index) => <button key={label} type="button" disabled={save.isPending || (index > 0 && pendingParticipation.length > 0)} aria-current={step === index ? 'step' : undefined} className={step === index ? 'active' : ''} onClick={() => goToStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>
    <fieldset disabled={save.isPending} className="report-fieldset">
      {step === 0 && <section className="card report-section"><span className="label">01 / Tripulação</span><h2>Quem participou da operação?</h2><p>Confirme a presença e a aeronave utilizada. Apenas quem participou terá resultados apurados.</p>
        {pendingParticipation.length > 0 && <p className="report-participation-warning" role="status">Confirme a participação de {pendingParticipation.map((pilot) => pilot.nickname).join(", ")} para continuar. Selecione “Participou” ou “Não participou” em cada piloto.</p>}
        {report.pilots.map((pilot) => <article key={pilot.userId} className={`report-presence${pilot.attended === null ? ' is-pending' : ''}`}><div><strong>{pilot.nickname}</strong><small>{mission.signups.some((signup) => signup.userId === pilot.userId) ? 'Inscrito na missão' : 'Adicionado pelo administrador'}</small>{pilot.attended === null && <small className="report-presence-pending">Participação pendente</small>}</div>
          <Select aria-label={`Participação de ${pilot.nickname}`} value={pilot.attended === null ? '' : pilot.attended ? 'yes' : 'no'} onChange={(value) => updatePilot(pilot.userId, value === 'no' ? { attended: false, survived: null, counts: reportPilot('', '', '', '').counts, reviewed: true } : { attended: value === 'yes' ? true : null })} options={[{ value: '', label: 'Confirmar participação…' }, { value: 'yes', label: 'Participou' }, { value: 'no', label: 'Não participou' }]} />
          <Select aria-label={`Aeronave de ${pilot.nickname}`} value={pilot.aircraftId} onChange={(value) => updatePilot(pilot.userId, { aircraftId: value, aircraftName: aircraft.data?.aircraft.find((plane) => plane.id === value)?.name ?? value, reviewed: pilot.attended === false })} options={[{ value: '', label: 'Escolha a aeronave…' }, ...(aircraft.data?.aircraft ?? [{ id: pilot.aircraftId, name: pilot.aircraftName }]).map((plane) => ({ value: plane.id, label: plane.name }))]} />
          {!mission.signups.some((signup) => signup.userId === pilot.userId) && <button type="button" className="btn ghost sm" onClick={() => change((current) => ({ ...current, pilots: current.pilots.filter((item) => item.userId !== pilot.userId) }))}>Remover</button>}
        </article>)}
        {!report.pilots.length && <p className="muted">Não há pilotos inscritos. Você pode adicionar os participantes abaixo.</p>}
        <div className="report-add"><h3>Adicionar piloto cadastrado</h3><label className="field"><span className="label">Piloto</span><Select aria-label="Piloto para adicionar" disabled={players.isPending || players.isError || !pilotOptions.length} value={adding} onChange={setAdding} options={[{ value: '', label: players.isPending ? 'Carregando pilotos…' : players.isError ? 'Não foi possível carregar os pilotos' : pilotOptions.length ? 'Selecione um piloto…' : 'Todos os pilotos cadastrados já estão no relatório' }, ...pilotOptions.map((pilot) => ({ value: pilot.id, label: pilot.nickname }))]} /></label><button type="button" className="btn ghost" disabled={!adding || !pilotOptions.some((pilot) => pilot.id === adding)} onClick={() => { const pilot = pilotOptions.find((item) => item.id === adding); if (pilot) change((current) => ({ ...current, pilots: [...current.pilots, { ...reportPilot(pilot.id, pilot.nickname, '', ''), attended: true }] })); setAdding(''); }}>Adicionar ao relatório</button>
          {players.error && <p role="alert">{errorMessage(players.error)} <button type="button" className="btn ghost sm" onClick={() => { void players.refetch(); }}>Tentar novamente</button></p>}
        </div>
      </section>}
      {step === 1 && <section className="report-results"><div className="report-section-title"><span className="label">02 / Apuração individual</span><h2>Resultados de cada piloto</h2><p>Preencha os dados e confira cada piloto. SAM e veículo antiaéreo são categorias distintas para o mesmo alvo não ser contado duas vezes.</p></div>
        {!attended.length && <div className="card report-section"><p>Não há pilotos marcados como participantes. Revise a participação ou avance para publicar uma operação sem participantes.</p></div>}
        {attended.map((pilot) => { const calculation = preview(pilot); const open = expanded === pilot.userId; return <article key={pilot.userId} className="card report-pilot"><button type="button" className="report-pilot-toggle" aria-expanded={open} aria-controls={`result-${pilot.userId}`} onClick={() => setExpanded(open ? '' : pilot.userId)}><span><strong>{pilot.nickname}</strong><small>{pilot.aircraftName || 'Aeronave não informada'}</small></span><span className={`ms-badge ${pilot.reviewed ? 'ok' : 'info'}`}>{pilot.reviewed ? 'Conferido' : 'Pendente'}</span><strong>{fmtPoints(calculation.total)} PM</strong><span aria-hidden="true">{open ? '−' : '+'}</span></button>
          {open && <div className="report-pilot-body" id={`result-${pilot.userId}`}>
            <div className="report-counts">{REPORT_TARGETS.map(({ key, label, transport }) => <label className="field" key={key}><span>{label}<small>{fmtPoints(report.rules[key])} PM {transport ? 'por objetivo' : 'por alvo'}</small></span><input className="input" type="number" min={0} max={10000} step={1} required value={pilot.counts[key]} onChange={(event) => updatePilot(pilot.userId, { counts: { ...pilot.counts, [key]: Math.max(0, Math.floor(Number(event.target.value) || 0)) } })} /></label>)}</div>
            <div className="report-survival"><label className="field"><span className="label">O piloto foi abatido?</span><Select aria-label={`Sobrevivência de ${pilot.nickname}`} value={pilot.survived === null ? '' : pilot.survived ? 'survived' : 'downed'} onChange={(value) => updatePilot(pilot.userId, { survived: value === '' ? null : value === 'survived' })} options={[{ value: '', label: 'Selecione…' }, { value: 'survived', label: 'Não — sobreviveu' }, { value: 'downed', label: 'Sim — foi abatido' }]} /></label><div><span>Subtotal: {fmtPoints(calculation.subtotal)} PM</span><span>Bônus da aeronave: {calculation.aircraftMultiplier.toLocaleString('pt-BR')}× (+{fmtPoints(calculation.aircraftBonus)} PM)</span><span>Bônus de sobrevivência: {calculation.multiplier.toLocaleString('pt-BR')}× (+{fmtPoints(calculation.survivalBonus)} PM)</span><strong>Total: {fmtPoints(calculation.total)} PM</strong></div></div>
            <label className="field"><span className="label">Observações do piloto (opcional)</span><textarea className="input" rows={3} maxLength={2000} value={pilot.notes} onChange={(event) => updatePilot(pilot.userId, { notes: event.target.value })} /></label>
            <button type="button" className="btn" disabled={pilot.survived === null || !pilot.aircraftId} onClick={() => { updatePilot(pilot.userId, { reviewed: true }); setExpanded(attended.find((item) => item.userId !== pilot.userId && !item.reviewed)?.userId ?? ''); }}>Conferir resultado de {pilot.nickname}</button>
          </div>}
        </article>; })}
      </section>}
      {step === 2 && <section className="card report-section"><span className="label">03 / Revisão final</span><h2>Relatório pós-missão</h2><label className="field"><span className="label">Resumo da operação</span><textarea className="input" rows={5} maxLength={10000} value={report.summary} placeholder="Descreva o resultado geral, objetivos e acontecimentos da operação…" onChange={(event) => change((current) => ({ ...current, summary: event.target.value }))} /></label><label className="field"><span className="label">Referência da apuração (opcional)</span><input className="input" maxLength={2000} value={report.source} placeholder="Ex.: relatório do servidor ou identificação do debriefing" onChange={(event) => change((current) => ({ ...current, source: event.target.value }))} /></label>
        <div className="report-review-list">{report.pilots.map((pilot) => <div key={pilot.userId}><span><strong>{pilot.nickname}</strong><small>{pilot.attended === null ? 'Participação pendente' : !pilot.attended ? 'Não participou' : pilot.survived === null ? 'Sobrevivência pendente' : pilot.survived ? 'Sobreviveu' : 'Foi abatido'} · {pilot.aircraftName || 'Aeronave não informada'}</small></span><span className={`ms-badge ${pilot.reviewed ? 'ok' : 'info'}`}>{pilot.reviewed ? 'Conferido' : 'Pendente'}</span><strong>{fmtPoints(preview(pilot).total)} PM</strong></div>)}</div>
        <div className="report-summary-total"><span>{attended.length} participantes</span><strong>{fmtPoints(total)} PM no total</strong></div>
        {!ready && <p className="op-error" role="alert">Confirme a participação e confira o resultado de todos os pilotos antes de publicar.</p>}
        <label className="report-confirm"><input type="checkbox" checked={confirmed} disabled={!ready} onChange={(event) => setConfirmed(event.target.checked)} /><span>Conferi os resultados. Ao publicar, a missão será finalizada, os pontos serão distribuídos e o relatório ficará visível para os pilotos.</span></label>
        <button type="button" className="btn" disabled={!ready || !confirmed || save.isPending} onClick={() => save.mutate(true)}>Publicar relatório e finalizar missão</button>
      </section>}
    </fieldset>
    {aircraft.error && <p className="op-error" role="alert">{errorMessage(aircraft.error)}</p>}
    {save.error && <p className="op-error" role="alert">{errorMessage(save.error)}</p>}{message && <p role="status">{message}</p>}
    <footer className="card report-editor-footer"><div><span className="label">Prévia da operação</span><strong>{fmtPoints(total)} PM · {attended.length} pilotos</strong><small>Os valores e o multiplicador deste relatório serão preservados.</small></div><div className="ms-actions"><button type="submit" className="btn ghost" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar rascunho'}</button>{step > 0 && <button type="button" className="btn ghost" disabled={save.isPending} onClick={() => goToStep(step - 1)}>Voltar</button>}{step < 2 && <button type="button" className="btn" disabled={save.isPending || pendingParticipation.length > 0} onClick={() => goToStep(step + 1)}>Próxima etapa →</button>}</div></footer>
  </form>;
}

export function MissionReportEditor() {
  const { id = '' } = useParams();
  const mission = useMission(id, { poll: false });
  const report = useQuery({ queryKey: ['admin', 'mission-report', id], queryFn: () => api.get<MissionReport>(`/admin/missions/${id}/report`), enabled: !!id });
  return <div className="report-editor-page"><Link className="op-back" to="/admin/missoes">← Administração de missões</Link>
    {(mission.isLoading || report.isLoading) && <p className="loading">Preparando relatório…</p>}
    {(mission.error || report.error) && <div role="alert"><p>{errorMessage(mission.error || report.error)}</p><button type="button" className="btn ghost" onClick={() => { void mission.refetch(); void report.refetch(); }}>Tentar novamente</button></div>}
    {report.data?.state === 'published' ? <section className="card report-section"><h2>Relatório publicado</h2><p>Esta missão já foi finalizada e os pontos foram distribuídos.</p><Link className="btn" to={`/missoes/${id}/relatorio`}>Ver relatório publicado</Link></section> : mission.data && report.data && <ReportEditor key={id} mission={mission.data} initial={report.data} />}
  </div>;
}
