import { useToast } from '../../components/Toast';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MissionFileUpload } from '../../components/MissionFileUpload';
import { useQuery } from '@tanstack/react-query';
import { Select } from '../../components/Select';
import { useAdminMissions, useDeleteMission, useSaveMission } from '../../api/hooks';
import { api, errorMessage } from '../../api/client';
import { fmtPoints } from '../../lib/format';
import type { Mission } from '../../api/types';
import { Chips, DateBlock, fmtWhen } from '../Missions';
import { AdminTabs } from './AdminTabs';
import './admin.css';
import './mission-card-actions.css';
import '../missions.css';

const toLocalInput = (iso: string) => {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso)).replace(' ', 'T');
};

function MissionForm({ editing, onDone }: { editing: Mission | null; onDone: () => void }) {
  const toast = useToast();
  const save = useSaveMission();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [briefing, setBriefing] = useState(editing?.briefing ?? '');
  const [mapName, setMapName] = useState(editing?.mapName ?? '');
  const [tier, setTier] = useState(editing?.tier != null ? String(editing.tier) : '');
  const tiers = useQuery({ queryKey: ['admin', 'tree'], queryFn: () => api.get<{ tiers: { tier: number; label: string }[] }>('/admin/tree') });
  const tierLabel = tiers.data?.tiers.find((item) => String(item.tier) === tier)?.label;
  const [briefingImageUrl, setBriefingImageUrl] = useState(editing?.briefingImageUrl ?? '');
  const [imageAsset, setImageAsset] = useState(editing?.imageAsset ?? null);
  const [briefingAsset, setBriefingAsset] = useState(editing?.briefingAsset ?? null);
  const [audioAsset, setAudioAsset] = useState(editing?.audioAsset ?? null);
  const [imageUploading, setImageUploading] = useState(false);
  const [briefingUploading, setBriefingUploading] = useState(false);
  const uploading = imageUploading || briefingUploading;
  const [date, setDate] = useState(editing ? toLocalInput(editing.startsAt).slice(0, 10) : '');
  const [time, setTime] = useState(editing ? toLocalInput(editing.startsAt).slice(11) : '');
  const [pm, setPm] = useState(editing?.defaultPm != null ? String(editing.defaultPm) : '');
  const [repeat, setRepeat] = useState('0');
  const [err, setErr] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (uploading) return;
    setErr('');
    if (!date || !time) return setErr('Informe a data e a hora.');
    if (!tier && (!editing || editing.tier != null)) return setErr('Escolha o tier da missão.');
    const input = {
      title, briefing, mapName, tier: tier ? Number(tier) : null, briefingImageUrl, startsAt: new Date(`${date}T${time}:00-03:00`).toISOString(),
      imageAssetId: imageAsset?.id ?? null, briefingAssetId: briefingAsset?.id ?? null, audioAssetId: audioAsset?.id ?? null,
      defaultPm: pm.trim() === '' ? null : Number(pm),
      ...(editing ? {} : { repeatWeeks: Number(repeat) || 0 }),
    };
    save.mutate({ id: editing?.id, input }, { onSuccess: () => { toast(editing ? 'Missão atualizada com sucesso.' : 'Missão criada com sucesso.'); onDone(); }, onError: (x) => setErr(errorMessage(x)) });
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
        <label className="field"><span className="label">Tier da missão</span><Select aria-label="Tier da missão" disabled={tiers.isPending || tiers.isError} value={tier} onChange={setTier} options={[{ value: '', label: tiers.isPending ? 'Carregando tiers…' : tiers.isError ? 'Não foi possível carregar os tiers' : 'Escolha o tier…' }, ...(tiers.data?.tiers ?? []).map((item) => ({ value: String(item.tier), label: `Tier ${item.label}` }))]} /></label>
      </div></fieldset>
      <fieldset className="mission-editor-section"><legend><span>02</span> Agendamento e recompensa</legend>
      <p className="mission-section-hint">Todos os horários seguem Brasília (UTC−3).</p>
      <div className="mission-editor-grid">
        <label className="field"><span className="label">Data da missão</span><input className="input" type="date" value={date} required onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span className="label">Hora (Brasília)</span><input className="input" type="time" value={time} required onChange={(e) => setTime(e.target.value)} /></label>
        <label className="field"><span className="label">PM sugerido</span><input className="input" type="number" min={0} max={1000000} step={1} placeholder="A definir" value={pm} onChange={(e) => setPm(e.target.value)} /><span className="hint">O valor final é confirmado ao encerrar.</span></label>
        {!editing && (
          <label className="field"><span className="label">Repetir semanalmente</span>
            <Select aria-label="Repetição da missão" value={repeat} onChange={setRepeat} options={[{ value: '0', label: 'Não repetir' }, ...[1, 2, 3, 4, 6, 8, 12].map((n) => ({ value: n, label: `+${n} ${n === 1 ? 'semana' : 'semanas'}` }))]} />
          </label>
        )}
      </div></fieldset>
      <fieldset className="mission-editor-section"><legend><span>03</span> Briefing e material de apoio</legend>
        <div className="mission-brief-tools"><p className="mission-section-hint">Organize contexto, objetivos, plano de voo e comunicações.</p>
          {!briefing && <button type="button" className="btn ghost sm" onClick={() => setBriefing('CONTEXTO\n\nOBJETIVOS\n\nPLANO DE VOO\n\nAMEAÇAS\n\nCOMUNICAÇÕES')}>Usar roteiro</button>}
        </div>
        <label className="field"><span className="label">Briefing</span><textarea className="input mission-brief-input" rows={10} maxLength={2000} placeholder="Descreva o que os pilotos precisam saber…" value={briefing} onChange={(e) => setBriefing(e.target.value)} /><span className="mission-character-count">{briefing.length} / 2.000 caracteres</span></label>
        <MissionFileUpload kind="image" value={imageAsset} onChange={setImageAsset} onBusy={setImageUploading} />
        {!imageAsset && <label className="field"><span className="label">Ou use um link de imagem <small>Opcional</small></span><input className="input" type="url" placeholder="https://…" maxLength={2000} value={briefingImageUrl} onChange={(event) => setBriefingImageUrl(event.target.value)} /></label>}
        <MissionFileUpload kind="briefing" value={briefingAsset} onChange={setBriefingAsset} onBusy={setBriefingUploading} />
        <MissionFileUpload kind="audio" value={audioAsset} onChange={setAudioAsset} onBusy={setBriefingUploading} />
      </fieldset>
      </div><aside className="mission-editor-preview" aria-label="Prévia da missão">
        <span className="label">Resumo da operação</span><h3>{title.trim() || 'Nome da missão'}</h3>
        <dl><div><dt>Mapa</dt><dd>{mapName.trim() || 'A definir'}</dd></div><div><dt>Tier</dt><dd>{tierLabel ? `Tier ${tierLabel}` : 'A definir'}</dd></div><div><dt>Data e hora</dt><dd>{date && time ? `${fmtWhen(new Date(`${date}T${time}:00-03:00`).toISOString())} · Brasília` : 'Defina o agendamento'}</dd></div><div><dt>Recompensa sugerida</dt><dd>{pm.trim() ? `${fmtPoints(Number(pm))} PM` : 'A definir'}</dd></div>
          {!editing && <div><dt>Recorrência</dt><dd>{repeat === '0' ? 'Evento único' : `+${repeat} semanas`}</dd></div>}
        </dl><div className="mission-preview-note"><span aria-hidden="true">↗</span><p>Os pilotos leem o briefing e escolhem a aeronave na página da operação.</p></div>
        {editing && <Link to={`/missoes/${editing.id}`} target="_blank" rel="noopener noreferrer">Ver página publicada →</Link>}
      </aside></div>
      <footer className="mission-editor-footer">
        <div>{err ? <p className="op-error" role="alert">{err}</p> : <p className="muted">{editing ? 'As alterações serão exibidas aos pilotos após salvar.' : 'A missão ficará disponível para inscrições após a criação.'}</p>}</div>
        <div className="ms-actions"><button type="button" className="btn ghost" disabled={save.isPending || uploading} onClick={onDone}>Cancelar edição</button><button className="btn" disabled={save.isPending || uploading}>{uploading ? 'Enviando arquivos…' : save.isPending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar missão'}</button></div>
      </footer>
    </form>
  );
}

const STATUS = { scheduled: 'Agendada', closed: 'Encerrada', cancelled: 'Cancelada' } as const;

export function MissionsAdmin() {
  const { data, isLoading, error } = useAdminMissions();
  const [form, setForm] = useState<{ editing: Mission | null } | null>(null);
  const toast = useToast();
  const remove = useDeleteMission();
  const [removeError, setRemoveError] = useState('');
  function apagar(m: Mission) {
    if (!confirm(`Apagar a missão "${m.title}"? Isso remove as inscrições e não pode ser desfeito.`)) return;
    setRemoveError('');
    remove.mutate(m.id, { onSuccess: () => toast('Missão apagada.'), onError: (x) => setRemoveError(errorMessage(x)) });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="label">Administração</span>
          <h1>Missões</h1>
          <p>Agende eventos, acompanhe as inscrições e publique o relatório pós-missão para distribuir os pontos.</p>
        </div>
        {!form && <button className="btn" onClick={() => setForm({ editing: null })}>Nova missão</button>}
      </div>
      <AdminTabs />
      {form && <MissionForm key={form.editing?.id ?? 'new'} editing={form.editing} onDone={() => setForm(null)} />}
      {isLoading && <p className="muted">Carregando…</p>}
      {error && <p className="muted">{errorMessage(error)}</p>}
      {removeError && <p className="op-error" role="alert">{removeError}</p>}
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
            <Chips m={m} showResult={m.status === 'closed'} />
            </div>
            <div className="ms-actions mission-card-actions">
              <Link className="mission-card-view" to={m.hasReport ? `/missoes/${m.id}/relatorio` : `/missoes/${m.id}`}>{m.hasReport ? 'Ver relatório' : 'Ver operação'} <span aria-hidden="true">↗</span></Link>
              {m.status === 'scheduled' && <button type="button" className="btn ghost sm mission-card-edit" aria-label={`Editar missão ${m.title}`} title="Editar missão" onClick={() => setForm({ editing: m })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5" /></svg></button>}
              {(m.status === 'scheduled' || !m.hasReport) && <MissionOptions mission={m} deleting={remove.isPending} onDelete={() => apagar(m)} />}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

function MissionOptions({ mission, deleting, onDelete }: { mission: Mission; deleting: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="mission-card-options" ref={container} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="btn ghost sm mission-card-more" aria-label={`Mais opções da missão ${mission.title}`} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>⋯</button>
    {open && <div id={id} className="mission-card-dropdown">
      {mission.status === 'scheduled' && <Link to={`/admin/missoes/${mission.id}/relatorio`} onClick={() => setOpen(false)}>Finalizar missão</Link>}
      {!mission.hasReport && <button type="button" className="mission-card-delete" disabled={deleting} onClick={() => { setOpen(false); onDelete(); }}>Apagar missão</button>}
    </div>}
  </div>;
}
