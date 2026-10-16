import { useHistory } from '../api/hooks';
import { fmtDate, fmtSigned, SOURCE_LABEL } from '../lib/format';

/** Histórico de Pontos de Missão do jogador logado */
export function History() {
  const { data } = useHistory();
  return (
    <section className="history">
      <h2>Histórico de PM</h2>
      <ul className="ledger">
        {data?.length === 0 && <li className="muted" style={{ display: 'block' }}>Nenhum lançamento ainda.</li>}
        {data?.map((l) => (
          <li key={l.id}>
            <span className="when">{fmtDate(l.createdAt)}</span>
            <span>{l.reason} <span className="muted" style={{ fontSize: 11 }}>· {SOURCE_LABEL[l.source]}</span></span>
            <span className={`amt ${l.amount > 0 ? 'pos' : 'neg'}`}>{fmtSigned(l.amount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
