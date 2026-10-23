import { Link } from 'react-router-dom';
import { missionPath } from '../lib/mission-path';
import { useMissions } from '../api/hooks';
import { errorMessage } from '../api/client';
import { fmtPoints } from '../lib/format';
import type { Mission } from '../api/types';
import './missions.css';

export const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function DateBlock({ iso }: { iso: string }) {
  const date = new Date(iso);
  return <div className="ms-date" aria-label={`${fmtWhen(iso)} · Brasília`}>
    <span className="ms-day">{date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' })}</span>
    <span className="ms-mon">{date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'short' }).replace('.', '')}</span>
    <span className="ms-time">{date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</span>
  </div>;
}

export function Chips({ m, showResult }: { m: Mission; showResult?: boolean }) {
  const count = m.signups.length;
  const attended = m.signups.filter((signup) => signup.attended);
  return <div className="ms-count"><b>{count}</b> {count === 1 ? 'inscrito' : 'inscritos'}
    {showResult && <> · <b>{attended.length}</b> voaram · <b>{fmtPoints(attended.reduce((total, signup) => total + signup.pmAwarded, 0))}</b> PM</>}
  </div>;
}

function MissionCard({ mission }: { mission: Mission }) {
  return <Link to={missionPath(mission, mission.hasReport ? '/relatorio' : '')} className="ms-operation-card">
    <DateBlock iso={mission.startsAt} />
    <div className="ms-body">
      <div className="ms-head"><h2>{mission.title}</h2>
        <span className={`ms-badge ${mission.status === 'closed' ? 'off' : mission.mine ? 'ok' : 'info'}`}>
          {mission.status === 'closed' ? 'Encerrada' : mission.mine ? 'Inscrito' : 'Inscrições abertas'}
        </span>
      </div>
      <span className="muted">{mission.mapName || 'Mapa a definir'} · Horário de Brasília</span>
      {mission.briefing && <p className="ms-card-excerpt">{mission.briefing}</p>}
      <Chips m={mission} showResult={mission.status === 'closed'} />
    </div>
    <span className="ms-card-link">{mission.hasReport ? 'Ver relatório →' : 'Ver operação →'}</span>
  </Link>;
}

export function Missions() {
  const { data, isLoading, error, refetch } = useMissions();
  return <>
    <div className="page-head"><div><span className="label">Operações</span><h1>Missões</h1>
      <p>Conheça a operação, leia o briefing e escolha sua aeronave na página da missão.</p>
    </div></div>
    {isLoading && <p className="muted">Carregando missões…</p>}
    {error && <div role="alert"><p>{errorMessage(error)}</p><button className="btn ghost" onClick={() => refetch()}>Tentar novamente</button></div>}
    {data && <>
      <section className="ms-list"><h2 className="label">Próximas operações</h2>
        {!data.upcoming.length && <p className="muted">Nenhuma missão agendada.</p>}
        {data.upcoming.map((mission) => <MissionCard key={mission.id} mission={mission} />)}
      </section>
      {!!data.past.length && <section className="ms-list ms-past"><h2 className="label">Operações encerradas</h2>
        {data.past.map((mission) => <MissionCard key={mission.id} mission={mission} />)}
      </section>}
    </>}
  </>;
}
