import { useState } from 'react';
import { Pagination } from '../components/Pagination';
import { errorMessage } from '../api/client';
import { useHistory } from '../api/hooks';
import { fmtDate, fmtSigned, SOURCE_LABEL } from '../lib/format';

/** Histórico de Pontos de Missão do jogador logado */
export function History() {
  const [offset, setOffset] = useState(0);
  const { data, error, isLoading, isFetching } = useHistory(offset);
  return (
    <section className="history card pf-card pf-wide">
      <h2>Histórico de PM</h2>
      {error && <p role="alert">{errorMessage(error)}</p>}
      {isLoading && <p>Carregando…</p>}
      <ul className="ledger">
        {data?.items.length === 0 && <li className="muted" style={{ display: 'block' }}>Nenhum lançamento ainda.</li>}
        {data?.items.map((l) => (
          <li key={l.id}>
            <span className="when">{fmtDate(l.createdAt)}</span>
            <span>{l.reason} <span className="muted" style={{ fontSize: 11 }}>· {SOURCE_LABEL[l.source]}</span></span>
            <span className={`amt ${l.amount > 0 ? 'pos' : 'neg'}`}>{fmtSigned(l.amount)}</span>
          </li>
        ))}
      </ul>
      <Pagination offset={offset} total={data?.total ?? 0} busy={isFetching} onChange={setOffset} />
    </section>
  );
}
