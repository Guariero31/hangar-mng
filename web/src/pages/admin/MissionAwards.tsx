import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';
import { RibbonImage } from '../../components/RibbonImage';
import type { Mission } from '../../api/types';
import type { RibbonRow } from './RibbonsAdmin';
import '../../components/ribbon-image.css';
import './ribbons.css';

interface Award { userId: string; ribbonId: string; valor: boolean }
interface AwardsData { status: string; eligible: { userId: string; nickname: string }[]; awards: Award[] }

function AwardsForm({ mission, data }: { mission: Mission; data: AwardsData }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [awards, setAwards] = useState<Award[]>(data.awards);
  const [dirty, setDirty] = useState(false);
  const find = (userId: string, ribbonId: string) => awards.find((a) => a.userId === userId && a.ribbonId === ribbonId);
  const change = (next: Award[]) => { setAwards(next); setDirty(true); save.reset(); };
  const toggle = (userId: string, ribbonId: string) => change(find(userId, ribbonId) ? awards.filter((a) => !(a.userId === userId && a.ribbonId === ribbonId)) : [...awards, { userId, ribbonId, valor: false }]);
  const setValor = (userId: string, ribbonId: string, valor: boolean) => change(awards.map((a) => a.userId === userId && a.ribbonId === ribbonId ? { ...a, valor } : a));
  const save = useMutation({
    mutationFn: () => api.put<{ added: number; revoked: number }>(`/admin/missions/${mission.id}/awards`, { awards }),
    onSuccess: (r) => { setDirty(false); qc.invalidateQueries({ queryKey: ['admin', 'mission-awards', mission.id] }); qc.invalidateQueries({ queryKey: ['admin', 'activity'] }); toast(`Condecorações salvas (${r.added} concedida(s), ${r.revoked} revogada(s)).`); },
  });
  if (!data.eligible.length) return <p className="muted">Nenhum piloto com presença confirmada nesta missão.</p>;
  return (
    <>
      <div className="awards-list">
        {data.eligible.map((p) => (
          <article key={p.userId} className="awards-pilot">
            <strong>{p.nickname}</strong>
            <div className="awards-ribbons">
              {mission.ribbons.map((r) => {
                const a = find(p.userId, r.id);
                return (
                  <div key={r.id} className={`awards-opt${a ? ' on' : ''}`}>
                    <label>
                      <input type="checkbox" checked={!!a} onChange={() => toggle(p.userId, r.id)} />
                      {r.hasImage ? <RibbonImage id={r.id} version={r.imageVersion} width={110} valor={!!a?.valor} count={1} name={r.name} /> : null}
                      <span>{r.name}</span>
                    </label>
                    {a && r.allowsValor && <label className="awards-valor"><input type="checkbox" checked={a.valor} onChange={(e) => setValor(p.userId, r.id, e.target.checked)} />com "V"</label>}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
      {save.error && <p role="alert" className="op-error">{errorMessage(save.error)}</p>}
      <div className="rb-actions"><button type="button" className="btn" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Salvando…' : 'Salvar condecorações'}</button></div>
    </>
  );
}

function RibbonReview({ mission }: { mission: Mission }) {
  const toast = useToast();
  const qc = useQueryClient();
  const catalog = useQuery({ queryKey: ['admin', 'ribbons'], queryFn: () => api.get<RibbonRow[]>('/admin/ribbons') });
  const [ids, setIds] = useState<string[]>(mission.ribbons.map((r) => r.id));
  const save = useMutation({
    mutationFn: () => api.put(`/admin/missions/${mission.id}/ribbons`, { ribbonIds: ids }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['missions'] }); qc.invalidateQueries({ queryKey: ['admin', 'missions'] }); toast('Condecorações da missão atualizadas.'); },
  });
  const toggle = (id: string) => { setIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]); save.reset(); };
  return (
    <details className="awards-review">
      <summary>Fitas desta missão ({mission.ribbons.length})</summary>
      <p className="muted">Use para incluir ou retirar fitas de uma missão já encerrada, como numa revisão.</p>
      <div className="mission-ribbon-pick">
        {catalog.data?.filter((r) => r.active || ids.includes(r.id)).map((r) => (
          <label key={r.id} className="mission-ribbon-opt"><input type="checkbox" checked={ids.includes(r.id)} onChange={() => toggle(r.id)} />{r.hasImage && <RibbonImage id={r.id} version={r.imageVersion} width={96} name="" />}<span>{r.name}</span></label>
        ))}
      </div>
      {save.error && <p role="alert" className="op-error">{errorMessage(save.error)}</p>}
      <div className="rb-actions"><button type="button" className="btn ghost" disabled={save.isPending} onClick={() => save.mutate()}>Salvar fitas da missão</button></div>
    </details>
  );
}

export function MissionAwards({ mission }: { mission: Mission }) {
  const hasRibbons = mission.ribbons?.length > 0;
  const query = useQuery({ queryKey: ['admin', 'mission-awards', mission.id], queryFn: () => api.get<AwardsData>(`/admin/missions/${mission.id}/awards`), enabled: hasRibbons && mission.status === 'closed' });
  if (!hasRibbons && mission.status !== 'closed') return null;
  return (
    <section className="card report-section awards-section">
      <span className="label">Reconhecimento</span><h2>Condecorações da operação</h2>
      {mission.status !== 'closed'
        ? <p className="muted">Publique o relatório da missão para conceder as condecorações aos pilotos que participaram. Depois da publicação, você ainda pode voltar aqui para conceder ou revogar.</p>
        : <>
          <p className="muted">Marque a fita de cada piloto que cumpriu o requisito. Desmarcar revoga a condecoração. Tudo fica registrado em Atividade.</p>
          <RibbonReview key={mission.ribbons.map((r) => r.id).join()} mission={mission} />
          {!hasRibbons && <p className="muted">Esta missão não tem fitas vinculadas. Abra \"Fitas desta missão\" para escolher.</p>}
          {query.isLoading && <p className="loading">Carregando…</p>}
          {query.error && <p role="alert" className="op-error">{errorMessage(query.error)}</p>}
          {query.data && <AwardsForm key={JSON.stringify(query.data.awards)} mission={mission} data={query.data} />}
        </>}
    </section>
  );
}
