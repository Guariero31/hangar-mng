import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../api/client';
import { useMusicLibrary } from '../../api/hooks';
import type { MusicTrack } from '../../api/types';
import { MissionFileUpload } from '../../components/MissionFileUpload';
import { useToast } from '../../components/Toast';
import { AdminTabs } from './AdminTabs';
import './admin.css';
import '../missions.css';
import './music.css';

const sizeLabel = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

export function MusicAdmin() {
  const library = useMusicLibrary();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<MusicTrack | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/music/${id}`),
    onSuccess: async () => { setSelected(null); await queryClient.invalidateQueries({ queryKey: ['admin', 'music'] }); toast('Música excluída da biblioteca.'); },
  });
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
    if (!selected && dialog.current?.open) dialog.current.close();
  }, [selected]);
  const tracks = library.data ?? [];
  const filtered = tracks.filter(track => track.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <>
    <div className="admin-head"><div><span className="label">Administração / Áudio</span><h1>Músicas</h1><p className="muted">Cadastre uma vez e reutilize nos briefings das missões.</p></div></div>
    <AdminTabs />
    <section className="card music-upload-section"><h2>Adicionar à biblioteca</h2>
      <MissionFileUpload kind="audio" value={null} onBusy={setUploading} onChange={asset => {
        if (!asset) return;
        void queryClient.invalidateQueries({ queryKey: ['admin', 'music'] });
        toast('Música adicionada à biblioteca.');
      }} />
    </section>
    <section className="card music-catalog" aria-label="Biblioteca de músicas">
      <div className="music-catalog-header"><div><h2>Biblioteca</h2><p className="muted">{tracks.length} faixa(s) · {sizeLabel(tracks.reduce((total, track) => total + track.size, 0))} armazenados</p></div>
        <label className="field"><span className="label">Buscar música</span><input className="input" type="search" placeholder="Nome do arquivo…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      </div>
      {library.isLoading && <p className="loading">Carregando músicas…</p>}
      {library.error && <div role="alert"><p>{errorMessage(library.error)}</p><button type="button" className="btn ghost" onClick={() => library.refetch()}>Tentar novamente</button></div>}
      {library.data && !filtered.length && <p className="muted">{tracks.length ? 'Nenhuma música encontrada.' : 'Adicione uma faixa para começar. As músicas atuais das missões também aparecem aqui.'}</p>}
      <ul className="music-list">{filtered.map(track => <li key={track.id}>
        <div className="music-track-info"><strong>{track.name}</strong><span className="muted">{sizeLabel(track.size)} · {track.uses ? `Em uso em ${track.uses} missão(ões)` : 'Disponível para usar'}</span></div>
        <audio src={track.url} controls preload="none" aria-label={`Ouvir ${track.name}`} />
        <div className="music-track-actions"><a className="btn ghost sm" href={`/api/admin/mission-files/${track.id}/download`} download>Baixar</a><button type="button" className="btn ghost danger sm" disabled={track.uses > 0 || remove.isPending || uploading} onClick={() => { remove.reset(); setSelected(track); }}>Excluir</button></div>
      </li>)}</ul>
      <p className="hint">Faixas em uso não podem ser excluídas. Uma música compartilhada ocupa espaço uma única vez, mesmo em várias missões.</p>
    </section>
    <dialog ref={dialog} className="roster-remove-dialog" aria-labelledby="music-delete-title" onCancel={event => { if (remove.isPending) event.preventDefault(); else setSelected(null); }} onClose={() => setSelected(null)}>
      <h2 id="music-delete-title">Excluir música?</h2><p>Excluir <strong>{selected?.name}</strong> da biblioteca? O arquivo será removido do armazenamento.</p>
      {remove.error && <p role="alert" className="op-error">{errorMessage(remove.error)}</p>}
      <div className="ms-actions"><button type="button" className="btn ghost" disabled={remove.isPending} onClick={() => setSelected(null)}>Cancelar</button><button type="button" className="btn danger" disabled={remove.isPending || !selected} onClick={() => { if (selected) remove.mutate(selected.id); }}>{remove.isPending ? 'Excluindo…' : 'Excluir música'}</button></div>
    </dialog>
  </>;
}
