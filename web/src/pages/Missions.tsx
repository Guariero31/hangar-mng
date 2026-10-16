import { useState } from 'react';
import { useMe, useMissions, useMissionSignup, useTechTree } from '../api/hooks';
import { errorMessage } from '../api/client';
import { fmtPoints } from '../lib/format';
import type { Mission } from '../api/types';
import './admin/admin.css';
import './missions.css';

export const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function DateBlock({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <div className="ms-date" aria-label={fmtWhen(iso)}>
      <span className="ms-day">{d.toLocaleDateString('pt-BR', { day: '2-digit' })}</span>
      <span className="ms-mon">{d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
      <span className="ms-time">{d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  );
}

export function Chips({ m, showResult }: { m: Mission; showResult?: boolean }) {
  const n = m.signups.length;
  const flew = m.signups.filter((s) => s.attended).length;
  const total = m.signups.filter((s) => s.attended).reduce((a, s) => a + s.pmAwarded, 0);
  return (
    <div className="ms-count">
      <b>{n}</b> {n === 1 ? 'inscrito' : 'inscritos'}
      {showResult && <> · <b>{flew}</b> {flew === 1 ? 'voou' : 'voaram'} · <b>{fmtPoints(total)}</b> PM</>}
    </div>
  );
}

function MissionCard({ m, owned }: { m: Mission; owned: { id: string; name: string }[] }) {
  const signup = useMissionSignup();
  const [pick, setPick] = useState(m.mine?.aircraftId ?? '');
  const [err, setErr] = useState('');
  const go = (aircraftId: string | null) => {
    setErr('');
    signup.mutate({ id: m.id, aircraftId }, { onError: (e) => setErr(errorMessage(e)) });
  };
  return (
    <article className="ms-item">
      <DateBlock iso={m.startsAt} />
      <div className="ms-body">
      <div className="ms-head"><h3>{m.title}</h3>{m.mine && <span className="ms-badge ok">Inscrito</span>}</div>
      {m.briefing && <p className="ms-brief">{m.briefing}</p>}
      <Chips m={m} />
      
      {err && <div className="muted" role="alert">{err}</div>}
      </div>
      <div className="ms-actions">
        <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Aeronave">
          <option value="">Escolha a aeronave…</option>
          {owned.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button className="btn" disabled={!pick || signup.isPending || pick === m.mine?.aircraftId} onClick={() => go(pick)}>
          {m.mine ? 'Trocar aeronave' : 'Inscrever-se'}
        </button>
        {m.mine && <button className="btn ghost" disabled={signup.isPending} onClick={() => go(null)}>Cancelar inscrição</button>}
      </div>
    </article>
  );
}

export function Missions() {
  useMe();
  const { data, isLoading, error } = useMissions();
  const tree = useTechTree();
  const owned = (tree.data?.aircraft ?? []).filter((a) => a.owned).map((a) => ({ id: a.id, name: a.name }));
  return (
    <>
      <div className="page-head">
        <div>
          <span className="label">Operações</span>
          <h1>Missões</h1>
          <p>Inscreva-se com uma aeronave da sua frota. O PM é lançado depois que o admin encerra a missão.</p>
        </div>
      </div>
      {isLoading && <p className="muted">Carregando…</p>}
      {error && <p className="muted">{errorMessage(error)}</p>}
      <section className="ms-list">
        <span className="label">Próximas</span>
        {data && !data.upcoming.length && <p className="muted">Nenhuma missão agendada.</p>}
        {data?.upcoming.map((m) => <MissionCard key={m.id} m={m} owned={owned} />)}
      </section>
      {!!data?.past.length && (
        <section className="ms-list" style={{ marginTop: 32 }}>
          <span className="label">Encerradas</span>
          {data.past.map((m) => (
            <article key={m.id} className="ms-item">
              <DateBlock iso={m.startsAt} />
              <div className="ms-body">
              <div className="ms-head"><h3>{m.title}</h3></div>
              <div className="ms-pilots">
                {m.signups.filter((s) => s.attended).length} pilotos voaram.
                {m.mine && (m.mine.attended ? ` Você voou de ${m.mine.aircraftName}${m.mine.pmAwarded ? ` e recebeu ${fmtPoints(m.mine.pmAwarded)} PM` : ''}.` : ' Você se inscreveu, mas não foi marcado como presente.')}
              </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
