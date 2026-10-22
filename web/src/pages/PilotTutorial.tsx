import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCompleteTutorialModule, useMe, useSetTutorialStatus } from '../api/hooks';
import { errorMessage } from '../api/client';
import { TUTORIAL_MODULES } from '../lib/tutorial';
import './pilot-tutorial.css';

export function PilotTutorial({ replay = false }: { replay?: boolean }) {
  const { data: me } = useMe();
  const save = useSetTutorialStatus();
  const complete = useCompleteTutorialModule();
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const [step, setStep] = useState<'welcome' | 'video' | 'finish'>('welcome');
  const [videoError, setVideoError] = useState(false);
  const [playBlocked, setPlayBlocked] = useState(false);
  const [moduleIndex, setModuleIndex] = useState(0);
  const [ended, setEnded] = useState(false);
  const activeModule = TUTORIAL_MODULES[moduleIndex];
  const completedModules = me?.tutorialModules ?? [];
  const nextModuleIndex = [1, 2, 3].map(offset => (moduleIndex + offset) % TUTORIAL_MODULES.length)
    .find(index => !completedModules.includes(TUTORIAL_MODULES[index].id)) ?? 0;

  useEffect(() => {
    if (step !== 'video') return;
    const player = video.current;
    let cancelled = false;
    player?.load();
    player?.play().catch(() => { if (!cancelled) setPlayBlocked(true); });
    return () => { cancelled = true; player?.pause(); };
  }, [moduleIndex, step]);

  if (!me) return null;

  function start(index = TUTORIAL_MODULES.findIndex(module => !completedModules.includes(module.id))) {
    video.current?.pause();
    if (step === 'video' && moduleIndex === index && video.current) {
      video.current.currentTime = 0;
      video.current.play().catch(() => setPlayBlocked(true));
    }
    setModuleIndex(index < 0 ? 0 : index);
    setStep('video');
    setVideoError(false);
    setPlayBlocked(false);
    setEnded(false);
    complete.reset();
  }

  function finishModule(moduleId: number) {
    complete.mutate(moduleId, { onSuccess: updated => {
      if (TUTORIAL_MODULES.every(module => updated.tutorialModules.includes(module.id))) setStep('finish');
    } });
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
          <ul className="tutorial-topics">{TUTORIAL_MODULES.map(module => <li key={module.id}>{module.title}</li>)}</ul>
          <div className="tutorial-actions"><button className="btn primary" onClick={() => start()}>▶ {completedModules.length > 0 && completedModules.length < 3 ? 'Continuar apresentação' : 'Iniciar apresentação'}</button><button className="btn ghost" disabled={save.isPending} onClick={() => leave('skipped')}>{save.isPending ? 'Salvando…' : 'Assistir depois'}</button></div>
          <p className="tutorial-note">3 módulos · {completedModules.length} de 3 concluídos. Assista no seu ritmo.</p>
          <p className="tutorial-note">Você pode rever o tutorial a qualquer momento em Ajuda.</p>
        </section>}
        <section className="tutorial-player" hidden={step !== 'video'} aria-label="Tutorial do Hangar MNG">
          <span className="tutorial-eyebrow">Módulo {activeModule.id} de 3</span>
          <h1>{activeModule.title}</h1>
          <div className="tutorial-workspace"><div className="tutorial-screen">
          <video ref={video} src={activeModule.video} controls playsInline preload="none" poster="/tutorial/capa.svg" onEnded={() => { setEnded(true); finishModule(activeModule.id); }} onError={() => setVideoError(true)}>
            <track key={activeModule.id} kind="captions" src={activeModule.captions} srcLang="pt-BR" label="Português" />
            Seu navegador não suporta a reprodução deste vídeo.
          </video>
          {videoError && <p role="alert">Não foi possível carregar o vídeo. Você pode continuar e tentar novamente em Ajuda.</p>}
          {playBlocked && !videoError && <p className="tutorial-note">Toque no botão de reprodução do vídeo para começar.</p>}
          {complete.error && <p role="alert" className="tutorial-save-error">Não foi possível salvar este módulo. <button className="btn sm" onClick={() => finishModule(activeModule.id)}>Tentar novamente</button></p>}
          <div className="tutorial-player-footer"><span aria-live="polite">{complete.isPending ? 'Salvando progresso…' : ended ? 'Módulo assistido' : activeModule.description}</span>
            {ended && completedModules.length < 3 && <button className="btn primary" disabled={complete.isPending || complete.isError} onClick={() => start(nextModuleIndex)}>Próximo módulo →</button>}
          </div></div>
          <aside className="tutorial-playlist" aria-label="Módulos do tutorial"><div className="tutorial-playlist-heading"><strong>Sua apresentação</strong><span>{completedModules.length} de 3 concluídos</span></div>
            {TUTORIAL_MODULES.map((module, index) => <button key={module.id} className="tutorial-module" aria-current={moduleIndex === index ? 'true' : undefined} onClick={() => start(index)} disabled={complete.isPending}>
              <span className="tutorial-module-number" aria-hidden="true">{completedModules.includes(module.id) ? '✓' : `0${module.id}`}</span><span><strong>{module.title}</strong><small>{completedModules.includes(module.id) ? 'Concluído' : moduleIndex === index ? 'Selecionado' : module.description}</small></span>
            </button>)}
            <button className="btn ghost" disabled={save.isPending || complete.isPending} onClick={() => leave('skipped')}>Continuar depois</button>
          </aside></div>
        </section>
        {step === 'finish' && <section className="tutorial-intro">
          <div className="tutorial-check" aria-hidden="true">✓</div>
          <span className="tutorial-eyebrow">Apresentação concluída</span>
          <h1>Tudo pronto, piloto.</h1>
          <p>O Hangar é seu ponto de partida. Explore as aeronaves disponíveis e prepare-se para sua próxima missão com o MNG.</p>
          <div className="tutorial-actions"><button className="btn primary" disabled={save.isPending} onClick={() => leave('completed')}>{save.isPending ? 'Salvando…' : 'Entrar no Hangar →'}</button><button className="btn ghost" disabled={save.isPending} onClick={() => start(0)}>Rever apresentação</button></div>
        </section>}
        {save.error && <p className="tutorial-save-error" role="alert">{errorMessage(save.error)} Tente novamente.</p>}
      </main>
      <footer className="tutorial-footer"><ol aria-label="Etapas da apresentação"><li aria-current={step === 'welcome' ? 'step' : undefined}>01 · Boas-vindas</li><li aria-current={step === 'video' ? 'step' : undefined}>02 · Apresentação</li><li aria-current={step === 'finish' ? 'step' : undefined}>03 · Pronto para voar</li></ol><span>HANGAR MNG</span></footer>
    </div>
  );
}
