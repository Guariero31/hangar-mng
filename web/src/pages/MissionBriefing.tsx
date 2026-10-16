import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMission } from '../api/hooks';
import { errorMessage } from '../api/client';
import './missions.css';

function BriefingFrame({ url, title }: { url: string; title: string }) {
  // Keep background mission refreshes from restarting the map or its audio.
  const [source] = useState(url);
  // Sandboxed documents have an opaque origin, so the default 'src' allowlist cannot match them.
  return <iframe title={title} src={source} sandbox="allow-scripts" allow="autoplay *; fullscreen *" referrerPolicy="no-referrer" />;
}

export function MissionBriefing() {
  const { id = '' } = useParams();
  const { data: mission, isLoading, error, refetch } = useMission(id);
  const viewer = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  async function fullscreen() {
    try { await viewer.current?.requestFullscreen(); }
    catch { setFullscreenError('Tela cheia indisponível neste navegador. Você pode usar o visualizador abaixo.'); }
  }
  return <div className="mission-briefing-page">
    <header className="mission-briefing-toolbar">
      <Link to={`/missoes/${id}`}>← Voltar à operação</Link>
      <h1>{mission?.title || 'Carregando briefing…'}</h1>
      {started && <button type="button" className="btn ghost" onClick={fullscreen}>Tela cheia</button>}
    </header>
    {isLoading && <p className="loading">Preparando briefing…</p>}
    {error && <div role="alert"><p>{errorMessage(error)}</p><button className="btn ghost" onClick={() => refetch()}>Tentar novamente</button></div>}
    {mission && !mission.briefingAsset && <p className="muted">Esta operação ainda não tem um briefing interativo.</p>}
    {fullscreenError && <p role="status">{fullscreenError}</p>}
    {mission?.briefingAsset && <>
      <div ref={viewer} className="mission-briefing-viewer">
        {!started ? <div className="mission-briefing-start"><span className="label">Pronto para a operação?</span><h2>{mission.title}</h2><p>Abra o cenário interativo para explorar os objetivos e o plano da missão. Use os controles do briefing para navegar e ativar o áudio.</p><button className="btn" onClick={() => setStarted(true)}>Iniciar briefing</button></div>
          : <BriefingFrame key={mission.briefingAsset.id} title={`Briefing interativo: ${mission.title}`} url={mission.briefingAsset.url} />}
      </div>
    </>}
  </div>;
}
