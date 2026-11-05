// Painel laranja do relatório rápido: itens que o Tacview não resolveu sozinho e precisam de decisão do admin.
import { Select } from '../../components/Select';
import type { ReportPilot } from '../../api/types';
import { mmss, type AnalyzedPilot, type Doubt } from './quick-shared';

interface Props {
  pendingCount: number; unlinked: AnalyzedPilot[]; doubts: Doubt[]; resolved: Record<number, string>;
  rows: ReportPilot[]; pilotOptions: { value: string; label: string }[];
  onLink: (a: AnalyzedPilot, userId: string) => void; onResolve: (i: number, text: string) => void; onUndo: (i: number) => void;
  onAssign: (i: number, userId: string) => void; onLost: (i: number) => void;
}

export function QuickDoubts({ pendingCount, unlinked, doubts, resolved, rows, pilotOptions, onLink, onResolve, onUndo, onAssign, onLost }: Props) {
  return (
    <section className="rq-doubts" aria-label="Itens para conferir">
      <div className="rq-doubts-title">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5" /><path d="M12 18v.01" /></svg>
        <strong>{pendingCount ? `${pendingCount} ${pendingCount === 1 ? 'item precisa' : 'itens precisam'} da sua decisão antes de publicar` : 'Todos os itens foram resolvidos'}</strong>
      </div>
      {unlinked.map((a) => (
        <div key={a.key} className="rq-doubt">
          <span><strong>{a.name}</strong> aparece no arquivo, mas não bate com nenhum inscrito. <span className="muted">Voou {a.aircraft.join(', ')} · {Object.values(a.counts).reduce((n, v) => n + (v ?? 0), 0)} alvos.</span></span>
          <Select aria-label={`Vincular ${a.name} a um inscrito`} value="" options={[{ value: '', label: 'Vincular a…' }, ...pilotOptions]} onChange={(v) => v && onLink(a, v)} />
        </div>
      ))}
      {doubts.map((d, i) => (
        <div key={i} className={`rq-doubt${resolved[i] ? ' done' : ''}`}>
          <span>{d.kind === 'vanished' ? <><strong>{d.label}</strong> sumiu do mapa aos {mmss(d.tSec)}, sem ação inimiga detectada.</> : <><strong>Abate sem dono:</strong> {d.label} destruído aos {mmss(d.tSec)} sem arma de nenhum piloto por perto.</>} <span className="muted">{d.kind === 'unclaimed' ? 'Fica fora da pontuação até você atribuir.' : d.detail}</span></span>
          {resolved[i] ? <span className="rq-done">{resolved[i]} <button type="button" className="rq-btn" onClick={() => onUndo(i)}>Desfazer</button></span>
            : d.kind === 'vanished' ? (
              <span className="rq-actions">
                <button type="button" className="rq-btn warn" onClick={() => onResolve(i, 'Mantido como sobreviveu')}>Sobreviveu</button>
                <button type="button" className="rq-btn" onClick={() => onLost(i)}>Foi perdido</button>
              </span>
            ) : (
              <span className="rq-actions">
                <Select aria-label="Atribuir a um piloto" value="" options={[{ value: '', label: 'Atribuir a um piloto…' }, ...pilotOptions.filter((o) => rows.find((p) => p.userId === o.value)?.attended !== false)]} onChange={(v) => v && onAssign(i, v)} />
                <button type="button" className="rq-btn" onClick={() => onResolve(i, 'Ignorado')}>Ignorar</button>
              </span>
            )}
        </div>
      ))}
    </section>
  );
}
