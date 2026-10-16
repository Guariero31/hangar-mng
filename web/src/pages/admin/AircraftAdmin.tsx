import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { useAdminTree, useSaveAircraft, useSaveSettings, useSaveTier } from '../../api/hooks';
import type { Aircraft, AircraftRole, Tier } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Select } from '../../components/Select';
import { AircraftIcon, fmtMult, iconOf, ICONS, ROLE_LABEL } from '../../lib/aircraft';
import { fmtPoints } from '../../lib/format';
import { AdminTabs } from './AdminTabs';
import { Link } from 'react-router-dom';
import './aircraft-admin.css';

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
  const [tab, setTab] = useState('aircraft');
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const tierLabel = (n: number) => tree?.tiers.find((t) => t.tier === n)?.label ?? String(n);
  const set = <K extends keyof Aircraft>(k: K, v: Aircraft[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggle = (k: 'bound' | 'parents', id: string, on: boolean) =>
    setForm((f) => (f ? { ...f, [k]: on ? [...f[k], id] : f[k].filter((x) => x !== id) } : f));

  function edit(a: Aircraft | null) {
    save.reset();
    window.scrollTo({ top: 0, behavior: 'instant' });
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

  if (tree && form) return <div className="aircraft-editor">
    <button type="button" className="aircraft-back" disabled={save.isPending} onClick={() => setForm(null)}>← Voltar para aeronaves</button>
    <div className="page-head"><div><span className="label">Cadastro de aeronave</span><h1>{isNew ? 'Nova aeronave' : form.name}</h1><p>Dados, posição na árvore e requisitos de desbloqueio.</p></div><span className={`badge${form.active ? ' ok' : ''}`}>{form.active ? 'ativa' : 'inativa'}</span></div>
    <section className="card">
              <form onSubmit={submit}>
                <fieldset disabled={save.isPending} className="aircraft-fieldset">
                <div className="detail-head" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span style={{ color: `var(--role-${form.role})` }}><AircraftIcon icon={iconOf(form)} className="preview-icon" /></span>
                  <div>
                    <span className="label">{isNew ? 'Nova aeronave' : 'Editar aeronave'}</span>
                    <h2 style={{ marginTop: 6 }}>{form.name || '—'}</h2>
                  </div>
                </div>
                <div className="section">
                  <div className="form-grid">
                    <h2 className="span-2 aircraft-section-title">Identificação</h2>
                    <label className="field">
                      <span className="label">Identificador</span>
                      <input className="input mono" value={form.id} disabled={!isNew} required placeholder="f16c"
                        onChange={(e) => set('id', e.target.value.toLowerCase())} />
                    </label>
                    <label className="field">
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
                    <h2 className="span-2 aircraft-section-title">Requisitos de desbloqueio</h2>
                    <DependencyPicker label="Pré-requisitos obrigatórios" description="O piloto precisa possuir todas as aeronaves selecionadas (Bound)." aircraft={others} selected={form.bound} tierLabel={tierLabel} onToggle={(id, on) => toggle('bound', id, on)} />
                    <DependencyPicker label="Aeronaves de origem" description="O piloto precisa possuir ao menos uma das origens selecionadas (família)." aircraft={others} selected={form.parents} tierLabel={tierLabel} onToggle={(id, on) => toggle('parents', id, on)} />
                  </div>
                </div>
                <div className="section form-actions">
                  <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button>
                  <button className="btn" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</button>
                </div>
                </fieldset>
              </form>
    </section></div>;

  return <div className="aircraft-admin">
    <div className="page-head"><div><span className="label">Administração / Hangar</span><h1>Tech tree</h1><p>Organize as aeronaves e a progressão do esquadrão.</p></div>{tree && tab === 'aircraft' && <button className="btn" onClick={() => edit(null)}>+ Nova aeronave</button>}</div>
    <AdminTabs />
    {isLoading && <div className="loading">Carregando aeronaves…</div>}
    {error && <div className="empty">{errorMessage(error)}</div>}
    {tree && <>
      <div className="aircraft-tabs" role="tablist" aria-label="Configuração da árvore">
        <button type="button" id="aircraft-tab" role="tab" aria-selected={tab === 'aircraft'} aria-controls="aircraft-panel" onClick={() => setTab('aircraft')}>Aeronaves <span>{tree.aircraft.length}</span></button>
        <button type="button" id="progression-tab" role="tab" aria-selected={tab === 'progression'} aria-controls="progression-panel" onClick={() => setTab('progression')}>Progressão</button>
      </div>
      <section id="progression-panel" role="tabpanel" aria-labelledby="progression-tab" hidden={tab !== 'progression'}>
        <div className="aircraft-progression-intro"><h2>Progressão por tier</h2><p className="muted">Configure custos de aquisição e os valores exibidos na árvore.</p></div>
        <TiersCard tiers={tree.tiers} base={tree.baseMissionPoints} />
        <p className="aircraft-scoring-note">Os pontos por abate, objetivos e bônus de sobrevivência são definidos em <Link to="/admin/pontuacao">Pontuação</Link>. O relatório pós-missão utiliza essas regras; o PM base e o multiplicador de tier são usados na estimativa exibida na árvore.</p>
      </section>
      <section id="aircraft-panel" role="tabpanel" aria-labelledby="aircraft-tab" hidden={tab !== 'aircraft'}>
        <div className="aircraft-filters">
          <label className="field"><span className="label">Buscar aeronave</span><input className="input" placeholder="Nome ou identificador…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="field"><span className="label">Tier</span><Select aria-label="Filtrar por tier" value={tierFilter} onChange={setTierFilter} options={[{ value: '', label: 'Todos os tiers' }, ...tree.tiers.map((tier) => ({ value: tier.tier, label: `Tier ${tier.label}` }))]} /></label>
          <label className="field"><span className="label">Função</span><Select aria-label="Filtrar por função" value={roleFilter} onChange={setRoleFilter} options={[{ value: '', label: 'Todas as funções' }, ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))]} /></label>
          <label className="field"><span className="label">Status</span><Select aria-label="Filtrar por status" value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: 'Todos os status' }, { value: 'active', label: 'Ativa' }, { value: 'inactive', label: 'Inativa' }]} /></label>
        </div>
        <div className="aircraft-list-summary"><span role="status">{filtered.length} de {tree.aircraft.length} aeronaves</span>{(search || tierFilter || roleFilter || statusFilter) && <button type="button" className="btn ghost sm" onClick={() => { setSearch(''); setTierFilter(''); setRoleFilter(''); setStatusFilter(''); }}>Limpar filtros</button>}</div>
        <section className="card"><div className="table-wrap"><table className="players aircraft-table"><thead><tr><th>Aeronave</th><th>Tier</th><th>Função</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>
          {filtered.map((aircraft) => <tr key={aircraft.id}><td><div className="aircraft-list-name"><span style={{ color: `var(--role-${aircraft.role})` }}><AircraftIcon icon={iconOf(aircraft)} className="row-icon" /></span><div><strong>{aircraft.name}</strong><small>{aircraft.id}</small></div></div></td><td className="rank">{tierLabel(aircraft.tier)}</td><td className="muted">{ROLE_LABEL[aircraft.role]}</td><td><span className={`badge${aircraft.active ? ' ok' : ''}`}>{aircraft.active ? 'ativa' : 'inativa'}</span></td><td className="num"><button type="button" className="btn ghost sm" aria-label={`Editar ${aircraft.name}`} onClick={() => edit(aircraft)}>Editar ↗</button></td></tr>)}
          {!filtered.length && <tr><td colSpan={5}><div className="empty">Nenhuma aeronave encontrada com esses filtros.</div></td></tr>}
        </tbody></table></div></section>
      </section>
    </>}
  </div>;
}

function DependencyPicker({ label, description, aircraft, selected, tierLabel, onToggle }: { label: string; description: string; aircraft: Aircraft[]; selected: string[]; tierLabel: (tier: number) => string; onToggle: (id: string, on: boolean) => void }) {
  const [search, setSearch] = useState('');
  const filtered = aircraft.filter((plane) => `${plane.name} ${plane.id}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <div className="field span-2 aircraft-dependencies"><span className="label">{label}</span><small>{description}</small>
    {selected.length > 0 && <div className="aircraft-selected">{selected.map((id) => <button type="button" className="btn ghost sm" key={id} aria-label={`Remover ${aircraft.find((plane) => plane.id === id)?.name ?? id} de ${label}`} onClick={() => onToggle(id, false)}>{aircraft.find((plane) => plane.id === id)?.name ?? id} ×</button>)}</div>}
    <input className="input" aria-label={`Buscar em ${label}`} placeholder="Buscar aeronave…" value={search} onChange={(event) => setSearch(event.target.value)} />
    <div className="check-grid">{filtered.map((plane) => <label key={plane.id}><input type="checkbox" checked={selected.includes(plane.id)} onChange={(event) => onToggle(plane.id, event.target.checked)} />{tierLabel(plane.tier)} · {plane.name}</label>)}{!filtered.length && <p className="muted">Nenhuma aeronave encontrada.</p>}</div>
  </div>;
}

/** Tabela editável de tiers + PM base por missão */
function TiersCard({ tiers, base }: { tiers: Tier[]; base: number }) {
  const saveTier = useSaveTier();
  const saveSettings = useSaveSettings();
  const toast = useToast();
  const [rows, setRows] = useState(tiers);
  const [baseValue, setBaseValue] = useState(String(base));
  useEffect(() => setRows(tiers), [tiers]);
  useEffect(() => setBaseValue(String(base)), [base]);

  const update = (i: number, patch: Partial<Tier>) => setRows((r) => r.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const isNew = (t: Tier) => !tiers.some((x) => x.tier === t.tier);
  const changed = (t: Tier) => {
    const o = tiers.find((x) => x.tier === t.tier);
    return !o || o.label !== t.label || o.cost !== t.cost || o.multiplier !== t.multiplier;
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
        <span className="label">Tiers — custos e estimativa na árvore</span>
        <form className="row-inline" onSubmit={(e) => {
          e.preventDefault();
          saveSettings.mutate({ baseMissionPoints: Number(baseValue) }, {
            onSuccess: () => toast('PM base por missão salvo.'),
            onError: (err) => toast(errorMessage(err), 'err'),
          });
        }}>
          <span className="label">PM base da estimativa</span>
          <input className="input" type="number" min={0} step={50} style={{ width: 110 }} value={baseValue}
            onChange={(e) => setBaseValue(e.target.value)} aria-label="PM base por missão" />
          <button className="btn ghost sm" disabled={String(base) === baseValue || saveSettings.isPending}>Salvar</button>
        </form>
      </div>
      <div className="table-wrap">
        <table className="players tiers-table">
          <thead>
            <tr><th>Tier</th><th>Rótulo</th><th>Custo (PM)</th><th>Multiplicador na árvore</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.tier} style={{ cursor: 'default' }}>
                <td className="rank">{t.tier}</td>
                <td><input className="input" style={{ width: 80 }} value={t.label} onChange={(e) => update(i, { label: e.target.value })} /></td>
                <td><input className="input" type="number" min={0} step={100} style={{ width: 130 }} value={t.cost}
                  onChange={(e) => update(i, { cost: Number(e.target.value) })} /></td>
                <td>
                  <div className="row-inline">
                    <input className="input" type="number" min={0.01} step={0.01} style={{ width: 100 }} value={t.multiplier}
                      onChange={(e) => update(i, { multiplier: Number(e.target.value) })} />
                    <span className="muted mono">{fmtMult(t.multiplier || 0)}</span>
                  </div>
                </td>
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
