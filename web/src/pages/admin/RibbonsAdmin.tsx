import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';
import { Select } from '../../components/Select';
import { RibbonImage } from '../../components/RibbonImage';
import { AdminTabs } from './AdminTabs';
import './admin.css';
import '../../components/ribbon-image.css';
import './ribbons.css';

export interface RibbonRow { id: string; name: string; description: string; category: string; precedence: number; allowsValor: boolean; active: boolean; imageVersion: number; hasImage: boolean }
const CATEGORIES = [
  { value: 'honra', label: 'Honra' }, { value: 'combate', label: 'Combate' },
  { value: 'servico', label: 'Serviço' }, { value: 'campanha', label: 'Campanha' },
];
const categoryLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;
const EMPTY = { name: '', description: '', category: 'campanha', precedence: 100, allowsValor: false, active: true };

function Editor({ ribbon, onDone }: { ribbon: RibbonRow | null; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(ribbon ? { name: ribbon.name, description: ribbon.description, category: ribbon.category, precedence: ribbon.precedence, allowsValor: ribbon.allowsValor, active: ribbon.active } : EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [stars, setStars] = useState(1);
  const input = useRef<HTMLInputElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setObjectUrl(null); return; }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const save = useMutation({
    mutationFn: async () => {
      const id = ribbon ? ribbon.id : (await api.post<{ id: string }>('/admin/ribbons', form)).id;
      if (ribbon) await api.put(`/admin/ribbons/${id}`, form);
      if (file) await api.upload(`/admin/ribbons/${id}/image`, file);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'ribbons'] }); toast('Condecoração salva.'); onDone(); },
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <form className="card rb-editor" aria-label={ribbon ? 'Editar condecoração' : 'Nova condecoração'} onSubmit={(event) => { event.preventDefault(); if (form.name.trim().length >= 2 && !save.isPending) save.mutate(); }}>
      <header className="rb-editor-header"><div><span className="label">Cadastro de condecoração</span><h2>{ribbon ? 'Editar condecoração' : 'Nova condecoração'}</h2><p>Defina o reconhecimento, os requisitos e a fita que os pilotos vão receber.</p></div><span className={`badge${form.active ? ' ok' : ''}`}>{form.active ? 'ativa' : 'inativa'}</span></header>
      <fieldset className="rb-editor-layout" disabled={save.isPending}>
        <div className="rb-editor-fields">
          <section className="rb-editor-section"><h3><span>01</span> Informações da condecoração</h3><div className="rb-editor-grid">
            <label className="field"><span className="label">Nome</span><input className="input" required minLength={2} maxLength={80} placeholder="Ex.: Cruz do Estreito" value={form.name} onChange={(event) => set('name', event.target.value)} /></label>
            <label className="field"><span className="label">Categoria</span><Select value={form.category} options={CATEGORIES} onChange={(value) => set('category', value)} aria-label="Categoria" /></label>
            <label className="field rb-editor-wide"><span className="label">Descrição e requisitos</span><textarea className="input" rows={4} maxLength={500} placeholder="Descreva o feito e os critérios para receber esta condecoração…" value={form.description} onChange={(event) => set('description', event.target.value)} /><span className="rb-field-hint">Explique quando esta condecoração pode ser concedida.</span></label>
          </div></section>
          <section className="rb-editor-section"><h3><span>02</span> Regras de exibição</h3><div className="rb-editor-grid">
            <label className="field"><span className="label">Ordem de precedência</span><input className="input" required type="number" min={1} max={9999} value={form.precedence} onChange={(event) => set('precedence', Number(event.target.value))} /><span className="rb-field-hint">Números menores aparecem primeiro no perfil.</span></label>
            <div className="rb-editor-checks"><label className="check"><input type="checkbox" checked={form.allowsValor} onChange={(event) => set('allowsValor', event.target.checked)} /><span>Permitir dispositivo “V”<small>Reconhecimento por valor em combate.</small></span></label><label className="check"><input type="checkbox" checked={form.active} onChange={(event) => set('active', event.target.checked)} /><span>Condecoração ativa<small>Disponível para concessão nas missões.</small></span></label></div>
          </div></section>
        </div>
        <aside className="rb-editor-preview" aria-label="Imagem e prévia da fita"><span className="label">Fita da condecoração</span><h3>{form.name.trim() || 'Sua condecoração'}</h3><span className="rb-preview-category">{categoryLabel(form.category)}</span>
          <div className="rb-ribbon-stage">{objectUrl ? <img className="rb-uploaded-ribbon" src={objectUrl} alt="Prévia da fita selecionada" /> : ribbon?.hasImage ? <RibbonImage id={ribbon.id} version={ribbon.imageVersion} count={stars} valor={form.allowsValor && stars > 1} name={ribbon.name} /> : <div className="rb-ribbon-placeholder"><span aria-hidden="true">▰</span><p>A prévia da fita aparecerá aqui</p></div>}</div>
          <label className="rb-upload-label"><span className="label">Enviar imagem</span><input ref={input} className="rb-file-input" type="file" accept="image/png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <p className="rb-image-specs">PNG · 330 × 90 px · até 100 KB<br />Envie apenas a fita, sem estrelas, texto ou borda.</p>
          {!objectUrl && ribbon?.hasImage && <label className="field"><span className="label">Simular concessões</span><input className="input" type="number" min={1} max={30} value={stars} onChange={(event) => setStars(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} /></label>}
          <p className="rb-preview-note">As estrelas e o dispositivo “V” são adicionados automaticamente pelo sistema.</p>
        </aside>
      </fieldset>
      <footer className="rb-editor-footer"><div>{save.error ? <p role="alert" className="op-error">{errorMessage(save.error)}</p> : <p>Confira os dados antes de salvar a condecoração.</p>}</div><div className="rb-actions"><button type="button" className="btn ghost" disabled={save.isPending} onClick={onDone}>Cancelar</button><button type="submit" className="btn" disabled={save.isPending || form.name.trim().length < 2}>{save.isPending ? 'Salvando…' : ribbon ? 'Salvar alterações' : 'Criar condecoração'}</button></div></footer>
    </form>
  );
}

export function RibbonsAdmin() {
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RibbonRow | 'new' | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'ribbons'], queryFn: () => api.get<RibbonRow[]>('/admin/ribbons') });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/ribbons/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'ribbons'] }); toast('Condecoração apagada.'); },
  });
  return (
    <div className="scoring-page">
      <div className="page-head">
        <div><span className="label">Administração / Reconhecimento</span><h1>Condecorações</h1><p>Cadastre as fitas que poderão ser concedidas após as missões. As estrelas e o "V" são desenhados pelo site.</p></div>
        {!editing && <button type="button" className="btn" onClick={() => setEditing('new')}>Nova condecoração</button>}
      </div>
      <AdminTabs />
      {editing && <Editor key={editing === 'new' ? 'new' : editing.id} ribbon={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      {isLoading && <p>Carregando…</p>}
      {error && <div role="alert"><p>{errorMessage(error)}</p><button type="button" className="btn ghost" onClick={() => refetch()}>Tentar novamente</button></div>}
      {remove.error && <p role="alert" className="op-error">{errorMessage(remove.error)}</p>}
      {data && !data.length && <p className="muted">Nenhuma condecoração cadastrada ainda.</p>}
      <div className="rb-list">
        {data?.map((r) => (
          <article key={r.id} className={`card rb-card${r.active ? '' : ' rb-off'}`}>
            {r.hasImage ? <RibbonImage id={r.id} version={r.imageVersion} valor={r.allowsValor} width={260} name={r.name} /> : <p>Sem imagem enviada.</p>}
            <h3>{r.name}</h3>
            {r.description && <p>{r.description}</p>}
            <div className="rb-meta"><span>{categoryLabel(r.category)}</span><span>Prec. {r.precedence}</span>{r.allowsValor && <span>Aceita V</span>}{!r.active && <span>Inativa</span>}</div>
            <div className="rb-actions">
              <button type="button" className="btn ghost" onClick={() => setEditing(r)}>Editar</button>
              <button type="button" className="btn ghost" disabled={remove.isPending} onClick={() => { if (window.confirm(`Apagar a condecoração "${r.name}"?`)) remove.mutate(r.id); }}>Apagar</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
