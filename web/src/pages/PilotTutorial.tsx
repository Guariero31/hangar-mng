import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMe, useSetTutorialStatus } from '../api/hooks';
import { errorMessage } from '../api/client';
import './pilot-tutorial.css';

export function PilotTutorial({ replay = false }: { replay?: boolean }) {
  const { data: me } = useMe();
  const save = useSetTutorialStatus();
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const [step, setStep] = useState<'welcome' | 'video' | 'finish'>('welcome');
  const [videoError, setVideoError] = useState(false);
  const [playBlocked, setPlayBlocked] = useState(false);

  if (!me) return null;

  function start() {
    setStep('video');
    setVideoError(false);
    setPlayBlocked(false);
    // Keep playback within the user's click gesture, including on mobile Safari.
    video.current?.play().catch(() => setPlayBlocked(true));
  }

  function leave(status: 'completed' | 'skipped') {
    video.current?.pause();
    save.mutate(status, { onSuccess: () => navigate('/', { replace: true }) });
  }

  return (
    <div className="pilot-tutorial">
      <header className="tutorial-header">
        <div className="tutorial-brand"><img src="/mng-logo-128.png" alt="" width={44} height={44} /><div><strong>HANGAR MNG</strong><span>ESQUADRÃO VIRTUAL</span></div></div>
        {replay && <Link className="btn ghost sm" to="/">Voltar ao Hangar</Link>}
      </header>
      <main className={`tutorial-main ${step === 'video' ? 'is-video' : ''}`}>
        {step === 'welcome' && <section className="tutorial-intro">
          <span className="tutorial-eyebrow">{replay ? 'Conheça sua base de operações' : 'Seu primeiro passo no esquadrão'}</span>
          <h1>{replay ? 'Seu guia para o primeiro voo.' : <>Bem-vindo ao Hangar,<br />{me.nickname}.</>}</h1>
          <p>Sua jornada começa aqui. Antes do primeiro voo, conheça sua base de operações e descubra como evoluir com o esquadrão.</p>
          <ul className="tutorial-topics"><li>Conquiste aeronaves</li><li>Participe das missões</li><li>Construa sua trajetória</li></ul>
          <div className="tutorial-actions"><button className="btn primary" onClick={start}>▶ Iniciar apresentação</button><button className="btn ghost" disabled={save.isPending} onClick={() => leave('skipped')}>{save.isPending ? 'Salvando…' : 'Assistir depois'}</button></div>
          <p className="tutorial-note">Você pode rever o tutorial a qualquer momento em Ajuda.</p>
        </section>}
        <section className="tutorial-player" hidden={step !== 'video'} aria-label="Tutorial do Hangar MNG">
          <span className="tutorial-eyebrow">Conheça sua base de operações</span>
          <h1>Seu guia para o primeiro voo.</h1>
          <video ref={video} controls playsInline preload="none" poster="/tutorial/capa.svg" onEnded={() => { setStep('finish'); save.mutate('completed'); }} onError={() => setVideoError(true)}>
            <source src="/tutorial/apresentacao-v2.mp4" type="video/mp4" />
            <track kind="captions" src="/tutorial/apresentacao-v2.vtt" srcLang="pt-BR" label="Português" />
            Seu navegador não suporta a reprodução deste vídeo.
          </video>
          {videoError && <p role="alert">Não foi possível carregar o vídeo. Você pode continuar e tentar novamente em Ajuda.</p>}
          {playBlocked && !videoError && <p className="tutorial-note">Toque no botão de reprodução do vídeo para começar.</p>}
          <div className="tutorial-player-footer"><span>Apresentação do Hangar MNG</span><button className="btn ghost" disabled={save.isPending} onClick={() => leave('skipped')}>Assistir depois</button></div>
        </section>
        {step === 'finish' && <section className="tutorial-intro">
          <div className="tutorial-check" aria-hidden="true">✓</div>
          <span className="tutorial-eyebrow">Apresentação concluída</span>
          <h1>Tudo pronto, piloto.</h1>
          <p>O Hangar é seu ponto de partida. Explore as aeronaves disponíveis e prepare-se para sua próxima missão com o MNG.</p>
          <div className="tutorial-actions"><button className="btn primary" disabled={save.isPending} onClick={() => leave('completed')}>{save.isPending ? 'Salvando…' : 'Entrar no Hangar →'}</button><button className="btn ghost" disabled={save.isPending} onClick={() => { if (video.current) video.current.currentTime = 0; start(); }}>Rever apresentação</button></div>
        </section>}
        {save.error && <p className="tutorial-save-error" role="alert">{errorMessage(save.error)} Tente novamente.</p>}
      </main>
      <footer className="tutorial-footer"><ol aria-label="Etapas da apresentação"><li aria-current={step === 'welcome' ? 'step' : undefined}>01 · Boas-vindas</li><li aria-current={step === 'video' ? 'step' : undefined}>02 · Apresentação</li><li aria-current={step === 'finish' ? 'step' : undefined}>03 · Pronto para voar</li></ol><span>HANGAR MNG</span></footer>
    </div>
  );
}
