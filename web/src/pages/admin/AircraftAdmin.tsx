import { useEffect, useRef, useState } from 'react';
import { Pagination } from '../../components/Pagination';
import { errorMessage } from '../../api/client';
import { useAdminTree, useSaveAircraft, useSaveTier } from '../../api/hooks';
import type { Aircraft, AircraftRole, Tier } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Select } from '../../components/Select';
import { AircraftIcon, iconOf, ICONS, ROLE_LABEL } from '../../lib/aircraft';
import { fmtPoints } from '../../lib/format';
import { AverageInfo } from '../../components/AverageInfo';
import { AdminTabs } from './AdminTabs';
import { Link } from 'react-router-dom';
import './aircraft-admin.css';

const PAGE_SIZE = 10;

const EMPTY: Aircraft = {
  id: '', name: '', tier: 1, role: 'fighter', row: 0, icon: null, restriction: null, description: null,
  active: true, bound: [], parents: [],
};

/** Cadastro da tech tree: tiers, PM base e aeronaves (papel, linha, ícone, Bound e famílias) */
export function AircraftAdmin() {
  const { data: tree, isLoading, error } = useAdminTree();
  const save = useSaveAircraft();
  const toast = useToast();
  const [form, setForm] = useState<Aircraft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editorTab, setEditorTab] = useState('data');
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('aircraft');
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { if (form && window.matchMedia('(max-width: 1100px)').matches) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [form?.id, isNew]);
  useEffect(() => { setOffset(0); }, [search, tierFilter, roleFilter, statusFilter]);

  const tierLabel = (n: number) => tree?.tiers.find((t) => t.tier === n)?.label ?? String(n);
  const set = <K extends keyof Aircraft>(k: K, v: Aircraft[K]) => { setDirty(true); setForm((f) => (f ? { ...f, [k]: v } : f)); };
  const toggle = (k: 'bound' | 'parents', id: string, on: boolean) =>
    { setDirty(true); setForm((f) => (f ? { ...f, [k]: on ? [...f[k], id] : f[k].filter((x) => x !== id) } : f)); }

  function edit(a: Aircraft | null) {
    save.reset();
    if (save.isPending) return;
    setTab('aircraft');
    setEditorTab('data'); setDirty(false);
    setIsNew(!a);
    setForm(a ? { ...a } : { ...EMPTY, tier: tree?.tiers[0]?.tier ?? 1 });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    save.mutate({ isNew, data: form }, {
      onSuccess: () => { toast(isNew ? 'Aeronave criada.' : 'Aeronave salva.'); setForm(null); },
      onError: (err) => toast(errorMessage(err), 'err'),
    });
  }

  const others = (tree?.aircraft ?? []).filter((a) => a.id !== form?.id);

  const filtered = (tree?.aircraft ?? []).filter((aircraft) =>
    (!search.trim() || `${aircraft.name} ${aircraft.id}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) &&
    (!tierFilter || aircraft.tier === Number(tierFilter)) && (!roleFilter || aircraft.role === roleFilter) &&
    (!statusFilter || aircraft.active === (statusFilter === 'active')));

  const editor = tree && form ? <aside ref={panel} className="card detail aircraft-editor aircraft-side-panel" aria-label={isNew ? 'Nova aeronave' : `Editar ${form.name}`}>
              <form onSubmit={submit} onInvalidCapture={() => setEditorTab('data')}>
                <fieldset disabled={save.isPending} className="aircraft-fieldset">
                <header className="aircraft-panel-head"><div className="aircraft-panel-top"><span className="label">{isNew ? 'Nova aeronave' : 'Aeronave / Edição'}</span><button type="button" className="aircraft-panel-close" aria-label="Fechar painel da aeronave" onClick={() => setForm(null)}>×</button></div>
                  <div className="aircraft-panel-identity"><span style={{ color: `var(--role-${form.role})` }}><AircraftIcon icon={iconOf(form)} className="preview-icon" /></span><div><h2>{form.name || 'Nova aeronave'}</h2><div className="aircraft-panel-meta"><span>Tier {tierLabel(form.tier)}</span><span>· {ROLE_LABEL[form.role]}</span><span className={`badge${form.active ? ' ok' : ''}`}>{form.active ? 'ativa' : 'inativa'}</span></div></div></div>
                  {!isNew && <div className="aircraft-panel-id">Identificador: {form.id}</div>}
                </header>
                <div className="aircraft-panel-tabs" role="tablist" aria-label="Seções da aeronave"><button type="button" id="aircraft-data-tab" role="tab" aria-controls="aircraft-data-panel" aria-selected={editorTab === 'data'} onClick={() => setEditorTab('data')}>Dados gerais</button><button type="button" id="aircraft-requirements-tab" role="tab" aria-controls="aircraft-requirements-panel" aria-selected={editorTab === 'requirements'} onClick={() => setEditorTab('requirements')}>Requisitos <span>{form.bound.length + form.parents.length}</span></button></div>
                <div className="section aircraft-panel-body" id="aircraft-data-panel" role="tabpanel" aria-labelledby="aircraft-data-tab" hidden={editorTab !== 'data'}>
                  <div className="form-grid">
                    {isNew && <label className="field span-2">
                      <span className="label">Identificador</span>
                      <input className="input mono" value={form.id} disabled={!isNew} required placeholder="f16c"
                        onChange={(e) => set('id', e.target.value.toLowerCase())} />
                    </label>}
                    <label className="field span-2">
                      <span className="label">Nome</span>
                      <input className="input" value={form.name} required placeholder="F-16C Blk 50"
                        onChange={(e) => set('name', e.target.value)} />
                    </label>
                    <label className="field">
                      <span className="label">Tier</span>
                      <Select aria-label="Tier da aeronave" value={form.tier} onChange={(value) => set('tier', Number(value))} options={tree.tiers.map((t) => ({ value: t.tier, label: `Tier ${t.label} · ${t.cost ? `${fmtPoints(t.cost)} PM` : 'grátis'}` }))} />
                    </label>
                    <label className="field">
                      <span className="label">Função</span>
                      <Select aria-label="Papel da aeronave" value={form.role} onChange={(value) => set('role', value as AircraftRole)} options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))} />
                    </label>
                    <label className="field">
                      <span className="label">Posição na árvore</span>
                      <input className="input" type="number" min={0} value={form.row}
                        onChange={(e) => set('row', Number(e.target.value))} />
                    </label>
                    <label className="field">
                      <span className="label">Ícone</span>
                      <Select aria-label="Ícone da aeronave" value={form.icon ?? ''} onChange={(value) => set('icon', value || null)} options={[{ value: '', label: '(genérico pelo papel)' }, ...ICONS.map((value) => ({ value, label: value }))]} />
                    </label>
                    <label className="field span-2">
                      <span className="label">Restrição de armamento (época)</span>
                      <input className="input" value={form.restriction ?? ''} placeholder="Ex.: Máx. 4 AIM-7 + 4 AIM-9"
                        onChange={(e) => set('restriction', e.target.value || null)} />
                    </label>
                    <label className="field span-2">
                      <span className="label">Descrição (opcional)</span>
                      <textarea className="input" rows={2} value={form.description ?? ''}
                        onChange={(e) => set('description', e.target.value || null)} />
                    </label>
                    <label className="check span-2">
                      <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
                      Ativa (aparece na árvore)
                    </label>
                  </div>
                </div>
                <div className="section aircraft-panel-body" id="aircraft-requirements-panel" role="tabpanel" aria-labelledby="aircraft-requirements-tab" hidden={editorTab !== 'requirements'}>
                  <div className="form-grid">
                    <DependencyPicker label="Pré-requisitos obrigatórios" description="O piloto precisa possuir todas as aeronaves selecionadas (Bound)." aircraft={others} selected={form.bound} tierLabel={tierLabel} onToggle={(id, on) => toggle('bound', id, on)} />
                    <DependencyPicker label="Aeronaves de origem" description="O piloto precisa possuir ao menos uma das origens selecionadas (família)." aircraft={others} selected={form.parents} tierLabel={tierLabel} onToggle={(id, on) => toggle('parents', id, on)} />
                  </div>
                </div>
                <div className="section form-actions aircraft-panel-footer"><span className="aircraft-panel-save-status" role="status">{dirty ? 'Alterações não salvas' : 'Sem alterações'}</span><div>
                  <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button>
                  <button className="btn" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar alterações'}</button>
                </div></div>
                </fieldset>
              </form>
    </aside> : <aside ref={panel} className="card detail aircraft-side-panel"><div className="empty detail-empty"><strong>Nenhuma aeronave selecionada</strong><span>Clique em uma aeronave para consultar e editar seus dados, ou crie uma nova.</span></div></aside>;

  return <div className="aircraft-admin">
    <div className="page-head"><div><span className="label">Administração / Hangar</span><h1>Aeronaves e progressão</h1><p>Organize as aeronaves e a progressão do esquadrão.</p></div>{tree && tab === 'aircraft' && <button className="btn" onClick={() => edit(null)}>+ Nova aeronave</button>}</div>
    <AdminTabs />
    {isLoading && <div className="loading">Carregando aeronaves…</div>}
    {error && <div className="empty">{errorMessage(error)}</div>}
    {tree && <>
      <div className="aircraft-tabs" role="tablist" aria-label="Configuração da árvore">
        <button type="button" id="aircraft-tab" role="tab" aria-selected={tab === 'aircraft'} aria-controls="aircraft-panel" onClick={() => setTab('aircraft')}>Catálogo <span>{tree.aircraft.length}</span></button>
        <button type="button" id="progression-tab" role="tab" aria-selected={tab === 'progression'} aria-controls="progression-panel" onClick={() => setTab('progression')}>Tiers e custos</button>
      </div>
      <section id="progression-panel" role="tabpanel" aria-labelledby="progression-tab" hidden={tab !== 'progression'}>
        <div className="aircraft-progression-intro"><h2>Tiers e custos</h2><p className="muted">Configure custos de aquisição e os valores exibidos na árvore.</p></div>
        <TiersCard tiers={tree.tiers} average={tree.baseMissionSample > 0 ? { value: tree.baseMissionPoints, sample: tree.baseMissionSample } : null} />
        <p className="aircraft-scoring-note">Os pontos por abate, objetivos e bônus de sobrevivência são definidos em <Link to="/admin/pontuacao">Pontuação</Link>. O relatório pós-missão utiliza essas regras; o bônus por tier abaixo da missão também fica em Pontuação.</p>
      </section>
      <section id="aircraft-panel" role="tabpanel" aria-labelledby="aircraft-tab" hidden={tab !== 'aircraft'}>
        <div className="aircraft-catalogue-layout"><div className="aircraft-catalogue-list">
        <div className="aircraft-filters">
          <label className="field"><span className="label">Buscar aeronave</span><input className="input" placeholder="Nome ou identificador…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="field"><span className="label">Tier</span><Select aria-label="Filtrar por tier" value={tierFilter} onChange={setTierFilter} options={[{ value: '', label: 'Todos os tiers' }, ...tree.tiers.map((tier) => ({ value: tier.tier, label: `Tier ${tier.label}` }))]} /></label>
          <label className="field"><span className="label">Função</span><Select aria-label="Filtrar por função" value={roleFilter} onChange={setRoleFilter} options={[{ value: '', label: 'Todas as funções' }, ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))]} /></label>
          <label className="field"><span className="label">Status</span><Select aria-label="Filtrar por status" value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: 'Todos os status' }, { value: 'active', label: 'Ativa' }, { value: 'inactive', label: 'Inativa' }]} /></label>
        </div>
        <div className="aircraft-list-summary"><span role="status">{filtered.length} de {tree.aircraft.length} aeronaves</span>{(search || tierFilter || roleFilter || statusFilter) && <button type="button" className="btn ghost sm" onClick={() => { setSearch(''); setTierFilter(''); setRoleFilter(''); setStatusFilter(''); }}>Limpar filtros</button>}</div>
        <section className="card"><div className="table-wrap"><table className="players aircraft-table"><thead><tr><th>Aeronave</th><th>Tier</th><th>Função</th><th>Status</th></tr></thead><tbody>
          {filtered.slice(offset >= filtered.length ? 0 : offset, (offset >= filtered.length ? 0 : offset) + PAGE_SIZE).map((aircraft) => <tr key={aircraft.id} tabIndex={0} aria-label={`Abrir informações de ${aircraft.name}`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); edit(aircraft); } }} className={form?.id === aircraft.id && !isNew ? 'selected' : ''} onClick={() => edit(aircraft)}><td><div className="aircraft-list-name"><span style={{ color: `var(--role-${aircraft.role})` }}><AircraftIcon icon={iconOf(aircraft)} className="row-icon" /></span><div><strong>{aircraft.name}</strong><small>{aircraft.id}</small></div></div></td><td className="rank">{tierLabel(aircraft.tier)}</td><td className="muted">{ROLE_LABEL[aircraft.role]}</td><td><span className={`badge${aircraft.active ? ' ok' : ''}`}>{aircraft.active ? 'ativa' : 'inativa'}</span></td></tr>)}
          {!filtered.length && <tr><td colSpan={4}><div className="empty">Nenhuma aeronave encontrada com esses filtros.</div></td></tr>}
        </tbody></table></div></section>
        <Pagination offset={offset >= filtered.length ? 0 : offset} total={filtered.length} pageSize={PAGE_SIZE} onChange={setOffset} />
        </div>{editor}</div>
      </section>
    </>}
  </div>;
}

function DependencyPicker({ label, description, aircraft, selected, tierLabel, onToggle }: { label: string; description: string; aircraft: Aircraft[]; selected: string[]; tierLabel: (tier: number) => string; onToggle: (id: string, on: boolean) => void }) {
  const [pick, setPick] = useState('');
  const available = aircraft.filter((plane) => !selected.includes(plane.id));
  return <div className="field span-2 aircraft-dependencies"><span className="label">{label}</span><small>{description}</small>
    <div className="aircraft-dependency-selected">{selected.map((id) => { const plane = aircraft.find((item) => item.id === id); return <div key={id}><span><strong>{plane?.name ?? id}</strong><small>{plane ? `Tier ${tierLabel(plane.tier)} · ${ROLE_LABEL[plane.role]}` : 'Aeronave indisponível'}</small></span><button type="button" aria-label={`Remover ${plane?.name ?? id} de ${label}`} onClick={() => onToggle(id, false)}>×</button></div>; })}</div>
    {!selected.length && <small>Nenhuma aeronave selecionada.</small>}
    <div className="aircraft-dependency-add"><Select aria-label={`Adicionar em ${label}`} value={available.some((plane) => plane.id === pick) ? pick : ''} onChange={setPick} disabled={!available.length} options={[{ value: '', label: available.length ? 'Selecione uma aeronave…' : 'Todas já selecionadas' }, ...available.map((plane) => ({ value: plane.id, label: `${plane.name} · Tier ${tierLabel(plane.tier)}` }))]} /><button type="button" className="btn ghost sm" disabled={!available.some((plane) => plane.id === pick)} onClick={() => { if (available.some((plane) => plane.id === pick)) { onToggle(pick, true); setPick(''); } }}>Adicionar</button></div>
  </div>;
}

/** Tabela editável de tiers. O PM médio por missão é calculado sozinho e só é exibido aqui. */
function TiersCard({ tiers, average }: { tiers: Tier[]; average: { value: number; sample: number } | null }) {
  const saveTier = useSaveTier();
  const toast = useToast();
  const [rows, setRows] = useState(tiers);
  useEffect(() => setRows(tiers), [tiers]);

  const update = (i: number, patch: Partial<Tier>) => setRows((r) => r.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const isNew = (t: Tier) => !tiers.some((x) => x.tier === t.tier);
  const changed = (t: Tier) => {
    const o = tiers.find((x) => x.tier === t.tier);
    return !o || o.label !== t.label || o.cost !== t.cost;
  };

  function saveRow(t: Tier) {
    saveTier.mutate({ isNew: isNew(t), data: t }, {
      onSuccess: () => toast(`Tier ${t.label} salvo.`),
      onError: (e) => toast(errorMessage(e), 'err'),
    });
  }

  function addTier() {
    const last = rows[rows.length - 1];
    const n = (last?.tier ?? 0) + 1;
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] ?? String(n);
    setRows([...rows, { tier: n, label: roman, cost: (last?.cost ?? 0) + 1000, multiplier: 1 }]);
  }

  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span className="label">Tiers — custos na árvore</span>
        <span className="label">PM médio por missão<AverageInfo /></span>
      </div>
      <p className="hint" style={{ margin: '0 0 12px' }}>
        {average
          ? `Em uso na árvore: ${fmtPoints(average.value)} PM por missão, a média real dos pilotos em ${average.sample} participações em missões encerradas. Esse valor é calculado sozinho e não pode ser editado.`
          : 'Ainda não há missão encerrada, então não há média. A árvore não estima o número de missões até a primeira missão ser encerrada. O valor é calculado sozinho e não pode ser editado.'}
      </p>
      <div className="table-wrap">
        <table className="players tiers-table">
          <thead>
            <tr><th>Tier</th><th>Rótulo</th><th>Custo (PM)</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.tier} style={{ cursor: 'default' }}>
                <td className="rank">{t.tier}</td>
                <td><input className="input" style={{ width: 80 }} value={t.label} onChange={(e) => update(i, { label: e.target.value })} /></td>
                <td><input className="input" type="number" min={0} step={100} style={{ width: 130 }} value={t.cost}
                  onChange={(e) => update(i, { cost: Number(e.target.value) })} /></td>
                <td style={{ textAlign: 'right' }}>
                  {t.cost === 0 && <span className="badge ok" style={{ marginRight: 8 }}>na frota de todos</span>}
                  <button className="btn ghost sm" disabled={!changed(t) || saveTier.isPending} onClick={() => saveRow(t)}>
                    {isNew(t) ? 'Criar' : 'Salvar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ borderBottom: 0 }}>
        <button className="btn ghost sm" onClick={addTier} disabled={rows.some(isNew)}>Novo tier</button>
      </div>
    </section>
  );
}
