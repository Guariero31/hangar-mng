import { useToast } from '../../components/Toast';
import { Pagination } from '../../components/Pagination';
import { useEffect, useRef, useState } from 'react';
import { useApprovals, useDecideApproval } from '../../api/hooks';
import { errorMessage } from '../../api/client';
import { fmtDate } from '../../lib/format';
import { AdminTabs } from './AdminTabs';
import './admin.css';

export function Approvals() {
  const toast = useToast();
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isFetching, error } = useApprovals(true, offset);
  const decide = useDecideApproval();
  const [msg, setMsg] = useState('');
  const [messageError, setMessageError] = useState(false);
  const [confirmation, setConfirmation] = useState<{ id: string; decision: 'approve' | 'reject'; email: string } | null>(null);
  const [confirmationError, setConfirmationError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirmation && !dialog.current?.open) dialog.current?.showModal();
    if (!confirmation && dialog.current?.open) dialog.current.close();
  }, [confirmation]);

  function run(id: string, decision: 'approve' | 'reject', email: string) {
    setConfirmationError('');
    setConfirmation({ id, decision, email });
  }

  function confirmDecision() {
    if (!confirmation || decide.isPending) return;
    const { id, decision, email } = confirmation;
    setMsg('');
    setMessageError(false);
    setConfirmationError('');
    decide.mutate({ id, decision }, {
      onSuccess: () => { setConfirmation(null); toast(decision === 'approve' ? 'Cadastro aprovado.' : 'Cadastro recusado.'); setMsg(decision === 'approve' ? `${email} aprovado.` : `${email} recusado.`); },
      onError: (exception) => setConfirmationError(errorMessage(exception)),
    });
  }

  const pending = data?.items.filter((i) => i.status === 'pending') ?? [];
  const rejected = data?.items.filter((i) => i.status === 'rejected') ?? [];

  return (
    <div className="approvals-page">
      <dialog ref={dialog} className="approval-confirm" aria-labelledby="approval-confirm-title" aria-describedby="approval-confirm-description"
        onCancel={(event) => { event.preventDefault(); if (!decide.isPending) setConfirmation(null); }}
        onClick={(event) => { if (event.target === event.currentTarget && !decide.isPending) setConfirmation(null); }}>
        {confirmation && <div className="approval-confirm-content" aria-busy={decide.isPending}>
          <span className={`approval-confirm-symbol ${confirmation.decision === 'reject' ? 'is-reject' : ''}`} aria-hidden="true">{confirmation.decision === 'approve' ? '✓' : '!'}</span>
          <span className="label">Controle de acesso</span>
          <h2 id="approval-confirm-title">{confirmation.decision === 'approve' ? 'Aprovar cadastro?' : 'Recusar cadastro?'}</h2>
          <p id="approval-confirm-description">{confirmation.decision === 'approve' ? 'Este piloto terá acesso ao esquadrão e poderá escolher seu nickname.' : 'Este piloto ficará sem acesso ao esquadrão. Você poderá aprovar o cadastro depois.'}</p>
          <div className="approval-confirm-person">{confirmation.email}</div>
          {confirmationError && <p className="approval-feedback is-error" role="alert">{confirmationError}</p>}
          <div className="approval-confirm-actions">
            <button type="button" className="btn ghost" autoFocus disabled={decide.isPending} onClick={() => setConfirmation(null)}>Voltar</button>
            <button type="button" className={`btn ${confirmation.decision === 'reject' ? 'danger' : ''}`} disabled={decide.isPending} onClick={confirmDecision}>
              {decide.isPending ? 'Confirmando…' : confirmation.decision === 'approve' ? 'Confirmar aprovação' : 'Recusar cadastro'}
            </button>
          </div>
        </div>}
      </dialog>
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
