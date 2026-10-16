import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './select.css';

interface Option { value: string | number; label: string }
interface SelectProps {
  value: string | number;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label': string;
}

export function Select({ value, options, onChange, disabled, 'aria-label': label }: SelectProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 300 });
  const search = useRef({ text: '', time: 0 });
  const selected = options.findIndex((option) => String(option.value) === String(value));
  const expanded = open && !disabled && options.length > 0;
  function show() { setActive(Math.max(0, selected)); setOpen(true); }
  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(String(option.value)); setOpen(false); trigger.current?.focus();
  }
  useLayoutEffect(() => {
    if (!expanded) return;
    function place() {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upwards = below < 180 && above > below;
      const height = Math.min(300, options.length * 42 + 12, upwards ? above : below);
      const width = Math.min(rect.width, window.innerWidth - 16);
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: upwards ? Math.max(8, rect.top - height - 6) : rect.bottom + 6, width, maxHeight: Math.max(40, height) });
    }
    place();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !list.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [expanded, options.length]);
  useEffect(() => {
    const container = list.current;
    const option = document.getElementById(`${id}-${active}`);
    if (!expanded || !container || !option) return;
    if (option.offsetTop < container.scrollTop) container.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = option.offsetTop + option.offsetHeight - container.clientHeight;
  }, [expanded, active, id]);
  return <>
    <button ref={trigger} type="button" role="combobox" className="input system-select" aria-label={label} aria-expanded={expanded}
      aria-controls={expanded ? id : undefined} aria-haspopup="listbox" aria-activedescendant={expanded ? `${id}-${active}` : undefined}
      disabled={disabled || !options.length} onClick={() => expanded ? setOpen(false) : show()}
      onBlur={(event) => { if (!list.current?.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={(event) => {
        if (event.key === 'Tab') { setOpen(false); return; }
        if (event.key === 'Escape') { if (expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); } return; }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          if (!expanded) { show(); return; }
          setActive((index) => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); if (expanded) choose(active); else show();
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          const now = Date.now();
          search.current = { text: (now - search.current.time < 700 ? search.current.text : '') + event.key.toLocaleLowerCase(), time: now };
          const index = options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(search.current.text));
          if (index >= 0) { setActive(index); setOpen(true); }
        }
      }}>
      <span>{options[selected]?.label ?? 'Selecione…'}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {expanded && createPortal(<div ref={list} id={id} role="listbox" aria-label={label} className="system-select-menu" style={position}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" aria-selected={selected === index}
        className={`system-select-option ${active === index ? 'is-active' : ''}`} onPointerMove={() => setActive(index)}
        onPointerDown={(event) => event.preventDefault()} onClick={(event) => { event.preventDefault(); choose(index); }}>
        <span>{option.label}</span><span className="system-select-check" aria-hidden="true">{selected === index ? '✓' : ''}</span>
      </div>)}
    </div>, document.body)}
  </>;
}
