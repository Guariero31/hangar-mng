import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminMissions, useCloseMission, useSaveMission } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { fmtPoints } from '../../lib/format';
import type { Mission } from '../../api/types';
import { Chips, DateBlock, fmtWhen } from '../Missions';
import { AdminTabs } from './AdminTabs';
import './admin.css';
import '../missions.css';

const toLocalInput = (iso: string) => {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso)).replace(' ', 'T');
};

function MissionForm({ editing, onDone }: { editing: Mission | null; onDone: () => void }) {
  const save = useSaveMission();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [briefing, setBriefing] = useState(editing?.briefing ?? '');
  const [mapName, setMapName] = useState(editing?.mapName ?? '');
  const [briefingImageUrl, setBriefingImageUrl] = useState(editing?.briefingImageUrl ?? '');
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
      title, briefing, mapName, briefingImageUrl, startsAt: new Date(`${date}T${time}:00-03:00`).toISOString(),
      defaultPm: pm.trim() === '' ? null : Number(pm),
      ...(editing ? {} : { repeatWeeks: Number(repeat) || 0 }),
    };
    save.mutate({ id: editing?.id, input }, { onSuccess: onDone, onError: (x) => setErr(errorMessage(x)) });
  }

  return (
    <form className="card mission-editor" onSubmit={submit}>
      <header className="mission-editor-head"><div><span className="label">Planejamento da operação</span>
        <h2>{editing ? 'Editar missão' : 'Nova missão'}</h2><p>Prepare as informações que os pilotos vão consultar antes de voar.</p></div>
        <span className="ms-badge info">{editing ? 'Agendada' : 'Novo evento'}</span>
      </header>
      <div className="mission-editor-layout"><div className="mission-editor-fields">
      <fieldset className="mission-editor-section"><legend><span>01</span> Informações da missão</legend>
      <div className="mission-editor-grid">
        <label className="field"><span className="label">Título</span><input className="input" value={title} maxLength={80} required onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field"><span className="label">Mapa</span><input className="input" maxLength={80} placeholder="Ex.: Syria, Caucasus…" value={mapName} onChange={(event) => setMapName(event.target.value)} /></label>
      </div></fieldset>
      <fieldset className="mission-editor-section"><legend><span>02</span> Agendamento e recompensa</legend>
      <p className="mission-section-hint">Todos os horários seguem Brasília (UTC−3).</p>
      <div className="mission-editor-grid">
        <label className="field"><span className="label">Data da missão</span><input className="input" type="date" value={date} required onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span className="label">Hora (Brasília)</span><input className="input" type="time" value={time} required onChange={(e) => setTime(e.target.value)} /></label>
        <label className="field"><span className="label">PM sugerido</span><input className="input" type="number" min={0} max={1000000} step={1} placeholder="A definir" value={pm} onChange={(e) => setPm(e.target.value)} /><span className="hint">O valor final é confirmado ao encerrar.</span></label>
        {!editing && (
          <label className="field"><span className="label">Repetir semanalmente</span>
            <select className="input" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              <option value="0">Não repetir</option>
              {[1, 2, 3, 4, 6, 8, 12].map((n) => <option key={n} value={n}>+{n} {n === 1 ? 'semana' : 'semanas'}</option>)}
            </select>
          </label>
        )}
      </div></fieldset>
      <fieldset className="mission-editor-section"><legend><span>03</span> Briefing e material de apoio</legend>
        <div className="mission-brief-tools"><p className="mission-section-hint">Organize contexto, objetivos, plano de voo e comunicações.</p>
          {!briefing && <button type="button" className="btn ghost sm" onClick={() => setBriefing('CONTEXTO\n\nOBJETIVOS\n\nPLANO DE VOO\n\nAMEAÇAS\n\nCOMUNICAÇÕES')}>Usar roteiro</button>}
        </div>
        <label className="field"><span className="label">Briefing</span><textarea className="input mission-brief-input" rows={10} maxLength={2000} placeholder="Descreva o que os pilotos precisam saber…" value={briefing} onChange={(e) => setBriefing(e.target.value)} /><span className="mission-character-count">{briefing.length} / 2.000 caracteres</span></label>
        <label className="field"><span className="label">Imagem do mapa / briefing <small>Opcional</small></span><input className="input" type="url" placeholder="https://…" maxLength={2000} value={briefingImageUrl} onChange={(event) => setBriefingImageUrl(event.target.value)} /><span className="hint">Use o endereço HTTPS de uma imagem acessível aos pilotos.</span></label>
      </fieldset>
      </div><aside className="mission-editor-preview" aria-label="Prévia da missão">
        <span className="label">Resumo da operação</span><h3>{title.trim() || 'Nome da missão'}</h3>
        <dl><div><dt>Mapa</dt><dd>{mapName.trim() || 'A definir'}</dd></div><div><dt>Data e hora</dt><dd>{date && time ? `${fmtWhen(new Date(`${date}T${time}:00-03:00`).toISOString())} · Brasília` : 'Defina o agendamento'}</dd></div><div><dt>Recompensa sugerida</dt><dd>{pm.trim() ? `${fmtPoints(Number(pm))} PM` : 'A definir'}</dd></div>
          {!editing && <div><dt>Recorrência</dt><dd>{repeat === '0' ? 'Evento único' : `+${repeat} semanas`}</dd></div>}
        </dl><div className="mission-preview-note"><span aria-hidden="true">↗</span><p>Os pilotos leem o briefing e escolhem a aeronave na página da operação.</p></div>
        {editing && <Link to={`/missoes/${editing.id}`} target="_blank" rel="noopener noreferrer">Ver página publicada →</Link>}
      </aside></div>
      <footer className="mission-editor-footer">
        <div>{err ? <p className="op-error" role="alert">{err}</p> : <p className="muted">{editing ? 'As alterações serão exibidas aos pilotos após salvar.' : 'A missão ficará disponível para inscrições após a criação.'}</p>}</div>
        <div className="ms-actions"><button type="button" className="btn ghost" disabled={save.isPending} onClick={onDone}>Cancelar edição</button><button className="btn" disabled={save.isPending}>{save.isPending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar missão'}</button></div>
      </footer>
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
    if (!confirm(`Finalizar "${m.title}" e distribuir PM? ${attendees.length} pilotos, ${fmtPoints(total)} PM no total. Isso não pode ser desfeito.`)) return;
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
        <button className="btn ok" disabled={close.isPending} onClick={submit}>Confirmar e distribuir PM</button>
        <button className="btn ghost" onClick={onDone}>Voltar</button>
      </div>
    </div>
  );
}

const STATUS = { scheduled: 'Agendada', closed: 'Encerrada', cancelled: 'Cancelada' } as const;

export function MissionsAdmin() {
  const { data, isLoading, error } = useAdminMissions();
  const [form, setForm] = useState<{ editing: Mission | null } | null>(null);
  const [closing, setClosing] = useState<string | null>(null);

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
      {form && <MissionForm key={form.editing?.id ?? 'new'} editing={form.editing} onDone={() => setForm(null)} />}
      {isLoading && <p className="muted">Carregando…</p>}
      {error && <p className="muted">{errorMessage(error)}</p>}
      <section className="ms-list mission-admin-list">
        {data && !data.items.length && <p className="muted">Nenhuma missão cadastrada.</p>}
        {data?.items.map((m) => (
          <article key={m.id} className={`ms-item mission-admin-item${form?.editing?.id === m.id ? ' is-editing' : ''}`}>
            <DateBlock iso={m.startsAt} />
            <div className="ms-body">
            <div className="ms-head">
              <h3>{m.title}</h3>
              <span className={`ms-badge ${m.status === 'scheduled' ? 'info' : m.status === 'closed' ? 'ok' : 'off'}`}>{STATUS[m.status]}</span>
            </div>
            <span className="muted">{m.mapName || 'Mapa a definir'} · Horário de Brasília</span>
            {closing === m.id ? <ClosePanel m={m} onDone={() => setClosing(null)} /> : (
              <>
                <Chips m={m} showResult={m.status === 'closed'} />
                
              </>
            )}
            </div>
            {m.status === 'scheduled' && closing !== m.id && (
                    <div className="ms-actions">
                      <Link className="btn ghost" to={`/missoes/${m.id}`}>Ver operação</Link>
                      <button className="btn ghost" onClick={() => setForm({ editing: m })}>Editar</button>
                      <button className="btn" onClick={() => setClosing(m.id)}>Finalizar missão</button>
                    </div>
                  )}
          </article>
        ))}
      </section>
    </>
  );
}
