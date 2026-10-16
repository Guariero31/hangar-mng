import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMarkNewsSeen, useNews } from '../api/hooks';
import { MedalArt } from './MedalArt';
import { fmtDate, fmtSigned } from '../lib/format';
import './news-bell.css';

/** Sino no topo: o que o admin lançou para o piloto desde a última visita */
export function NewsBell() {
  const { data } = useNews();
  const markSeen = useMarkNewsSeen();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(data?.items ?? []);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [openingUnread, setOpeningUnread] = useState(0);
  const unread = data?.unread ?? 0;

  // fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function toggle() {
    if (!open) {
      setSnapshot(data?.items ?? []); // mantém o destaque de "não lida" enquanto a lista está aberta
      setOpeningUnread(unread);
      if (unread) markSeen.mutate();
    }
    setOpen(!open);
  }

  return (
    <div className="news" ref={box}>
      <button
        type="button"
        ref={trigger}
        className="news-btn"
        aria-label={unread ? `${unread} novidade(s)` : 'Novidades'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
          d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" /></svg>
        {unread > 0 && <span className="news-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div id={panelId} className="news-pop" role="dialog" aria-label="Central de notificações">
          <header className="news-panel-head">
            <div><span className="label">Hangar MNG</span><h2>Notificações</h2><p>{openingUnread ? `${openingUnread} ${openingUnread === 1 ? 'novidade desde sua última visita' : 'novidades desde sua última visita'}` : 'Você está em dia com o esquadrão'}</p></div>
            <button type="button" className="news-close" aria-label="Fechar notificações" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button>
          </header>
          {snapshot.length === 0
            ? <div className="news-empty"><span className="news-empty-symbol" aria-hidden="true">✓</span><strong>Tudo em dia por aqui</strong><p>Missões, conquistas e atualizações dos seus pontos aparecerão aqui.</p></div>
            : (
              <ul className="news-list">
                {snapshot.map((n, i) => (
                  <li key={i} className={`${n.unread ? 'unread' : ''} ${(n.kind === 'mission' || n.kind === 'report') && n.missionId ? 'has-mission-link' : ''}`}>
                    {(n.kind === 'mission' || n.kind === 'report') && n.missionId && <Link className="news-mission-link" to={`/missoes/${n.missionId}${n.kind === 'report' ? '/relatorio' : ''}`} aria-label={`${n.kind === 'report' ? 'Ver relatório' : 'Abrir operação'}: ${n.reason}`} onClick={() => setOpen(false)}><span aria-hidden="true">↗</span></Link>}
                    <span className={`news-item-icon is-${n.kind}`} aria-hidden="true">{n.icon && n.rarity ? <MedalArt className="news-medal-art" icon={n.icon} rarity={n.rarity} /> : n.kind === 'mission' || n.kind === 'grant' ? <svg viewBox="0 0 24 24" fill="none"><path d="m21 3-6 18-4-8-8-4 18-6Z M11 13 21 3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg> : n.kind === 'goal' ? '★' : <span className="news-pm-icon">PM</span>}</span>
                    <div className="news-item-copy"><span className="news-item-category">{{ mission: 'Operações', report: 'Relatório pós-missão', achievement: 'Conquistas', goal: 'Sua meta', grant: 'Sua frota', points: 'Pontos de missão' }[n.kind]}</span>
                      <strong>{n.reason}</strong>
                      <time dateTime={n.createdAt}>{fmtDate(n.createdAt)}</time>
                    </div>
                    <div className="news-item-status">{n.unread && <span className="news-unread-mark" aria-label="Não lida" />}{n.amount !== 0 && <span className={`amt ${n.amount > 0 ? 'pos' : 'neg'}`}>{fmtSigned(n.amount)} PM</span>}</div>
                  </li>
                ))}
              </ul>
            )}
          <footer className="news-panel-footer">Atualizações do seu esquadrão</footer>
        </div>
      )}
    </div>
  );
}
