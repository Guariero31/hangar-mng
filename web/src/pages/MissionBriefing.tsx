import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMission } from '../api/hooks';
import { errorMessage } from '../api/client';
import { fmtWhen } from './Missions';
import './missions.css';

// Volume da música: ambiente, bem baixo (8% do máximo).
const MUSIC_VOLUME = 0.08;

function BriefingFrame({ url, title }: { url: string; title: string }) {
  // Keep background mission refreshes from restarting the map or its audio.
  const [source] = useState(url);
  // Sandboxed documents have an opaque origin, so the default 'src' allowlist cannot match them.
  return <iframe title={title} src={source} sandbox="allow-scripts" allow="autoplay *; fullscreen *" referrerPolicy="no-referrer" />;
}

export function MissionBriefing() {
  const { id = '' } = useParams();
  const { data: mission, isLoading, error, refetch } = useMission(id, { poll: false });
  const viewer = useRef<HTMLDivElement>(null);
  const music = useRef<HTMLAudioElement>(null);
  // O servidor assina um link novo a cada recarga da missão. Trocar o src no meio da música
  // faz o navegador recarregar o arquivo e parar, então o link fica fixo na primeira vez.
  const musicUrl = useRef('');
  if (!musicUrl.current && mission?.audioAsset) musicUrl.current = mission.audioAsset.url;
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  // A música só existe nesta tela: pára ao sair.
  useEffect(() => () => { music.current?.pause(); }, []);
  function start() {
    setStarted(true);
    if (music.current) music.current.volume = MUSIC_VOLUME;
    // Chamado direto do clique, para o navegador permitir o som.
    void music.current?.play().catch(() => setMuted(true));
  }
  async function fullscreen() {
    try { await viewer.current?.requestFullscreen(); }
    catch { setFullscreenError('Tela cheia indisponível neste navegador. Você pode usar o visualizador abaixo.'); }
  }
  return <div className="mission-briefing-page">
    <header className="mission-briefing-toolbar">
      <Link to={`/missoes/${id}`}>← Voltar à operação</Link>
      <h1>{mission?.title || 'Carregando briefing…'}</h1>
      {started && mission?.audioAsset && <button type="button" className="btn ghost" aria-pressed={!muted} onClick={() => { const next = !muted; setMuted(next); if (!next) void music.current?.play().catch(() => undefined); }}>{muted ? '🔇 Música desligada' : '🔊 Música'}</button>}
      {started && <button type="button" className="btn ghost" onClick={fullscreen}>Tela cheia</button>}
    </header>
    {isLoading && <p className="loading">Preparando briefing…</p>}
    {error && <div role="alert"><p>{errorMessage(error)}</p><button className="btn ghost" onClick={() => refetch()}>Tentar novamente</button></div>}
    {mission && !mission.briefingAsset && <p className="muted">Esta operação ainda não tem um briefing interativo.</p>}
    {fullscreenError && <p role="status">{fullscreenError}</p>}
    {musicUrl.current && <audio ref={music} src={musicUrl.current} loop preload="auto" muted={muted} onEnded={(event) => { event.currentTarget.currentTime = 0; void event.currentTarget.play().catch(() => undefined); }} />}
    {mission?.briefingAsset && <>
      <div ref={viewer} className="mission-briefing-viewer">
        {!started ? <div className="mission-briefing-start">
          <img className="briefing-watermark" src="/mng-logo.png" alt="" aria-hidden="true" />
          <div className="briefing-intro-content">
            <div className="briefing-brand"><img src="/mng-logo-128.png" alt="Brasão MNG" /><div><strong>HANGAR MNG</strong><span>Central de operações</span></div></div>
            <span className="label briefing-intro-label">Briefing de missão <span aria-hidden="true">/</span> Prepare-se para voar</span>
            <h2>{mission.title}</h2>
            <p className="briefing-intro-description">Toda operação começa com um bom plano. Conheça o cenário, identifique os objetivos e prepare seu voo com o esquadrão.</p>
            <dl className="briefing-intro-facts"><div><dt>Teatro de operações</dt><dd>{mission.mapName || 'A definir'}</dd></div><div><dt>Horário de Brasília</dt><dd>{fmtWhen(mission.startsAt)}</dd></div></dl>
            <button className="btn briefing-start-button" onClick={start}>Iniciar briefing <span aria-hidden="true">↗</span></button>
            <span className="briefing-intro-hint">Explore o mapa interativo e use os controles para navegar.</span>
          </div>
          <div className="briefing-intro-footer"><span>MNG <span aria-hidden="true">/</span> Planejar. Coordenar. Voar.</span><span>Briefing interativo</span></div>
        </div>
          : <BriefingFrame key={mission.briefingAsset.id} title={`Briefing interativo: ${mission.title}`} url={mission.briefingAsset.url} />}
      </div>
    </>}
  </div>;
}
