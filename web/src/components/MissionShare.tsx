import { useRef, useState } from 'react';
import type { Mission } from '../api/types';
import { useToast } from './Toast';
import { missionShare } from '../lib/mission-share';
import './mission-share.css';

export function MissionShare({ mission }: { mission: Mission }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const share = missionShare(mission, window.location.origin);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setError('');
      toast('Convite copiado. Cole no Discord ou em outra rede.');
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione e copie o convite abaixo.');
    }
  }

  async function nativeShare() {
    setSharing(true);
    setError('');
    try {
      await navigator.share({ title: mission.title, text: share.text, url: share.url });
    } catch (exception) {
      if (!(exception instanceof Error && exception.name === 'AbortError')) setError('Não foi possível abrir o compartilhamento. Use WhatsApp ou copie o convite.');
    } finally { setSharing(false); }
  }

  return <>
    <button type="button" className="btn ghost sm" onClick={() => { setError(''); dialog.current?.showModal(); }}>Compartilhar ↗</button>
    <dialog ref={dialog} className="mission-share-dialog" aria-labelledby="mission-share-title" onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <div className="mission-share-heading"><h2 id="mission-share-title">Compartilhar missão</h2><button type="button" className="btn ghost sm" aria-label="Fechar compartilhamento" onClick={() => dialog.current?.close()}>×</button></div>
      <p className="muted">Envie o convite aos pilotos. Para acessar a missão, eles precisam entrar no Hangar MNG.</p>
      <label className="field"><span className="label">Convite</span><textarea className="input" readOnly value={share.invitation} rows={6} onFocus={event => event.currentTarget.select()} /></label>
      <div className="mission-share-actions">
        <a className="btn" href={share.whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>
        <button type="button" className="btn ghost" onClick={() => copy(share.invitation)}>Copiar convite</button>
        {typeof navigator.share === 'function' && <button type="button" className="btn ghost" disabled={sharing} onClick={nativeShare}>{sharing ? 'Abrindo…' : 'Outros aplicativos'}</button>}
      </div>
      <p className="muted mission-share-hint">No Discord, cole o convite no canal ou na conversa desejada.</p>
      {error && <p role="alert" className="op-error">{error}</p>}
    </dialog>
  </>;
}
