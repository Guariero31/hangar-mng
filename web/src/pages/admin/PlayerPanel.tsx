import { runOperation } from '../../lib/mutations';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  useAdminTree, useDeletePlayer, useGrantAircraft, useMe, usePlayer, useRenamePlayer, useRevokeAircraft, useUpdatePlayer,
} from '../../api/hooks';
import './admin.css';
import { MedalGrid } from '../../components/MedalStrip';
import { useToast } from '../../components/Toast';
import { Select } from '../../components/Select';
import { fmtDate, fmtPoints, fmtSigned, SOURCE_LABEL } from '../../lib/format';

/** Painel lateral com os dados e as ações de um jogador */
export function PlayerPanel({ id, onDeleted }: { id: string; onDeleted?: () => void }) {
  const { data: me } = useMe();
  const { data, isLoading, error } = usePlayer(id);
  const { data: tree } = useAdminTree();
  const grant = useGrantAircraft();
  const revoke = useRevokeAircraft();
  const update = useUpdatePlayer();
  const rename = useRenamePlayer();
  const del = useDeletePlayer();
  const [confirmText, setConfirmText] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [newNick, setNewNick] = useState('');
  const toast = useToast();

  const [refund, setRefund] = useState(false);
  const [grantId, setGrantId] = useState('');

  if (isLoading) return <div className="loading">CARREGANDO…</div>;
  if (error || !data) return <div className="empty">{errorMessage(error)}</div>;

  const { user, balance, aircraft, ledger, dcsLink, achievements } = data;
  const label = user.nickname ?? user.email;
  const owned = new Set(aircraft.map((a) => a.aircraftId));
  const freeTiers = new Set((tree?.tiers ?? []).filter((t) => t.cost === 0).map((t) => t.tier));
  const tierLabel = (n: number) => tree?.tiers.find((t) => t.tier === n)?.label ?? n;
  const notOwned = (tree?.aircraft ?? []).filter((a) => !owned.has(a.id) && !freeTiers.has(a.tier) && a.active);
  const isMe = me?.id === user.id;
  const banned = user.status === 'banned';

  const run = (p: Promise<unknown>, ok: string) =>
    runOperation(p, () => toast(ok), error => toast(errorMessage(error), 'err'));

  return (
    <>
      <div className="detail-head">
        <span className="label">Jogador</span>
        {!renaming ? (
          <div className="nick-row">
            <h2 className="mono" style={{ marginTop: 6 }}>{user.nickname ?? '(sem nickname)'}</h2>
            <button type="button" className="link-btn" onClick={() => { setNewNick(user.nickname ?? ''); setRenaming(true); }}>Renomear</button>
          </div>
        ) : (
          <form className="nick-row" onSubmit={(e) => {
            e.preventDefault();
            run(rename.mutateAsync({ id, nickname: newNick.trim() }), `Nickname alterado para ${newNick.trim()}.`).then(success => { if (success) setRenaming(false); });
          }}>
            <input className="input" value={newNick} maxLength={16} autoFocus aria-label="Novo nickname"
              onChange={(e) => setNewNick(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)} />
            <button className="btn" disabled={rename.isPending || !newNick.trim()}>Salvar</button>
            <button type="button" className="btn ghost" onClick={() => setRenaming(false)}>Cancelar</button>
          </form>
        )}
        <div className="who">
          <span className="muted" style={{ fontSize: 13 }}>{user.email}</span>
          {user.role === 'admin' && <span className="badge info">admin</span>}
          {banned ? <span className="badge danger">suspenso</span> : user.status === 'pending' ? <span className="badge">pendente</span> : user.status === 'rejected' ? <span className="badge danger">recusado</span> : <span className="badge ok">ativo</span>}
          {dcsLink && <span className="badge ok" title={`UCID ${dcsLink.ucid}`}>DCS vinculado</span>}
        </div>
        <div className="balance-big">{fmtPoints(balance)} <span className="label">PM</span></div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Cadastro {fmtDate(user.createdAt)}{user.lastLoginAt && ` · último acesso ${fmtDate(user.lastLoginAt)}`}
        </div>
      </div>

      <div className="section">
        <span className="label">Aeronaves compradas ({aircraft.length})</span>
        <span className="hint" style={{ minHeight: 0 }}>As aeronaves de tiers gratuitos já estão na frota de todos.</span>
        <ul className="ac-list">
          {!aircraft.length && <li className="muted">Nenhuma ainda.</li>}
          {aircraft.map((a) => (
            <li key={a.aircraftId}>
              <span>{a.name} <span className="tag">· tier {a.tierLabel}{a.grantedBy ? ` · liberada por ${a.grantedBy}` : ''}</span></span>
              <button className="btn danger sm" data-revoke={a.aircraftId} disabled={revoke.isPending}
                onClick={() => {
                  if (!confirm(`Revogar ${a.name}${refund ? ' e devolver os PM' : ''}?`)) return;
                  run(revoke.mutateAsync({ id, aircraftId: a.aircraftId, refund }), 'Aeronave revogada.');
                }}>
                Revogar
              </button>
            </li>
          ))}
        </ul>
        {aircraft.length > 0 && (
          <label className="check">
            <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} /> Devolver os PM ao revogar
          </label>
        )}
        {notOwned.length > 0 && (
          <div className="row-inline">
            <Select aria-label="Aeronave" value={grantId || notOwned[0].id} onChange={setGrantId} options={notOwned.map((a) => ({ value: a.id, label: `Tier ${tierLabel(a.tier)} · ${a.name}` }))} />
            <button className="btn ghost sm" disabled={grant.isPending}
              onClick={() => {
                const aircraftId = grantId && !owned.has(grantId) ? grantId : notOwned[0].id;
                run(grant.mutateAsync({ id, aircraftId }), 'Aeronave liberada.').then(() => setGrantId(''));
              }}>
              Liberar grátis
            </button>
          </div>
        )}
      </div>

      <div className="section">
        <span className="label">Conta</span>
        {isMe ? (
          <span className="muted" style={{ fontSize: 14 }}>Esta é a sua conta.</span>
        ) : (
          <div className="row-inline">
            {banned ? (
              <button className="btn ok" disabled={update.isPending}
                onClick={() => run(update.mutateAsync({ id, status: 'active' }), 'Jogador reativado.')}>
                Reativar
              </button>
            ) : (
              <button className="btn danger" disabled={update.isPending}
                onClick={() => {
                  if (!confirm(`Suspender ${label}? Ele perde o acesso ao site.`)) return;
                  run(update.mutateAsync({ id, status: 'banned' }), 'Jogador suspenso.');
                }}>
                Suspender
              </button>
            )}
            <button className="btn ghost" disabled={update.isPending}
              onClick={() => {
                const role = user.role === 'admin' ? 'player' : 'admin';
                if (!confirm(role === 'admin' ? `Tornar ${label} administrador?` : `Remover o acesso de admin de ${label}?`)) return;
                run(update.mutateAsync({ id, role }), role === 'admin' ? 'Agora é admin.' : 'Não é mais admin.');
              }}>
              {user.role === 'admin' ? 'Remover admin' : 'Tornar admin'}
            </button>
          </div>
        )}
      </div>

      <div className="section">
        <span className="label">Conquistas · {achievements.earned} de {achievements.total}</span>
        <MedalGrid items={achievements.items} />
      </div>

      <div className="section">
        <span className="label">Histórico de PM</span>
        <ul className="ledger">
          {!ledger.length && <li className="muted" style={{ display: 'block' }}>Nenhum lançamento.</li>}
          {ledger.map((l) => (
            <li key={l.id}>
              <span className="when">{fmtDate(l.createdAt)}</span>
              <span>
                {l.reason}{' '}
                <span className="muted" style={{ fontSize: 11 }}>· {SOURCE_LABEL[l.source]}{l.createdBy ? ` (${l.createdBy})` : ''}</span>
              </span>
              <span className={`amt ${l.amount > 0 ? 'pos' : 'neg'}`}>{fmtSigned(l.amount)}</span>
            </li>
          ))}
        </ul>
      </div>

      {!isMe && user.role !== 'admin' && (
        <div className="section danger-zone">
          <span className="label" style={{ color: 'var(--danger)' }}>Excluir conta</span>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 10px' }}>
            Apaga a conta de <b>{label}</b> e todo o histórico dela: PM, frota, medalhas e meta. Não dá para desfazer.
            Para só bloquear o acesso, use Suspender.
          </p>
          <label className="muted" style={{ fontSize: 13 }}>Digite <b className="mono">{label}</b> para confirmar</label>
          <div className="row-inline" style={{ marginTop: 6 }}>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={label} autoComplete="off" />
            <button className="btn danger" id="delete-user" disabled={del.isPending || confirmText.trim() !== label}
              onClick={() => run(del.mutateAsync(id), `Conta de ${label} excluída.`).then(() => { setConfirmText(''); onDeleted?.(); })}>
              Excluir
            </button>
          </div>
        </div>
      )}
      {!isMe && user.role === 'admin' && (
        <div className="section"><span className="muted" style={{ fontSize: 13 }}>Para excluir uma conta de admin, remova antes o acesso de admin dela.</span></div>
      )}
    </>
  );
}
