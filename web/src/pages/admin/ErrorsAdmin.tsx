// Painel de erros: tudo o que deu errado no servidor, no navegador dos pilotos e no envio de e-mails.
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { useErrorActions, useErrorLog, type ErrorEntry } from '../../api/errors-hooks';
import { fmtAgo, fmtDate } from '../../lib/format';
import { AdminTabs } from './AdminTabs';
import './admin.css';
import '../errors.css';

const SOURCE: Record<string, string> = { server: 'Servidor', client: 'Navegador', mail: 'E-mail' };

function ErrorItem({ e }: { e: ErrorEntry }) {
  const [open, setOpen] = useState(false);
  const { resolve } = useErrorActions();
  return (
    <article className={`er-item ${e.resolved ? 'done' : ''}`}>
      <div className="er-head">
        <span className={`er-src ${e.source}`}>{SOURCE[e.source]}</span>
        <strong className="er-msg">{e.message}</strong>
        <span className="er-count" title="Quantas vezes aconteceu">{e.count}×</span>
      </div>
      <div className="er-meta">
        {e.route && <span>{e.method ? `${e.method} ` : ''}{e.route}</span>}
        {e.nickname && <span>piloto {e.nickname}</span>}
        <span title={fmtDate(e.lastSeen)}>última vez {fmtAgo(e.lastSeen)}</span>
        <span>primeira em {fmtDate(e.firstSeen)}</span>
      </div>
      <div className="er-actions">
        {e.stack && <button className="btn ghost sm" onClick={() => setOpen(!open)}>{open ? 'Ocultar detalhes' : 'Ver detalhes'}</button>}
        <button className="btn ghost sm" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: e.id, resolved: !e.resolved })}>
          {e.resolved ? 'Reabrir' : 'Marcar como resolvido'}
        </button>
      </div>
      {open && <pre className="er-stack">{e.stack}{e.userAgent ? `\n\n${e.userAgent}` : ''}</pre>}
    </article>
  );
}

export function ErrorsAdmin() {
  const [filter, setFilter] = useState('open');
  const [source, setSource] = useState('all');
  const { data, isLoading, error } = useErrorLog(filter, source);
  const { clearResolved } = useErrorActions();

  return (
    <>
      <div className="page-head">
        <div>
          <span className="label">Administração</span>
          <h1>Erros</h1>
          <p>O que deu errado no servidor, no navegador dos pilotos e no envio de e-mails. Erros iguais aparecem juntos, com a contagem. Ficam guardados por {data?.retentionDays ?? 30} dias.</p>
        </div>
      </div>
      <AdminTabs />
      <div className="toolbar">
        <div className="seg">
          {[['open', 'Abertos'], ['resolved', 'Resolvidos'], ['all', 'Todos']].map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="seg">
          {[['all', 'Todas as origens'], ['server', 'Servidor'], ['client', 'Navegador'], ['mail', 'E-mail']].map(([k, l]) => (
            <button key={k} className={source === k ? 'on' : ''} onClick={() => setSource(k)}>{l}</button>
          ))}
        </div>
        {filter !== 'open' && (
          <button className="btn ghost sm" disabled={clearResolved.isPending}
            onClick={() => { if (confirm('Apagar todos os erros marcados como resolvidos?')) clearResolved.mutate(); }}>
            Apagar resolvidos
          </button>
        )}
      </div>
      {isLoading && <p className="muted">Carregando…</p>}
      {error && <p className="muted">{errorMessage(error)}</p>}
      {data && !data.items.length && <p className="muted">{filter === 'open' ? 'Nenhum erro aberto. Tudo certo por aqui.' : 'Nada para mostrar.'}</p>}
      <section className="er-list">
        {data?.items.map((e) => <ErrorItem key={e.id} e={e} />)}
      </section>
    </>
  );
}
