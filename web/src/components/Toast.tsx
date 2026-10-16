import { createPortal } from 'react-dom';
import './toast.css';
import { MedalArt } from './MedalArt';
import type { MedalLite } from '../api/types';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Kind = 'ok' | 'err';
export interface ToastOptions {
  action?: { label: string; onClick: () => void };
  duration?: number;
  medal?: Pick<MedalLite, 'icon' | 'rarity'>;
}
type Show = (message: string, kind?: Kind, opts?: ToastOptions) => void;
interface Notice extends ToastOptions { id: number; message: string; kind: Kind; duration: number; expiresAt: number }
const ToastContext = createContext<Show>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const sequence = useRef(0);
  const dismiss = useCallback((id: number) => setNotices(current => current.filter(notice => notice.id !== id)), []);
  const show = useCallback<Show>((message, kind = 'ok', options = {}) => {
    const duration = options.duration ?? (options.action ? 8000 : 3200);
    const notice = { ...options, id: ++sequence.current, message, kind, duration, expiresAt: Date.now() + duration };
    setNotices(current => [...current, notice]);
  }, []);
  useEffect(() => {
    const timers = notices.map(notice => window.setTimeout(() => dismiss(notice.id), Math.max(0, notice.expiresAt - Date.now())));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [notices, dismiss]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(<div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {notices.map(notice => (
          <div key={notice.id} role="status" className={`toast show ${notice.kind} ${notice.action ? 'has-action' : ''} ${notice.medal ? 'has-medal' : ''}`}>
            {notice.medal && <MedalArt className="toast-medal" icon={notice.medal.icon} rarity={notice.medal.rarity} />}
            {!notice.medal && <span className="toast-symbol" aria-hidden="true">{notice.kind === 'ok' ? '✓' : '!'}</span>}
            <span>{notice.message}</span>
            {notice.action && <button type="button" className="toast-action" onClick={() => { dismiss(notice.id); notice.action?.onClick(); }}>{notice.action.label}</button>}
            <button type="button" className="toast-close" aria-label="Fechar aviso" onClick={() => dismiss(notice.id)}>×</button>
            {notice.action && <i className="toast-timer" style={{ animationDuration: `${notice.duration}ms` }} />}
          </div>
        ))}
      </div>, document.body)}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
