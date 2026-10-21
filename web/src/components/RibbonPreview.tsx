import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MissionRibbon } from '../api/types';
import { RibbonImage } from './RibbonImage';
import './medal-preview.css';
import './ribbon-preview.css';

export function RibbonPreview({ ribbon }: { ribbon: MissionRibbon }) {
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
    <button ref={trigger} type="button" className="ribbon-preview-trigger" aria-label={`Ver condecoração ${ribbon.name}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <RibbonImage id={ribbon.id} version={ribbon.imageVersion} width={180} name={ribbon.name} />
    </button>
    {open && createPortal(<dialog ref={dialog} className="medal-preview ribbon-preview" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="medal-preview-panel">
        <button type="button" className="medal-preview-close btn ghost" aria-label="Fechar condecoração ampliada" autoFocus onClick={() => setOpen(false)}>✕</button>
        <span className="label">Condecoração da operação</span>
        <h2 id={titleId}>{ribbon.name}</h2>
        <div className="ribbon-preview-art"><RibbonImage id={ribbon.id} version={ribbon.imageVersion} width={480} name={ribbon.name} /></div>
        <p id={descriptionId}>{ribbon.description || 'Esta condecoração não possui descrição cadastrada.'}</p>
      </section>
    </dialog>, document.body)}
  </>;
}
