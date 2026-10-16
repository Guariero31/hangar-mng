import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApprovals, usePlayers } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import type { PlayerRow } from '../../api/types';
import { fmtAgo, fmtDate, fmtPoints } from '../../lib/format';
import { AdminTabs } from './AdminTabs';
import './admin.css';
import { BatchBar } from './BatchBar';
import { PlayerPanel } from './PlayerPanel';

type SortKey = 'earned' | 'balance' | 'aircraftCount' | 'nickname' | 'lastLoginAt' | 'createdAt';
const cmp: Record<SortKey, (a: PlayerRow, b: PlayerRow) => number> = {
  earned: (a, b) => a.earned - b.earned,
  balance: (a, b) => a.balance - b.balance,
  aircraftCount: (a, b) => a.aircraftCount - b.aircraftCount,
  nickname: (a, b) => (a.nickname ?? '~').localeCompare(b.nickname ?? '~', 'pt-BR'),
  lastLoginAt: (a, b) => (a.lastLoginAt ?? '').localeCompare(b.lastLoginAt ?? ''),
  createdAt: (a, b) => a.createdAt.localeCompare(b.createdAt),
};

const FILTERS: { key: string; label: string; test: (p: PlayerRow) => boolean }[] = [
  { key: 'all', label: 'Todos', test: () => true },
  { key: 'active', label: 'Ativos', test: (p) => p.status === 'active' && !!p.nickname },
  { key: 'banned', label: 'Suspensos', test: (p) => p.status === 'banned' },
  { key: 'nonick', label: 'Sem nickname', test: (p) => p.status === 'active' && !p.nickname },
  { key: 'admin', label: 'Admins', test: (p) => p.role === 'admin' },
];

function StatusBadge({ s }: { s: PlayerRow['status'] }) {
  if (s === 'banned') return <span className="badge danger">suspenso</span>;
  if (s === 'pending') return <span className="badge">pendente</span>;
  if (s === 'rejected') return <span className="badge danger">recusado</span>;
  return <span className="badge ok">ativo</span>;
}

export function Players() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('p');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'earned', dir: -1 });
  const [filter, setFilter] = useState('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isLoading, error } = usePlayers(search);
  const { data: approvals } = useApprovals();
  const all = data?.players ?? [];
  const test = FILTERS.find((f) => f.key === filter)!.test;
  const rows = useMemo(
    () => all.filter(test).sort((a, b) => cmp[sort.key](a, b) * sort.dir || a.id.localeCompare(b.id)),
    [all, test, sort],
  );
  const stats = useMemo(() => ({
    active: all.filter((p) => p.status === 'active' && p.nickname).length,
    banned: all.filter((p) => p.status === 'banned').length,
    circ: all.filter((p) => p.status === 'active').reduce((n, p) => n + Math.max(0, p.balance), 0),
    online: all.filter((p) => p.lastLoginAt && Date.now() - new Date(p.lastLoginAt).getTime() < 7 * 86400000).length,
  }), [all]);
  const anyDcs = all.some((p) => p.dcsLinked);
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (-s.dir) as 1 | -1 } : { key, dir: key === 'nickname' ? 1 : -1 }));
  const Th = ({ k, children, num, hide }: { k: SortKey; children: React.ReactNode; num?: boolean; hide?: string }) => (
    <th className={`sortable ${num ? 'num' : ''} ${sort.key === k ? 'on' : ''} ${hide ?? ''}`} onClick={() => sortBy(k)} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {children}<span className="arr">{sort.key === k ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
    </th>
  );

  const eligible = (p: PlayerRow) => p.status === 'active' && !!p.nickname;
  const visibleEligible = rows.filter(eligible).map((p) => p.id);
  const allPicked = visibleEligible.length > 0 && visibleEligible.every((id) => picked.has(id));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setPicked((s) => {
    const n = new Set(s);
    visibleEligible.forEach((id) => (allPicked ? n.delete(id) : n.add(id)));
    return n;
  });

  const select = (id: string) => setParams(id === selectedId ? {} : { p: id }, { replace: true });

  function exportCsv() {
    const cols: (keyof PlayerRow)[] = ['nickname', 'email', 'earned', 'balance', 'aircraftCount', 'dcsLinked', 'status', 'role', 'createdAt'];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(';'), ...rows.map((p) => cols.map((c) => cell(p[c])).join(';'))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `jogadores-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="label">Administração</span>
          <h1>Jogadores</h1>
          <p>Acompanhe o esquadrão, lance PM e gerencie contas.</p>
        </div>
        <button className="btn ghost" onClick={exportCsv} disabled={!rows.length}>Exportar CSV</button>
      </div>
      <AdminTabs />

      <div className="pl-stats">
        <div><strong>{stats.active}</strong><span>pilotos ativos</span></div>
        <div><strong>{stats.online}</strong><span>acessaram em 7 dias</span></div>
        <div><strong>{fmtPoints(stats.circ)}</strong><span>PM em saldos</span></div>
        <div className={stats.banned ? 'warn' : ''}><strong>{stats.banned}</strong><span>suspensos</span></div>
        {approvals?.pending ? <Link to="/admin/aprovacoes" className="pl-alert"><strong>{approvals.pending}</strong><span>aguardando aprovação →</span></Link> : null}
      </div>

      <div className="admin-grid">
        <section className="card">
          <div className="toolbar">
            <input className="input" type="search" placeholder="Buscar por nickname ou e-mail"
              value={input} onChange={(e) => setInput(e.target.value)} />
            <div className="seg" role="group" aria-label="Filtrar">
              {FILTERS.map((f) => <button key={f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>{f.label}</button>)}
            </div>
            <span className="label count">{data ? `${rows.length} de ${data.total}` : ''}</span>
          </div>
          {picked.size > 0 && <BatchBar ids={[...picked]} onClear={() => setPicked(new Set())} />}
          <div className="table-wrap">
            <table className="players">
              <thead>
                <tr>
                  <th className="chk"><input type="checkbox" checked={allPicked} onChange={toggleAll} disabled={!visibleEligible.length} aria-label="Selecionar todos os visíveis" title="Selecionar todos os visíveis para lançar PM em lote" /></th>
                  <th className="hide-md">#</th><Th k="nickname">Piloto</Th>
                  <Th k="earned" num>PM ganhos</Th><Th k="balance" num>Saldo</Th><Th k="aircraftCount" num hide="hide-md">Frota</Th>
                  {anyDcs && <th>DCS</th>}<th>Status</th><Th k="lastLoginAt" hide="hide-sm">Último acesso</Th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={9} className="loading">CARREGANDO…</td></tr>}
                {error && <tr><td colSpan={9} className="empty">{errorMessage(error)}</td></tr>}
                {data && !rows.length && <tr><td colSpan={9} className="empty">Nenhum jogador encontrado{filter !== 'all' ? ' neste filtro' : ''}.</td></tr>}
                {rows.map((p, i) => (
                  <tr key={p.id} data-id={p.id} className={`${p.id === selectedId ? 'selected' : ''} ${p.status !== 'active' ? 'inactive' : ''}`} onClick={() => select(p.id)}>
                    <td className="chk" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} disabled={!eligible(p)}
                        aria-label={`Selecionar ${p.nickname ?? p.email}`} title={eligible(p) ? undefined : 'Suspenso ou sem nickname: não recebe PM'} />
                    </td>
                    <td className="rank hide-md">{i + 1}</td>
                    <td>
                      <div className="who-cell">
                      <span className="pl-av" aria-hidden>{(p.nickname ?? p.email)[0].toUpperCase()}</span>
                      <span className="pl-id">
                        <strong className="mono">{p.nickname ?? <span className="muted">(sem nickname)</span>}
                          {p.role === 'admin' && <> <span className="badge info">admin</span></>}</strong>
                        <small className="muted">{p.email}</small>
                      </span>
                      </div>
                    </td>
                    <td className="num">{fmtPoints(p.earned)}</td>
                    <td className={`num ${p.balance < 0 ? 'neg' : ''}`} title={p.balance < 0 ? 'Saldo negativo: confira o histórico deste jogador' : undefined}>{fmtPoints(p.balance)}</td>
                    <td className="num hide-md">{p.aircraftCount}</td>
                    {anyDcs && <td>{p.dcsLinked ? <span className="badge ok">vinculado</span> : <span className="badge">—</span>}</td>}
                    <td><StatusBadge s={p.status} /></td>
                    <td className="muted hide-sm" style={{ fontSize: 13 }} title={`Cadastro em ${fmtDate(p.createdAt)}`}>{fmtAgo(p.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="card detail">
          {selectedId ? <PlayerPanel id={selectedId} /> : <div className="empty detail-empty"><strong>Nenhum jogador selecionado</strong><span>Clique em uma linha para lançar PM, liberar ou remover aeronaves, renomear ou suspender.</span><span className="muted">Dica: marque várias caixas para lançar PM em lote.</span></div>}
        </aside>
      </div>
    </>
  );
}
