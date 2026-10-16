import { Pagination } from '../../components/Pagination';
import { useState } from 'react';
import { useApprovals, useDecideApproval } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { fmtDate } from '../../lib/format';
import { AdminTabs } from './AdminTabs';
import './admin.css';

export function Approvals() {
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isFetching, error } = useApprovals(true, offset);
  const decide = useDecideApproval();
  const [msg, setMsg] = useState('');

  function run(id: string, decision: 'approve' | 'reject', email: string) {
    if (decision === 'reject' && !confirm(`Recusar o cadastro de ${email}?`)) return;
    setMsg('');
    decide.mutate({ id, decision }, {
      onSuccess: () => setMsg(decision === 'approve' ? `${email} aprovado.` : `${email} recusado.`),
      onError: (e) => setMsg(errorMessage(e)),
    });
  }

  const pending = data?.items.filter((i) => i.status === 'pending') ?? [];
  const rejected = data?.items.filter((i) => i.status === 'rejected') ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <span className="label">Administração</span>
          <h1>Aprovações</h1>
          <p>Quem entra pela primeira vez fica aqui até um admin liberar. Depois de aprovado, o piloto escolhe o nickname.</p>
        </div>
      </div>
      <AdminTabs />
      {msg && <div className="card" role="status" style={{ marginBottom: 12 }}>{msg}</div>}
      {isLoading && <p className="muted">Carregando…</p>}
      {error && <p className="muted">{errorMessage(error)}</p>}

      <section className="card">
        <span className="label">Aguardando ({data?.pending ?? 0})</span>
        {!pending.length && !isLoading && <p className="muted">Nenhum cadastro pendente nesta página.</p>}
        {pending.map((p) => (
          <div key={p.id} className="approval-row">
            {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="approval-avatar" referrerPolicy="no-referrer" /> : <span className="approval-avatar" />}
            <div className="approval-who">
              <strong>{p.name ?? p.email.split('@')[0]}</strong>
              <span className="muted">{p.email} · pediu em {fmtDate(p.createdAt)}</span>
            </div>
            <div className="row-inline">
              <button className="btn ok" disabled={decide.isPending} onClick={() => run(p.id, 'approve', p.email)}>Aprovar</button>
              <button className="btn danger" disabled={decide.isPending} onClick={() => run(p.id, 'reject', p.email)}>Recusar</button>
            </div>
          </div>
        ))}
      </section>

      {rejected.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <span className="label">Recusados ({rejected.length})</span>
          {rejected.map((p) => (
            <div key={p.id} className="approval-row">
              <span className="approval-avatar" />
              <div className="approval-who"><strong>{p.email}</strong><span className="muted">recusado {p.decidedAt ? fmtDate(p.decidedAt) : ''}</span></div>
              <button className="btn ghost" disabled={decide.isPending} onClick={() => run(p.id, 'approve', p.email)}>Aprovar mesmo assim</button>
            </div>
          ))}
        </section>
      )}
      <Pagination offset={offset} total={data?.total ?? 0} busy={isFetching} onChange={setOffset} />
    </>
  );
}
