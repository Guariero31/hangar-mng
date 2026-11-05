// Concessão de condecorações fora de missões (reconhecimentos avulsos) e lista das já concedidas.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';
import { Select } from '../../components/Select';
import type { RibbonRow } from './RibbonsAdmin';

interface Grant { id: string; userId: string; nickname: string; ribbonId: string; ribbonName: string; valor: boolean; reason: string; createdAt: string }
interface PlayerOption { id: string; nickname: string | null }

export function RibbonGrants({ ribbons }: { ribbons: RibbonRow[] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [ribbonId, setRibbonId] = useState('');
  const [valor, setValor] = useState(false);
  const [reason, setReason] = useState('');
  const [limit, setLimit] = useState(50);
  const players = useQuery({ queryKey: ['admin', 'players', 'grant-options'], queryFn: () => api.get<{ players: PlayerOption[] }>('/admin/players?limit=1000&filter=active&sort=nickname&direction=asc') });
  const grants = useQuery({ queryKey: ['admin', 'ribbon-grants', limit], queryFn: () => api.get<{ items: Grant[]; total: number }>(`/admin/ribbon-grants?limit=${limit}`), placeholderData: (prev) => prev });
  const ribbon = ribbons.find((r) => r.id === ribbonId);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin', 'ribbon-grants'] }); qc.invalidateQueries({ queryKey: ['admin', 'activity'] }); };
  const grant = useMutation({
    mutationFn: () => api.post('/admin/ribbon-grants', { userId, ribbonId, valor: valor && !!ribbon?.allowsValor, reason }),
    onSuccess: () => { refresh(); setReason(''); setValor(false); toast('Condecoração concedida.'); },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/admin/ribbon-grants/${id}`),
    onSuccess: () => { refresh(); toast('Condecoração revogada.'); },
  });
  const pilots = (players.data?.players ?? []).filter((p) => p.nickname);
  const active = ribbons.filter((r) => r.active);
  return (
    <section className="card rb-grants" aria-label="Conceder fora de missão">
      <h2>Conceder fora de missão</h2>
      <p className="muted">Para reconhecimentos que não vêm de um relatório: eventos, tempo de casa, ajuda à esquadra. Só honra, sem PM. Aparece na estante do piloto.</p>
      <form className="rb-grant-form" onSubmit={(e) => { e.preventDefault(); grant.mutate(); }}>
        <label><span>Piloto</span>
          <Select aria-label="Piloto" value={userId} options={[{ value: '', label: 'Escolha o piloto…' }, ...pilots.map((p) => ({ value: p.id, label: p.nickname as string }))]} onChange={setUserId} />
        </label>
        <label><span>Condecoração</span>
          <Select aria-label="Condecoração" value={ribbonId} options={[{ value: '', label: 'Escolha a fita…' }, ...active.map((r) => ({ value: r.id, label: r.name }))]} onChange={(v) => { setRibbonId(v); setValor(false); }} />
        </label>
        <label className="rb-grant-reason"><span>Motivo (opcional)</span>
          <input type="text" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Campeonato interno de abril" />
        </label>
        {ribbon?.allowsValor && <label className="rb-grant-valor"><input type="checkbox" checked={valor} onChange={(e) => setValor(e.target.checked)} /> Com "V" de valor</label>}
        <button type="submit" className="btn" disabled={!userId || !ribbonId || grant.isPending}>{grant.isPending ? 'Concedendo…' : 'Conceder'}</button>
      </form>
      {(grant.error || revoke.error) && <p role="alert" className="op-error">{errorMessage(grant.error || revoke.error)}</p>}
      <h3>Concessões avulsas</h3>
      {grants.isLoading && <p>Carregando…</p>}
      {grants.data && !grants.data.items.length && <p className="muted">Nenhuma concessão avulsa ainda.</p>}
      <ul className="rb-grant-list">
        {grants.data?.items.map((g) => (
          <li key={g.id}>
            <span><strong>{g.nickname}</strong> · {g.ribbonName}{g.valor ? ' com V' : ''}{g.reason ? ` · ${g.reason}` : ''} <small className="muted">{new Date(g.createdAt).toLocaleDateString('pt-BR')}</small></span>
            <button type="button" className="btn ghost" disabled={revoke.isPending} onClick={() => { if (window.confirm(`Revogar ${g.ribbonName} de ${g.nickname}?`)) revoke.mutate(g.id); }}>Revogar</button>
          </li>
        ))}
      </ul>
      {grants.data && grants.data.total > grants.data.items.length && <button type="button" className="btn ghost" onClick={() => setLimit((n) => Math.min(200, n + 50))}>Mostrar mais ({grants.data.items.length} de {grants.data.total})</button>}
    </section>
  );
}
