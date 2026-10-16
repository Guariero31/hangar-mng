import { useEffect, useRef, useState } from 'react';
import { useMarkNewsSeen, useNews } from '../api/hooks';
import { MedalArt } from './MedalArt';
import { fmtDate, fmtSigned } from '../lib/format';

/** Sino no topo: o que o admin lançou para o piloto desde a última visita */
export function NewsBell() {
  const { data } = useNews();
  const markSeen = useMarkNewsSeen();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(data?.items ?? []);
  const box = useRef<HTMLDivElement>(null);
  const unread = data?.unread ?? 0;

  // fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function toggle() {
    if (!open) {
      setSnapshot(data?.items ?? []); // mantém o destaque de "não lida" enquanto a lista está aberta
      if (unread) markSeen.mutate();
    }
    setOpen(!open);
  }

  return (
    <div className="news" ref={box}>
      <button
        type="button"
        className="news-btn"
        aria-label={unread ? `${unread} novidade(s)` : 'Novidades'}
        aria-expanded={open}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
          d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" /></svg>
        {unread > 0 && <span className="news-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="news-pop" role="dialog" aria-label="Novidades">
          <div className="news-head label">Novidades</div>
          {snapshot.length === 0
            ? <div className="news-empty">Nada novo por enquanto. Quando o admin lançar PM, você ganhar uma conquista ou sua meta ficar disponível, aparece aqui.</div>
            : (
              <ul className="news-list">
                {snapshot.map((n, i) => (
                  <li key={i} className={n.unread ? 'unread' : ''}>
                    <span className={n.icon || n.kind === 'goal' || n.kind === 'mission' ? 'news-medal' : ''}>{(n.kind === 'goal' || n.kind === 'mission') && <span className="news-goal" aria-hidden="true">{n.kind === 'goal' ? '★' : '✈'}</span>}{n.icon && n.rarity && <MedalArt className="news-medal-art" icon={n.icon} rarity={n.rarity} />}{n.reason}</span>
                    {n.amount !== 0 ? <span className={`amt ${n.amount > 0 ? 'pos' : 'neg'}`}>{fmtSigned(n.amount)} PM</span> : <span />}
                    <span className="when">{fmtDate(n.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}
