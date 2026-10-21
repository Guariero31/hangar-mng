import { Link, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import type { MissionReport } from '../api/types';
import { useMe, useMission } from '../api/hooks';
import { RibbonImage } from '../components/RibbonImage';
import '../components/ribbon-image.css';
import { fmtPoints } from '../lib/format';
import { reportWhen } from '../lib/mission-report';
import './mission-report.css';

export function MissionReportPage() {
  const { id = '' } = useParams();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [id]);
  const mission = useMission(id, { poll: false });
  const awards = useQuery({ queryKey: ['mission-awards', id], queryFn: () => api.get<{ userId: string; nickname: string; ribbonId: string; valor: boolean }[]>(`/missions/${id}/awards`), enabled: !!id });
  const me = useMe();
  const { data: report, isLoading, error, refetch } = useQuery({ queryKey: ['mission-report', id], queryFn: () => api.get<MissionReport>(`/missions/${id}/report`), enabled: !!id });
  return <div className="published-report"><Link className="op-back" to={`/missoes/${id}`}>← Voltar à operação</Link>
    {(isLoading || mission.isLoading) && <p className="loading">Carregando relatório…</p>}
    {(error || mission.error) && <div role="alert"><h1>Relatório indisponível</h1><p>{errorMessage(error || mission.error)}</p><button type="button" className="btn ghost" onClick={() => { void refetch(); void mission.refetch(); }}>Tentar novamente</button></div>}
    {report && mission.data && <>
      <header className="card report-published-head"><span className="label">Hangar MNG / Debriefing</span><h1>{mission.data.title}</h1><span className="ms-badge ok">Relatório publicado</span><p>{mission.data.mapName || 'Mapa não informado'} · {reportWhen(mission.data.startsAt)} · Brasília</p>
        <div className="report-published-stats"><div><span>Participantes</span><strong>{report.pilots.filter((pilot) => pilot.attended).length}</strong></div><div><span>PM distribuídos</span><strong>{fmtPoints(report.total)}</strong></div><div><span>Sobreviventes</span><strong>{report.pilots.filter((pilot) => pilot.attended && pilot.survived).length}</strong></div></div>
      </header>
      {report.summary && <section className="card report-section"><span className="label">Resumo da operação</span><p className="report-narrative">{report.summary}</p></section>}
      <div className="report-section-title"><span className="label">Apuração individual</span><h2>Resultados dos pilotos</h2><p>Resultados publicados pela administração. Os valores abaixo usam as regras registradas nesta operação.</p></div>
      {!report.pilots.length && <p>Nenhum piloto participou desta operação.</p>}
      {report.pilots.map((pilot) => <details key={pilot.userId} className={`card report-pilot ${me.data?.id === pilot.userId ? 'is-me' : ''}`} open={me.data?.id === pilot.userId}>
        <summary className="report-pilot-toggle"><span><strong>{pilot.nickname}{me.data?.id === pilot.userId ? ' · Você' : ''}</strong><small>{pilot.aircraftName}</small></span><span className={`ms-badge ${pilot.attended ? pilot.survived ? 'ok' : 'info' : 'off'}`}>{!pilot.attended ? 'Não participou' : pilot.survived ? 'Sobreviveu' : 'Foi abatido'}</span><strong>{fmtPoints(pilot.total)} PM</strong><span aria-hidden="true">⌄</span></summary>
        <div className="report-pilot-body">
          {pilot.attended ? <><div className="report-breakdown">{pilot.breakdown.filter((item) => item.quantity > 0).map((item) => <div key={item.key}><span>{item.label}<small>{item.quantity} × {fmtPoints(item.unitPoints)} PM</small></span><strong>{fmtPoints(item.points)} PM</strong></div>)}{!pilot.breakdown.some((item) => item.quantity > 0) && <p>Nenhum alvo ou objetivo contabilizado.</p>}</div>
            <dl className="report-final-calculation"><div><dt>Subtotal</dt><dd>{fmtPoints(pilot.subtotal)} PM</dd></div>{(pilot.aircraftMultiplier ?? 1) !== 1 && <div><dt>Bônus da aeronave ({(pilot.aircraftMultiplier ?? 1).toLocaleString('pt-BR')}×)</dt><dd>+{fmtPoints(pilot.aircraftBonus ?? 0)} PM</dd></div>}<div><dt>Bônus de sobrevivência ({pilot.multiplier.toLocaleString('pt-BR')}×)</dt><dd>+{fmtPoints(pilot.survivalBonus ?? Math.round(pilot.subtotal * (pilot.multiplier - 1)))} PM</dd></div><div><dt>Total recebido</dt><dd>{fmtPoints(pilot.total)} PM</dd></div></dl></> : <p>Sem participação confirmada. Nenhum ponto foi distribuído.</p>}
          {pilot.notes && <div><span className="label">Observações</span><p className="report-narrative">{pilot.notes}</p></div>}
        </div>
      </details>)}
      {!!awards.data?.length && <section className="card report-section"><span className="label">Reconhecimento</span><h2>Condecorações concedidas</h2>
        <ul className="op-ribbons">{awards.data.map((a) => { const r = mission.data?.ribbons?.find((x) => x.id === a.ribbonId); return <li key={`${a.userId}:${a.ribbonId}`}>{r?.hasImage && <RibbonImage id={r.id} version={r.imageVersion} width={130} valor={a.valor} name={r.name} />}<div><strong>{a.nickname}</strong><p className="muted">{r?.name ?? 'Condecoração'}{a.valor ? ' · com valor' : ''}</p></div></li>; })}</ul>
      </section>}
      <footer className="card report-section report-publication"><span className="label">Registro da publicação</span><p>Publicado por <strong>{report.publishedBy || 'Administração'}</strong>{report.publishedAt ? ` em ${reportWhen(report.publishedAt)} · Brasília` : ''}.</p>{report.source && <><span className="label">Referência da apuração</span><p className="report-narrative">{report.source}</p></>}<small className="muted">Relatório disponível apenas para consulta. Os resultados não podem ser alterados pelos pilotos.</small></footer>
    </>}
  </div>;
}
