import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './info-tip.css';

/**
 * Ícone "i" que explica um número da tela. Abre ao passar o mouse, ao focar com o teclado ou ao tocar,
 * e fecha com Esc ou ao clicar fora. O balão é desenhado fora do card para nunca ser cortado.
 */
export function InfoTip({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 320 });
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const rect = button.current.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
    setPos({ top: rect.bottom + 8, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setPinned(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { close(); button.current?.focus(); } };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !pop.current?.contains(target)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button} type="button" className="info-tip-btn" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => { const next = !(open && pinned); setOpen(next); setPinned(next); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => { if (!pinned) setOpen(false); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!pinned) setOpen(false); }}
      ><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 7v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="8" cy="4.6" r="1" fill="currentColor" /></svg></button>
      {open && createPortal(
        <div ref={pop} id={id} role="tooltip" className="info-tip-pop" style={{ top: pos.top, left: pos.left, width: pos.width }}>
          {title && <strong>{title}</strong>}
          {children}
        </div>, button.current?.closest('.tt') ?? document.body)}
    </>
  );
}
