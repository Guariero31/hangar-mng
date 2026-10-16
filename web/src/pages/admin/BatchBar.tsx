// Barra de lançamento de PM em lote: aparece quando há jogadores marcados na lista.
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { useAddPointsBatch } from '../../api/hooks';
import { useToast } from '../../components/Toast';
import { fmtPoints, fmtSigned } from '../../lib/format';

export function BatchBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  const batch = useAddPointsBatch();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);

  const n = Number(amount);
  const valid = Number.isInteger(n) && n !== 0 && reason.trim().length > 0;
  const total = valid ? n * ids.length : 0;

  function send() {
    batch.mutate({ userIds: ids, amount: n, reason: reason.trim() }, {
      onSuccess: (r) => {
        toast(`${fmtSigned(n)} PM lançados para ${r.count} piloto${r.count > 1 ? 's' : ''} (${fmtSigned(r.total)} PM no total).`);
        setAmount(''); setReason(''); setConfirming(false); onClear();
      },
      onError: (e) => { toast(errorMessage(e), 'err'); setConfirming(false); },
    });
  }

  return (
    <div className="batch" role="region" aria-label="Lançamento em lote">
      <div className="batch-count">
        <strong>{ids.length}</strong> selecionado{ids.length > 1 ? 's' : ''}
        <button type="button" className="link" onClick={onClear}>limpar</button>
      </div>
      <input className="input" type="number" step="1" placeholder="PM (ex.: +500)" value={amount}
        onChange={(e) => { setAmount(e.target.value); setConfirming(false); }} aria-label="PM por jogador" />
      <input className="input batch-reason" type="text" maxLength={200} placeholder="Motivo (ex.: Op Red Flag 12/10)" value={reason}
        onChange={(e) => { setReason(e.target.value); setConfirming(false); }} aria-label="Motivo" />
      {!confirming
        ? <button className="btn" disabled={!valid} onClick={() => setConfirming(true)}>Lançar para {ids.length}</button>
        : (
          <span className="batch-confirm">
            <span>{fmtSigned(n)} PM × {ids.length} = <strong>{fmtSigned(total)} PM</strong></span>
            <button className="btn" disabled={batch.isPending} onClick={send}>{batch.isPending ? 'Lançando…' : 'Confirmar'}</button>
            <button className="btn ghost" disabled={batch.isPending} onClick={() => setConfirming(false)}>Cancelar</button>
          </span>
        )}
      {valid && !confirming && n < 0 && <span className="muted batch-hint">Valor negativo remove {fmtPoints(Math.abs(n))} PM de cada um.</span>}
    </div>
  );
}
