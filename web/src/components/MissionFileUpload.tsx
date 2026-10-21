import { useRef, useState } from 'react';
import type { MissionAsset } from '../api/types';
import { api, errorMessage } from '../api/client';

export function MissionFileUpload({ kind, value, onChange, onBusy }: {
  kind: 'image' | 'briefing' | 'audio'; value: MissionAsset | null;
  onChange: (asset: MissionAsset | null) => void; onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setError('');
    const limit = kind === 'image' ? 10 : 25;
    if (file.size > limit * 1024 * 1024) { setError(`O arquivo deve ter até ${limit} MB.`); return; }
    setBusy(true); onBusy(true);
    try { onChange(await api.upload<MissionAsset>(`/admin/mission-files/${kind}`, file)); }
    catch (exception) { setError(errorMessage(exception)); }
    finally { setBusy(false); onBusy(false); if (input.current) input.current.value = ''; }
  }
  return <div className="mission-upload">
    <label className="field"><span className="label">{kind === 'image' ? 'Enviar imagem do mapa' : kind === 'audio' ? 'Música do briefing' : 'Briefing interativo (HTML)'}</span>
      <input ref={input} className="input" type="file" accept={kind === 'image' ? '.png,.jpg,.jpeg,.webp' : kind === 'audio' ? '.mp3,.ogg,.wav' : '.html,.htm'} disabled={busy}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      <span className="hint">{kind === 'image' ? 'PNG, JPG ou WebP · até 10 MB.' : kind === 'audio' ? 'MP3, OGG ou WAV · até 25 MB. Toca só na tela do briefing.' : 'Apenas um arquivo HTML · até 25 MB.'}</span>
    </label>
    {busy && <p role="status">Enviando e validando arquivo…</p>}
    {value && <div className="mission-upload-current"><span>✓ {value.name}</span><button type="button" className="btn ghost sm" disabled={busy} onClick={() => onChange(null)}>Remover anexo</button></div>}
    {value && kind === 'image' && <img className="mission-upload-preview" src={value.url} alt="Prévia do mapa enviado" />}
    {error && <p className="op-error" role="alert">{error}</p>}
  </div>;
}
