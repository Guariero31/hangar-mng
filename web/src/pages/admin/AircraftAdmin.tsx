import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { useAdminTree, useSaveAircraft, useSaveSettings, useSaveTier } from '../../api/hooks';
import type { Aircraft, AircraftRole, Tier } from '../../api/types';
import { useToast } from '../../components/Toast';
import { AircraftIcon, fmtMult, iconOf, ICONS, ROLE_LABEL } from '../../lib/aircraft';
import { fmtPoints } from '../../lib/format';
import { AdminTabs } from './AdminTabs';

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

  const nameOf = Object.fromEntries((tree?.aircraft ?? []).map((a) => [a.id, a.name]));
  const tierLabel = (n: number) => tree?.tiers.find((t) => t.tier === n)?.label ?? String(n);
  const set = <K extends keyof Aircraft>(k: K, v: Aircraft[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggle = (k: 'bound' | 'parents', id: string, on: boolean) =>
    setForm((f) => (f ? { ...f, [k]: on ? [...f[k], id] : f[k].filter((x) => x !== id) } : f));

  function edit(a: Aircraft | null) {
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

  return (
    <>
      <div className="page-head">
        <div>
          <span className="label">Administração</span>
          <h1>Tech tree</h1>
          <p>Custos e bônus por tier, PM base por missão e o cadastro das aeronaves.</p>
        </div>
        <button className="btn" onClick={() => edit(null)}>Nova aeronave</button>
      </div>
      <AdminTabs />

      {isLoading && <div className="loading">CARREGANDO…</div>}
      {error && <div className="empty">{errorMessage(error)}</div>}
      {tree && <TiersCard tiers={tree.tiers} base={tree.baseMissionPoints} />}

      {tree && (
        <div className="admin-grid">
          <section className="card">
            <div className="table-wrap">
              <table className="players">
                <thead>
                  <tr><th>Tier</th><th></th><th>Nome</th><th>Papel</th><th className="num">Linha</th><th>Bound</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {tree.aircraft.map((a) => (
                    <tr key={a.id} data-id={a.id} onClick={() => edit(a)}
                      className={`${form?.id === a.id && !isNew ? 'selected' : ''} ${a.active ? '' : 'inactive'}`}>
                      <td className="rank">{tierLabel(a.tier)}</td>
                      <td style={{ width: 40, color: `var(--role-${a.role})` }}>
                        <AircraftIcon icon={iconOf(a)} className="row-icon" />
                      </td>
                      <td><strong>{a.name}</strong> <span className="muted mono" style={{ fontSize: 12 }}>{a.id}</span></td>
                      <td className="muted">{ROLE_LABEL[a.role]}</td>
                      <td className="num">{a.row}</td>
                      <td className="muted">{a.bound.map((b) => nameOf[b] ?? b).join(', ') || '—'}</td>
                      <td>{a.active ? <span className="badge ok">ativa</span> : <span className="badge">inativa</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="card detail">
            {!form ? (
              <div className="empty">Clique numa aeronave para editar, ou em “Nova aeronave”.</div>
            ) : (
              <form onSubmit={submit}>
                <div className="detail-head" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span style={{ color: `var(--role-${form.role})` }}><AircraftIcon icon={iconOf(form)} className="preview-icon" /></span>
                  <div>
                    <span className="label">{isNew ? 'Nova aeronave' : 'Editar aeronave'}</span>
                    <h2 style={{ marginTop: 6 }}>{form.name || '—'}</h2>
                  </div>
                </div>
                <div className="section">
                  <div className="form-grid">
                    <label className="field">
                      <span className="label">ID</span>
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
                      <select className="input" value={form.tier} onChange={(e) => set('tier', Number(e.target.value))}>
                        {tree.tiers.map((t) => <option key={t.tier} value={t.tier}>Tier {t.label} · {t.cost ? `${fmtPoints(t.cost)} PM` : 'grátis'}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">Papel</span>
                      <select className="input" value={form.role} onChange={(e) => set('role', e.target.value as AircraftRole)}>
                        {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">Linha na árvore</span>
                      <input className="input" type="number" min={0} value={form.row}
                        onChange={(e) => set('row', Number(e.target.value))} />
                    </label>
                    <label className="field">
                      <span className="label">Ícone</span>
                      <select className="input" value={form.icon ?? ''} onChange={(e) => set('icon', e.target.value || null)}>
                        <option value="">(genérico pelo papel)</option>
                        {ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
                      </select>
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
                    <div className="field span-2">
                      <span className="label" style={{ color: '#ff4fb4' }}>Bound — obrigatórias para comprar</span>
                      <div className="check-grid">
                        {others.map((a) => (
                          <label key={a.id}>
                            <input type="checkbox" checked={form.bound.includes(a.id)} onChange={(e) => toggle('bound', a.id, e.target.checked)} />
                            {tierLabel(a.tier)} · {a.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="field span-2">
                      <span className="label">Família — mães: é preciso ter ao menos uma (linhas tracejadas)</span>
                      <div className="check-grid">
                        {others.map((a) => (
                          <label key={a.id}>
                            <input type="checkbox" checked={form.parents.includes(a.id)} onChange={(e) => toggle('parents', a.id, e.target.checked)} />
                            {tierLabel(a.tier)} · {a.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="section form-actions">
                  <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button>
                  <button className="btn" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</button>
                </div>
              </form>
            )}
          </aside>
        </div>
      )}
    </>
  );
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
        <span className="label">Tiers — custo e bônus ao voar</span>
        <form className="row-inline" onSubmit={(e) => {
          e.preventDefault();
          saveSettings.mutate({ baseMissionPoints: Number(baseValue) }, {
            onSuccess: () => toast('PM base por missão salvo.'),
            onError: (err) => toast(errorMessage(err), 'err'),
          });
        }}>
          <span className="label">PM base por missão</span>
          <input className="input" type="number" min={0} step={50} style={{ width: 110 }} value={baseValue}
            onChange={(e) => setBaseValue(e.target.value)} aria-label="PM base por missão" />
          <button className="btn ghost sm" disabled={String(base) === baseValue || saveSettings.isPending}>Salvar</button>
        </form>
      </div>
      <div className="table-wrap">
        <table className="players tiers-table">
          <thead>
            <tr><th>Tier</th><th>Rótulo</th><th>Custo (PM)</th><th>Bônus ao voar</th><th></th></tr>
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
