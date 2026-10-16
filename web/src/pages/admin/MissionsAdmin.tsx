import { useState } from 'react';
import { useAdminMissions, useCancelMission, useCloseMission, useSaveMission } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { fmtPoints } from '../../lib/format';
import type { Mission } from '../../api/types';
import { Chips, DateBlock } from '../Missions';
import { AdminTabs } from './AdminTabs';
import './admin.css';
import '../missions.css';

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function MissionForm({ editing, onDone }: { editing: Mission | null; onDone: () => void }) {
  const save = useSaveMission();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [briefing, setBriefing] = useState(editing?.briefing ?? '');
  const [date, setDate] = useState(editing ? toLocalInput(editing.startsAt).slice(0, 10) : '');
  const [time, setTime] = useState(editing ? toLocalInput(editing.startsAt).slice(11) : '');
  const [pm, setPm] = useState(editing?.defaultPm != null ? String(editing.defaultPm) : '');
  const [repeat, setRepeat] = useState('0');
  const [err, setErr] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!date || !time) return setErr('Informe a data e a hora.');
    const input = {
      title, briefing, startsAt: new Date(`${date}T${time}`).toISOString(),
      defaultPm: pm.trim() === '' ? null : Number(pm),
      ...(editing ? {} : { repeatWeeks: Number(repeat) || 0 }),
    };
    save.mutate({ id: editing?.id, input }, { onSuccess: onDone, onError: (x) => setErr(errorMessage(x)) });
  }

  return (
    <form className="card ms-form-card" onSubmit={submit}>
      <span className="label">{editing ? 'Editar missão' : 'Nova missão'}</span>
      <div className="ms-form">
        <label className="field"><span className="label">Título</span><input className="input" value={title} maxLength={80} required onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field"><span className="label">Data</span><input className="input" type="date" value={date} required onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span className="label">Hora</span><input className="input" type="time" value={time} required onChange={(e) => setTime(e.target.value)} /></label>
        <label className="field"><span className="label">PM sugerido</span><input className="input" type="number" min={0} placeholder="Opcional" value={pm} onChange={(e) => setPm(e.target.value)} /></label>
        {!editing && (
          <label className="field"><span className="label">Repetir semanalmente</span>
            <select className="input" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              <option value="0">Não repetir</option>
              {[1, 2, 3, 4, 6, 8, 12].map((n) => <option key={n} value={n}>+{n} {n === 1 ? 'semana' : 'semanas'}</option>)}
            </select>
          </label>
        )}
        <label className="field wide"><span className="label">Briefing</span><textarea className="input" rows={4} maxLength={2000} value={briefing} onChange={(e) => setBriefing(e.target.value)} /></label>
      </div>
      {err && <p className="muted" role="alert">{err}</p>}
      <div className="ms-actions">
        <button className="btn" disabled={save.isPending}>{editing ? 'Salvar' : 'Criar missão'}</button>
        <button type="button" className="btn ghost" onClick={onDone}>Fechar</button>
      </div>
    </form>
  );
}

function ClosePanel({ m, onDone }: { m: Mission; onDone: () => void }) {
  const close = useCloseMission();
  const [rows, setRows] = useState(() => Object.fromEntries(m.signups.map((s) => [s.userId, { on: true, pm: String(m.defaultPm ?? 0) }])));
  const [err, setErr] = useState('');
  function submit() {
    const attendees = m.signups.filter((s) => rows[s.userId].on).map((s) => ({ userId: s.userId, pm: Math.max(0, Math.floor(Number(rows[s.userId].pm) || 0)) }));
    const total = attendees.reduce((a, b) => a + b.pm, 0);
    if (!confirm(`Encerrar "${m.title}"? ${attendees.length} pilotos, ${fmtPoints(total)} PM no total. Isso não pode ser desfeito.`)) return;
    close.mutate({ id: m.id, attendees }, { onSuccess: onDone, onError: (x) => setErr(errorMessage(x)) });
  }
  return (
    <div>
      <span className="label">Quem voou e quanto PM cada um recebe</span>
      {!m.signups.length && <p className="muted">Ninguém se inscreveu.</p>}
      {m.signups.map((s) => (
        <div key={s.userId} className="ms-close-row">
          <input type="checkbox" checked={rows[s.userId].on} onChange={(e) => setRows({ ...rows, [s.userId]: { ...rows[s.userId], on: e.target.checked } })} aria-label={`${s.nickname} voou`} />
          <span>{s.nickname} <span className="muted">· {s.aircraftName}</span></span>
          <input className="input" type="number" min={0} value={rows[s.userId].pm} disabled={!rows[s.userId].on}
            onChange={(e) => setRows({ ...rows, [s.userId]: { ...rows[s.userId], pm: e.target.value } })} aria-label={`PM de ${s.nickname}`} />
        </div>
      ))}
      {err && <p className="muted" role="alert">{err}</p>}
      <div className="ms-actions" style={{ marginTop: 12 }}>
        <button className="btn ok" disabled={close.isPending} onClick={submit}>Encerrar e lançar PM</button>
        <button className="btn ghost" onClick={onDone}>Voltar</button>
      </div>
    </div>
  );
}

const STATUS = { scheduled: 'Agendada', closed: 'Encerrada', cancelled: 'Cancelada' } as const;

export function MissionsAdmin() {
  const { data, isLoading, error } = useAdminMissions();
  const cancel = useCancelMission();
  const [form, setForm] = useState<{ editing: Mission | null } | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  return (
    <>
      <div className="page-head">
        <div>
          <span className="label">Administração</span>
          <h1>Missões</h1>
          <p>Agende eventos, veja as inscrições e, ao final, marque quem voou e lance o PM.</p>
        </div>
        {!form && <button className="btn" onClick={() => setForm({ editing: null })}>Nova missão</button>}
      </div>
      <AdminTabs />
      {msg && <div className="card" role="status">{msg}</div>}
      {form && <MissionForm key={form.editing?.id ?? 'new'} editing={form.editing} onDone={() => setForm(null)} />}
      {isLoading && <p className="muted">Carregando…</p>}
      {error && <p className="muted">{errorMessage(error)}</p>}
      <section className="ms-list">
        {data && !data.items.length && <p className="muted">Nenhuma missão cadastrada.</p>}
        {data?.items.map((m) => (
          <article key={m.id} className="ms-item">
            <DateBlock iso={m.startsAt} />
            <div className="ms-body">
            <div className="ms-head">
              <h3>{m.title}</h3>
              <span className={`ms-badge ${m.status === 'scheduled' ? 'info' : m.status === 'closed' ? 'ok' : 'off'}`}>{STATUS[m.status]}</span>
            </div>
            {m.briefing && <p className="ms-brief">{m.briefing}</p>}
            {closing === m.id ? <ClosePanel m={m} onDone={() => setClosing(null)} /> : (
              <>
                <Chips m={m} showResult={m.status === 'closed'} />
                
              </>
            )}
            </div>
            {m.status === 'scheduled' && closing !== m.id && (
                    <div className="ms-actions">
                      <button className="btn" onClick={() => setClosing(m.id)}>Encerrar…</button>
                      <button className="btn ghost" onClick={() => setForm({ editing: m })}>Editar</button>
                      <button className="btn danger" disabled={cancel.isPending} onClick={() => {
                        if (confirm(`Cancelar "${m.title}"?`)) cancel.mutate(m.id, { onSuccess: () => setMsg('Missão cancelada.'), onError: (e) => setMsg(errorMessage(e)) });
                      }}>Cancelar missão</button>
                    </div>
                  )}
          </article>
        ))}
      </section>
    </>
  );
}
