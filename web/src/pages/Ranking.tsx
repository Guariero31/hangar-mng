import { useEffect, useRef, useState } from 'react';
import { useRanking } from '../api/hooks';
import { errorMessage } from '../api/client';
import type { RankingItem, RankingPeriod } from '../api/types';
import { MedalStrip } from '../components/MedalStrip';
import { Pagination } from '../components/Pagination';
import { fmtPoints } from '../lib/format';
import './ranking.css';

const PAGE_SIZE = 20;

function PilotAvatar({ pilot, podium = false }: { pilot: RankingItem; podium?: boolean }) {
  return <span className={podium ? 'rk-portrait' : 'rk-row-avatar'}>
    {pilot.avatarUrl
      ? <img src={pilot.avatarUrl} alt="" referrerPolicy="no-referrer" />
      : <span aria-hidden="true">{pilot.nickname.slice(0, 1).toLocaleUpperCase('pt-BR')}</span>}
    {podium && <span className="rk-place-badge">{pilot.pos}</span>}
  </span>;
}

function Crown() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 5 5 4-7 4 7 5-5-3 12H6L3 6Zm3 15h12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

export function RankingPage() {
  const [period, setPeriod] = useState<RankingPeriod>('all');
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusRequested, setFocusRequested] = useState(false);
  const myRow = useRef<HTMLButtonElement>(null);
  const { data, isLoading, isFetching, error, refetch } = useRanking(offset, period);
  const personal = data?.personal;

  useEffect(() => {
    if (!focusRequested || !myRow.current || isFetching) return;
    myRow.current.scrollIntoView({ block: 'center', behavior: 'auto' });
    myRow.current.focus({ preventScroll: true });
    setFocusRequested(false);
  }, [data, focusRequested, isFetching]);

  function changePeriod(nextPeriod: RankingPeriod) {
    setPeriod(nextPeriod);
    setOffset(0);
    setExpandedId(null);
    setFocusRequested(false);
  }

  function findMe() {
    if (!data?.personal) return;
    setOffset(data.personal.pageOffset);
    setExpandedId(data.meId);
    setFocusRequested(true);
  }

  return (
    <div className="ranking-honor">
      <div className="rh-heading">
        <div>
          <p className="rh-eyebrow">Esquadrão MNG / DCS World</p>
          <h1>Quadro de honra.</h1>
          <p className="rh-description">{period === 'all'
            ? 'Cada missão conta. Estes são os pilotos que chegaram mais longe.'
            : `${data?.periodLabel ?? 'Este mês'} · Uma nova disputa a cada mês.`}</p>
        </div>
        <div className="rh-period" role="group" aria-label="Período do ranking">
          <button type="button" aria-pressed={period === 'all'} onClick={() => changePeriod('all')}>Geral</button>
          <button type="button" aria-pressed={period === 'month'} onClick={() => changePeriod('month')}>Este mês</button>
        </div>
      </div>

      {isLoading && <div className="loading" role="status">Carregando classificação…</div>}
      {error && <div className="empty" role="alert"><p>{errorMessage(error)}</p><button className="btn ghost" type="button" onClick={() => refetch()}>Tentar novamente</button></div>}

      {data && <>
        {data.podium.some(pilot => pilot.earned > 0) ? <section className="rh-honors" aria-label="Pódio do esquadrão">
          <img className="rh-watermark" src="/mng-logo.png" alt="" />
          <p className="rh-honors-title">Os destaques do esquadrão</p>
          <div className="rh-podium">
            {data.podium.map((pilot, index) => <article key={pilot.id} className={`rh-pilot slot-${index + 1} rank-${pilot.pos}`}>
              {index === 0 && <span className="rh-crown"><Crown /></span>}
              <PilotAvatar pilot={pilot} podium />
              <h2>{pilot.nickname}</h2>
              <div className="rh-medals"><MedalStrip medals={pilot.medals} size={25} /></div>
              <div className="rh-step">
                <p className="rh-place">{pilot.pos === 1 && pilot.tied === 1 ? 'Líder do esquadrão' : `${pilot.pos}º colocado${pilot.tied > 1 ? ' · empate' : ''}`}</p>
                <p className="rh-score">{fmtPoints(pilot.earned)}</p>
                <p className="rh-unit">Pontos de missão</p>
              </div>
            </article>)}
          </div>
        </section> : <section className="rh-start"><h2>A disputa está começando.</h2><p>Os primeiros PM ganhos {period === 'month' ? 'neste mês' : 'nas missões'} vão definir os destaques do esquadrão.</p></section>}

        {personal && <section className="rh-personal" aria-label="Sua posição no ranking" aria-live="polite">
          <span className="rh-my-position">{personal.pilot.pos}º</span>
          <div><h2>Seu lugar no esquadrão</h2><p>{personal.pilot.nickname} · {fmtPoints(personal.pilot.earned)} PM {period === 'month' ? 'neste mês' : 'acumulados'}</p></div>
          <div className="rh-pursuit">
            {personal.next ? <>
              <p>Faltam <strong>{fmtPoints(personal.gap)} PM</strong> para alcançar {personal.next.nickname}.</p>
              <div className="rh-track" role="progressbar" aria-label="Seus PM em relação ao próximo colocado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(personal.progress)}><span style={{ width: `${personal.progress}%` }} /></div>
            </> : <p>{personal.pilot.earned === 0 ? 'Sua próxima missão é o primeiro passo.' : personal.pilot.tied > 1 ? 'Você divide a liderança do esquadrão.' : 'Você lidera o esquadrão. Bons voos!'}</p>}
          </div>
          <button className="btn ghost sm" type="button" onClick={findMe} disabled={isFetching}>Minha posição</button>
        </section>}

        <section aria-label="Classificação dos pilotos">
          <div className="rh-list-heading"><h2>Classificação completa</h2><span>{data.total} {data.total === 1 ? 'piloto' : 'pilotos'} · {period === 'month' ? data.periodLabel : 'PM acumulados'}</span></div>
          <div className="rh-board" aria-busy={isFetching}>
            <div className="rh-columns" aria-hidden="true"><span>Pos.</span><span>Piloto</span><span>Medalhas</span><span>Frota</span><span>PM ganhos</span></div>
            <ol className="rh-list" start={offset + 1}>
              {data.items.map(pilot => {
                const isMe = pilot.id === data.meId;
                const expanded = expandedId === pilot.id;
                return <li key={pilot.id}>
                  <button type="button" className={`rh-row ${isMe ? 'is-me' : ''}`} ref={isMe ? myRow : undefined} aria-expanded={expanded} aria-controls={`rank-detail-${pilot.id}`} onClick={() => setExpandedId(expanded ? null : pilot.id)}>
                    <span className={`rh-number ${pilot.pos <= 3 ? 'is-top' : ''}`}>{String(pilot.pos).padStart(2, '0')}</span>
                    <span className="rh-identity"><PilotAvatar pilot={pilot} /><span><span className="rh-name">{pilot.nickname}{isMe && <span className="rh-you">Você</span>}</span><span className="rh-mobile-meta">{pilot.fleet} aeronaves · {pilot.medalCount} conquistas</span></span></span>
                    <span className="rh-row-medals"><MedalStrip medals={pilot.medals} size={22} />{pilot.medals.length === 0 && <span className="rh-no-medals">Sem medalhas</span>}</span>
                    <span className="rh-fleet">{pilot.fleet}<span> / {data.aircraftTotal}</span></span>
                    <span className="rh-points">{fmtPoints(pilot.earned)}<span className="rh-mobile-unit"> PM</span></span>
                  </button>
                  <div className="rh-details" id={`rank-detail-${pilot.id}`} hidden={!expanded}>
                    <span>Frota: <strong>{pilot.fleet} aeronaves</strong></span><span>Conquistas: <strong>{pilot.medalCount}</strong></span>
                    {pilot.tied > 1 && <span>Mesma pontuação de {pilot.tied - 1} {pilot.tied === 2 ? 'outro piloto' : 'outros pilotos'}.</span>}
                    <MedalStrip medals={pilot.medals} size={25} />
                  </div>
                </li>;
              })}
            </ol>
            {!data.items.length && <p className="empty">Nenhum piloto nesta página.</p>}
            <Pagination offset={offset} total={data.total} pageSize={PAGE_SIZE} busy={isFetching} onChange={nextOffset => { setOffset(nextOffset); setExpandedId(null); }} />
          </div>
          <div className="rh-note"><span>Gastar PM em aeronaves não reduz sua posição.</span><span>Selecione um piloto para ver os destaques.</span></div>
        </section>
      </>}
    </div>
  );
}
