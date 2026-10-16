import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Achievement } from '../api/types';
import { MedalArt } from './MedalArt';
import { fmtDate } from '../lib/format';
import './medal-preview.css';

const RARITY = { common: 'Comum', rare: 'Rara', legendary: 'Lendária' } as const;

export function MedalPreview({ achievement }: { achievement: Achievement }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open || !dialog.current) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const element = dialog.current;
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="medal-preview-trigger" aria-label={`Ampliar medalha ${achievement.name}`}
      aria-haspopup="dialog" onClick={() => setOpen(true)} title="Clique para ampliar">
      <MedalArt className="medal-art" icon={achievement.icon} rarity={achievement.rarity} />
    </button>
    {open && createPortal(
      <dialog ref={dialog} className="medal-preview" aria-labelledby={titleId} aria-describedby={descriptionId}
        onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
        <section className="medal-preview-panel">
          <button type="button" className="medal-preview-close btn ghost" autoFocus onClick={() => setOpen(false)}
            aria-label="Fechar medalha ampliada">✕</button>
          <span className="label">{RARITY[achievement.rarity]} · {achievement.earnedAt ? 'Conquistada' : 'A conquistar'}</span>
          <h2 id={titleId}>{achievement.name}</h2>
          <div className="medal-preview-art" role="img" aria-label={`Medalha ${achievement.name} em alta resolução`}>
            <MedalArt icon={achievement.icon} rarity={achievement.rarity} large />
          </div>
          <p id={descriptionId}>{achievement.desc}</p>
          <span className="muted">{achievement.earnedAt
            ? `Conquistada em ${fmtDate(achievement.earnedAt)}`
            : achievement.hint ?? `${achievement.current.toLocaleString('pt-BR')} / ${achievement.target.toLocaleString('pt-BR')}`}</span>
        </section>
      </dialog>, document.body)}
  </>;
}
