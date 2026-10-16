// Ranking do esquadrão: posição por PM ganhos, frota e medalhas de vitrine. Saldo e e-mail não aparecem.
import { useState } from 'react';
import { Pagination } from '../components/Pagination';
import { useRanking } from '../api/hooks';
import { errorMessage } from '../api/client';
import { MedalStrip } from '../components/MedalStrip';
import { fmtPoints } from '../lib/format';
import './ranking.css';

export function RankingPage() {
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isFetching, error } = useRanking(offset);
  if (isLoading) return <div className="loading">CARREGANDO…</div>;
  if (error || !data) return <div className="empty">{errorMessage(error)}</div>;
  const top = offset === 0 ? data.items.slice(0, 3) : [];

  return (
    <div className="rk">
      <div className="page-head">
        <div>
          <span className="label">Esquadrão</span>
          <h1>Ranking</h1>
          <p>Pilotos ordenados por PM ganhos. Gastar PM na tech tree não derruba ninguém do ranking.</p>
        </div>
      </div>

      {top.length > 0 && (
        <section className="rk-podium">
          {top.map((p) => (
            <div key={p.id} className={`rk-pod p${Math.min(p.pos, 3)} ${p.id === data.meId ? 'me' : ''}`}>
              <span className="rk-pos">{p.pos}º</span>
              {p.avatarUrl
                ? <img className="rk-avatar" src={p.avatarUrl} alt="" referrerPolicy="no-referrer" />
                : <span className="rk-avatar rk-initial">{p.nickname.slice(0, 1)}</span>}
              <strong className="mono">{p.nickname}</strong>
              <span className="rk-earned">{fmtPoints(p.earned)} <small>PM</small></span>
              <MedalStrip medals={p.medals} size={26} />
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <div className="table-wrap">
          <table className="players rk-table">
            <thead>
              <tr><th>#</th><th>Piloto</th><th>Medalhas</th><th className="num">Conquistas</th><th className="num">Frota</th><th className="num">PM ganhos</th></tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className={p.id === data.meId ? 'selected' : ''}>
                  <td className="rank">{p.pos}</td>
                  <td>
                    <strong className="mono">{p.nickname}</strong>
                    {p.id === data.meId && <> <span className="badge info">você</span></>}
                  </td>
                  <td><MedalStrip medals={p.medals} /></td>
                  <td className="num">{p.medalCount}</td>
                  <td className="num">{p.fleet}<span className="muted"> / {data.aircraftTotal}</span></td>
                  <td className="num">{fmtPoints(p.earned)}</td>
                </tr>
              ))}
              {!data.items.length && <tr><td colSpan={6} className="empty">Nenhum piloto no ranking ainda.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination offset={offset} total={data.total} busy={isFetching} onChange={setOffset} />
      </section>
    </div>
  );
}
