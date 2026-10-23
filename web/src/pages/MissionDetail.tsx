import { useToast } from '../components/Toast';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCancelMission, useRemoveMissionSignup, useMe, useMission, useMissionSignup, useTechTree } from '../api/hooks';
import { errorMessage } from '../api/client';
import type { Mission } from '../api/types';
import { preserveAssetUrl } from '../lib/asset-url';
import { Select } from '../components/Select';
import { fmtPoints } from '../lib/format';
import { DateBlock, fmtWhen } from './Missions';
import { RibbonPreview } from '../components/RibbonPreview';
import { MissionShare } from '../components/MissionShare';
import '../components/ribbon-image.css';
import './missions.css';

const STATUS = { scheduled: 'Inscrições abertas', closed: 'Operação encerrada', cancelled: 'Operação cancelada' } as const;

function Participation({ mission }: { mission: Mission }) {
  const tree = useTechTree();
  const signup = useMissionSignup();
  const [pick, setPick] = useState(mission.mine?.aircraftId ?? '');
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setPick(mission.mine?.aircraftId ?? ''); }, [mission.mine?.aircraftId]);
  const owned = tree.data?.aircraft.filter((aircraft) => aircraft.owned) ?? [];
  const submit = (aircraftId: string | null) => {
    setError(''); setMessage('');
    signup.mutate({ id: mission.id, aircraftId }, {
      onSuccess: () => { const feedback = aircraftId ? (mission.mine ? 'Aeronave atualizada.' : 'Inscrição confirmada. Bom voo!') : 'Inscrição cancelada.'; setMessage(feedback); toast(feedback); },
      onError: (exception) => setError(errorMessage(exception)),
    });
  };
  return <aside className="card op-participation" aria-labelledby="participation-title">
    <span className="label">Prepare-se para voar</span><h2 id="participation-title">Sua participação</h2>
    {mission.status !== 'scheduled' ? <>
      <p>{mission.status === 'cancelled' ? 'Esta operação foi cancelada.' : mission.mine?.attended ? `Você voou de ${mission.mine.aircraftName} e recebeu ${fmtPoints(mission.mine.pmAwarded)} PM.` : mission.mine ? 'Sua presença não foi confirmada nesta operação.' : 'Você não participou desta operação.'}</p>
      <span className="muted">As inscrições estão encerradas.</span>
    </> : <>
      {mission.mine && <p className="op-signed">Inscrição confirmada · <strong>{mission.mine.aircraftName}</strong></p>}
      <p className="muted">Escolha uma aeronave da sua frota para esta operação.</p>
      {tree.isLoading && <p className="muted">Carregando sua frota…</p>}
      {tree.error && <div role="alert"><p>{errorMessage(tree.error)}</p><button className="btn ghost" onClick={() => tree.refetch()}>Recarregar frota</button></div>}
      {tree.data && !owned.length && <p>Você não tem aeronaves disponíveis. <Link to="/">Ver árvore de aeronaves</Link></p>}
      <form onSubmit={(event) => { event.preventDefault(); if (owned.some((aircraft) => aircraft.id === pick)) submit(pick); }}>
        <label className="field"><span className="label">Sua aeronave</span>
          <Select aria-label="Sua aeronave" value={pick} onChange={(value) => { setPick(value); setMessage(''); setError(''); }} disabled={signup.isPending || !tree.data}
            options={[{ value: '', label: 'Escolha uma aeronave…' }, ...owned.map((aircraft) => ({ value: aircraft.id, label: aircraft.name }))]} />
        </label>
        <button className="btn block" disabled={signup.isPending || !owned.some((aircraft) => aircraft.id === pick) || pick === mission.mine?.aircraftId}>
          {signup.isPending ? 'Salvando…' : mission.mine ? 'Trocar aeronave' : 'Confirmar inscrição'}
        </button>
      </form>
      {mission.mine && <button className="btn ghost block" disabled={signup.isPending} onClick={() => submit(null)}>Cancelar inscrição</button>}
      {error && <p role="alert" className="op-error">{error}</p>}
      {message && <p role="status" className="op-signed">{message}</p>}
    </>}
    <div className="op-reward"><span className="label">Pontos de missão</span>
      <strong>{mission.defaultPm == null ? 'A definir' : `${fmtPoints(mission.defaultPm)} PM sugeridos`}</strong>
      <p className="muted">A presença e o valor final são confirmados pela administração ao encerrar a missão.</p>
    </div>
  </aside>;
}

function MissionManagement({ mission }: { mission: Mission }) {
  const { data: me } = useMe();
  const cancel = useCancelMission();
  const [error, setError] = useState('');
  const toast = useToast();
  const [message, setMessage] = useState('');
  if (me?.role !== 'admin' || (mission.status !== 'scheduled' && !message)) return null;

  function cancelOperation() {
    if (!window.confirm(`Cancelar "${mission.title}" para todos os pilotos? As inscrições serão encerradas e nenhum PM será lançado.`)) return;
    setError('');
    cancel.mutate(mission.id, {
      onSuccess: () => { setMessage('Operação cancelada. As inscrições foram encerradas.'); toast('Operação cancelada.'); },
      onError: (exception) => setError(errorMessage(exception)),
    });
  }

  return <section className="card op-section">
    <span className="label">Administração</span><h2>Gerenciar operação</h2>
    {message ? <p role="status">{message}</p> : <>
      <p className="muted">O cancelamento encerra as inscrições desta missão para todos os pilotos, sem lançar PM.</p>
      <button type="button" className="btn danger" disabled={cancel.isPending} onClick={cancelOperation}>
        {cancel.isPending ? 'Cancelando…' : 'Cancelar missão'}
      </button>
    </>}
    {error && <p className="op-error" role="alert">{error}</p>}
  </section>;
}

function MissionHero({ mission }: { mission: Mission }) {
  const asset = mission.imageAsset;
  const url = asset?.url || mission.briefingImageUrl;
  const [failed, setFailed] = useState(false);
  const [source, setSource] = useState({ url, expiresAt: asset?.expiresAt ?? 0 });
  useEffect(() => {
    setSource((current) => preserveAssetUrl(current, { url, expiresAt: asset?.expiresAt ?? 0 }));
  }, [url, asset?.expiresAt]);
  useEffect(() => { setFailed(false); }, [source.url]);
  const hasCover = !!source.url && !failed;
  return <header className={`card op-hero ${hasCover ? 'has-cover' : ''}`}>
    {hasCover && <>
      <img className="op-hero-image" src={source.url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      <a className="op-cover-link" href={source.url} target="_blank" rel="noopener noreferrer">Ver imagem completa <span aria-hidden="true">↗</span></a>
    </>}
    <DateBlock iso={mission.startsAt} />
    <div className="op-hero-heading"><span className="label">Hangar MNG / Operações</span><h1>{mission.title}</h1>
      <span className={`ms-badge ${mission.status === 'scheduled' ? 'info' : 'off'}`}>{STATUS[mission.status]}</span>
    </div>
    <dl className="op-facts"><div><dt>Início da operação</dt><dd>{fmtWhen(mission.startsAt)} · Brasília (UTC−3)</dd></div>
      <div><dt>Mapa</dt><dd>{mission.mapName || 'A definir'}</dd></div>
      <div><dt>Pilotos inscritos</dt><dd>{mission.signups.length}</dd></div>
    </dl>
  </header>;
}

export function MissionDetail() {
  const { id = '' } = useParams();
  const { data: mission, isLoading, error, refetch } = useMission(id);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [id]);
  return <div className="operation">
    <div className="op-page-actions"><Link className="op-back" to="/missoes">← Todas as missões</Link>{mission && <MissionShare key={mission.id} mission={mission} />}</div>
    {isLoading && <p className="loading">Carregando operação…</p>}
    {error && <div className="card op-section" role="alert"><h1>Operação indisponível</h1><p>{errorMessage(error)}</p><button className="btn ghost" onClick={() => refetch()}>Tentar novamente</button></div>}
    {mission && <>
      <MissionHero key={`${mission.id}:${mission.imageAsset?.id || mission.briefingImageUrl}`} mission={mission} />
      <div className="op-layout">
        <Participation key={mission.id} mission={mission} />
        <div className="op-content">
          {mission.hasReport && <section className="card op-section op-interactive-callout"><span className="label">Operação concluída</span><h2>Relatório pós-missão disponível</h2><p className="muted">Consulte os resultados de cada piloto e o detalhamento dos pontos distribuídos.</p><Link className="btn" to={`/missoes/${mission.id}/relatorio`}>Ver relatório →</Link></section>}
          <section className="card op-section"><span className="label">Informações da missão</span><h2>Briefing da operação</h2>
            {mission.briefing.trim() ? <div className="op-briefing">{mission.briefing.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
              : <p className="muted">O briefing será publicado pela administração. Volte antes do início da operação para conferir os detalhes.</p>}
          </section>
          {mission.ribbons?.some((ribbon) => ribbon.hasImage) && <section className="card op-section"><span className="label">Reconhecimento</span><h2>Condecorações desta operação</h2>
            <p className="muted">A administração pode conceder estas fitas aos pilotos que cumprirem os requisitos.</p>
            <ul className="operation-ribbon-gallery">{mission.ribbons.filter((ribbon) => ribbon.hasImage).map((ribbon) => <li key={ribbon.id}><RibbonPreview ribbon={ribbon} /></li>)}</ul>
          </section>}
          {mission.briefingAsset && <section className="card op-section op-interactive-callout"><span className="label">Experiência interativa</span><h2>Briefing da missão</h2><p className="muted">Explore o cenário, os objetivos e os materiais da operação. Ative a música pelos controles do briefing.</p><Link className="btn" to={`/missoes/${mission.id}/briefing`}>Abrir briefing interativo →</Link></section>}
          <MissionManagement key={`management:${mission.id}`} mission={mission} />
          <MissionRoster key={`roster:${mission.id}`} mission={mission} />
        </div>
      </div>
    </>}
  </div>;
}

function MissionRoster({ mission }: { mission: Mission }) {
  const me = useMe();
  const remove = useRemoveMissionSignup();
  const toast = useToast();
  const [selected, setSelected] = useState<Mission['signups'][number] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const canRemove = me.data?.role === 'admin' && mission.status === 'scheduled';
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
    if (!selected && dialog.current?.open) dialog.current.close();
  }, [selected]);
  return <section className="card op-section"><div className="op-section-head"><h2>{mission.status === 'closed' ? 'Participação e resultados' : 'Pilotos inscritos'}</h2><span className="ms-badge">{mission.signups.length} pilotos</span></div>
    {!mission.signups.length ? <p className="muted">Nenhum piloto inscrito.</p> : <ul className="op-roster">{mission.signups.map(pilot => <li key={pilot.userId}>
      <span className="op-pilot-initial" aria-hidden="true">{(pilot.nickname || '?').slice(0, 1)}</span><div><strong>{pilot.nickname || 'Piloto'}</strong><span className="muted">{pilot.aircraftName}</span></div>
      {pilot.userId === mission.mine?.userId && <span className="ms-badge ok">Você</span>}
      {mission.status === 'closed' && <span className="op-result">{pilot.attended ? `${fmtPoints(pilot.pmAwarded)} PM · presente` : 'Não confirmado'}</span>}
      {canRemove && <button type="button" className="btn ghost danger sm" aria-label={`Remover ${pilot.nickname} do evento`} disabled={remove.isPending} onClick={() => { remove.reset(); setSelected(pilot); }}>Remover</button>}
    </li>)}</ul>}
    <dialog ref={dialog} className="roster-remove-dialog" aria-labelledby="roster-remove-title" onCancel={(event) => { if (remove.isPending) event.preventDefault(); else setSelected(null); }} onClose={() => setSelected(null)}>
      <h2 id="roster-remove-title">Remover inscrição?</h2><p>Remover <strong>{selected?.nickname}</strong> de <strong>{mission.title}</strong>?</p><p className="muted">Isso remove apenas a inscrição neste evento. O piloto poderá se inscrever novamente enquanto a missão estiver aberta.</p>
      {remove.error && <p role="alert" className="op-error">{errorMessage(remove.error)}</p>}
      <div className="ms-actions"><button type="button" className="btn ghost" disabled={remove.isPending} onClick={() => setSelected(null)}>Cancelar</button><button type="button" className="btn danger" disabled={remove.isPending || !selected} onClick={() => { if (selected) remove.mutate({ missionId: mission.id, userId: selected.userId }, { onSuccess: () => { setSelected(null); toast('Inscrição removida do evento.'); } }); }}>{remove.isPending ? 'Removendo…' : 'Remover inscrição'}</button></div>
    </dialog>
  </section>;
}
