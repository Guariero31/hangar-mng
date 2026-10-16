import { MedalArt } from './MedalArt';
import type { MedalLite } from '../api/types';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Kind = 'ok' | 'err';
export interface ToastOptions {
  /** botão de ação no aviso (ex.: "Desfazer") */
  action?: { label: string; onClick: () => void };
  /** quanto tempo o aviso fica na tela, em ms */
  duration?: number;
  /** medalha mostrada no aviso (conquistas) */
  medal?: Pick<MedalLite, 'icon' | 'rarity'>;
}
type Show = (message: string, kind?: Kind, opts?: ToastOptions) => void;

const ToastContext = createContext<Show>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: Kind; show: boolean; action?: ToastOptions['action']; medal?: ToastOptions['medal']; duration: number; key: number }>(
    { message: '', kind: 'ok', show: false, duration: 3200, key: 0 });
  const timer = useRef<number>();

  const hide = useCallback(() => { window.clearTimeout(timer.current); setToast((t) => ({ ...t, show: false })); }, []);

  const show = useCallback<Show>((message, kind = 'ok', opts = {}) => {
    window.clearTimeout(timer.current);
    const duration = opts.duration ?? (opts.action ? 8000 : 3200);
    setToast((t) => ({ message, kind, show: true, action: opts.action, medal: opts.medal, duration, key: t.key + 1 }));
    timer.current = window.setTimeout(hide, duration);
  }, [hide]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div id="toast" role="status" className={`toast ${toast.show ? 'show' : ''} ${toast.kind} ${toast.action ? 'has-action' : ''} ${toast.medal ? 'has-medal' : ''}`}>
        {toast.medal && <MedalArt className="toast-medal" icon={toast.medal.icon} rarity={toast.medal.rarity} />}
        <span>{toast.message}</span>
        {toast.action && (
          <button type="button" className="toast-action" onClick={() => { const a = toast.action!; hide(); a.onClick(); }}>
            {toast.action.label}
          </button>
        )}
        {toast.action && toast.show && <i key={toast.key} className="toast-timer" style={{ animationDuration: `${toast.duration}ms` }} />}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
