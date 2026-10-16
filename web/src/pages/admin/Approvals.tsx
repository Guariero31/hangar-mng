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
  const [messageError, setMessageError] = useState(false);

  function run(id: string, decision: 'approve' | 'reject', email: string) {
    if (decision === 'reject' && !confirm(`Recusar o cadastro de ${email}?`)) return;
    setMsg('');
    setMessageError(false);
    decide.mutate({ id, decision }, {
      onSuccess: () => setMsg(decision === 'approve' ? `${email} aprovado.` : `${email} recusado.`),
      onError: (exception) => { setMessageError(true); setMsg(errorMessage(exception)); },
    });
  }

  const pending = data?.items.filter((i) => i.status === 'pending') ?? [];
  const rejected = data?.items.filter((i) => i.status === 'rejected') ?? [];

  return (
    <div className="approvals-page">
      <div className="page-head">
        <div>
          <span className="label">Administração</span>
          <h1>Aprovações</h1>
          <p>Quem entra pela primeira vez fica aqui até um admin liberar. Depois de aprovado, o piloto escolhe o nickname.</p>
        </div>
      </div>
      <AdminTabs />
      {msg && <div className={`approval-feedback ${messageError ? 'is-error' : ''}`} role={messageError ? 'alert' : 'status'}>
        <span className="approval-feedback-icon" aria-hidden="true">{messageError ? '!' : '✓'}</span>
        <span>{msg}</span>
        <button type="button" className="approval-dismiss" aria-label="Fechar mensagem" onClick={() => setMsg('')}>×</button>
      </div>}
      {error && <p className="approval-feedback is-error" role="alert">{errorMessage(error)}</p>}

      <section className="card approval-panel" aria-labelledby="approval-pending-title" aria-busy={isFetching}>
        <div className="approval-panel-head"><div><h2 id="approval-pending-title">Aguardando aprovação</h2>
          <p>Revise os cadastros para liberar o acesso ao esquadrão.</p></div>
          <span className="approval-count" aria-label={`${data?.pending ?? 0} cadastros pendentes`}>{data?.pending ?? 0}</span>
        </div>
        {isLoading && <p className="loading">Carregando cadastros…</p>}
        {!pending.length && data && !error && <div className="approval-empty">
          <span className="approval-empty-icon" aria-hidden="true">{data.pending ? '…' : '✓'}</span>
          <h3>{data.pending ? 'Nenhum pendente nesta página' : 'Tudo em dia por aqui'}</h3>
          <p>{data.pending ? 'Existem cadastros aguardando aprovação em outras páginas.' : 'Não há cadastros aguardando aprovação. Novas solicitações aparecerão aqui.'}</p>
        </div>}
        {pending.map((p) => (
          <div key={p.id} className="approval-row">
            {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="approval-avatar" referrerPolicy="no-referrer" /> : <span className="approval-avatar approval-initial" aria-hidden="true">{(p.name || p.email).slice(0, 1).toUpperCase()}</span>}
            <div className="approval-who">
              <strong>{p.name ?? p.email.split('@')[0]}</strong>
              <span className="muted">{p.email}</span>
              <span className="approval-requested">Solicitado em {fmtDate(p.createdAt)}</span>
            </div>
            <div className="row-inline">
              <button className="btn ok" disabled={decide.isPending} onClick={() => run(p.id, 'approve', p.email)}>Aprovar</button>
              <button className="btn danger" disabled={decide.isPending} onClick={() => run(p.id, 'reject', p.email)}>Recusar</button>
            </div>
          </div>
        ))}
      </section>

      {rejected.length > 0 && (
        <section className="card approval-panel" aria-labelledby="approval-rejected-title">
          <div className="approval-panel-head"><div><h2 id="approval-rejected-title">Cadastros recusados</h2><p>Você pode revisar a decisão e liberar o acesso.</p></div><span className="approval-count">{rejected.length}</span></div>
          {rejected.map((p) => (
            <div key={p.id} className="approval-row">
              <span className="approval-avatar approval-initial" aria-hidden="true">{p.email.slice(0, 1).toUpperCase()}</span>
              <div className="approval-who"><strong>{p.email}</strong><span className="muted">recusado {p.decidedAt ? fmtDate(p.decidedAt) : ''}</span></div>
              <button className="btn ghost" disabled={decide.isPending} onClick={() => run(p.id, 'approve', p.email)}>Aprovar mesmo assim</button>
            </div>
          ))}
        </section>
      )}
      <Pagination offset={offset} total={data?.total ?? 0} busy={isFetching} onChange={setOffset} />
    </div>
  );
}
