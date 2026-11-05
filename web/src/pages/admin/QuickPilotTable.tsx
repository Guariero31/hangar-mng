// Tabela única do relatório rápido: um piloto por linha, com detalhe dos alvos ao clicar.
import { fmtPoints } from '../../lib/format';
import { previewPilot, REPORT_TARGETS } from '../../lib/mission-report';
import type { ReportPilot, ReportTarget } from '../../api/types';
import { totalTargets } from './quick-shared';

interface Props {
  rows: ReportPilot[]; calc: (p: ReportPilot) => ReturnType<typeof previewPilot>; flagged: Set<string>; open: string;
  targetsTotal: number; baseTotal: number; totalPm: number;
  onOpen: (userId: string) => void; patch: (userId: string, change: Partial<ReportPilot>) => void; setCount: (userId: string, key: ReportTarget, value: number) => void;
}

export function QuickPilotTable({ rows, calc, flagged, open, targetsTotal, baseTotal, totalPm, onOpen, patch, setCount }: Props) {
  return (
      <section className="rq-table" aria-label="Pontuação por piloto">
        <div className="rq-row rq-head-row"><span>Piloto</span><span>Aeronave</span><span className="num">Alvos</span><span className="ctr">Sobreviveu</span><span className="num">Base</span><span className="num">PM</span></div>
        {rows.map((p) => {
          const c = calc(p);
          const isOpen = open === p.userId;
          return (
            <div key={p.userId} className={`rq-item${flagged.has(p.userId) ? ' flag' : ''}${p.attended === false ? ' off' : ''}`}>
              <div className="rq-row">
                <button type="button" className="rq-name" aria-expanded={isOpen} onClick={() => onOpen(isOpen ? '' : p.userId)}>{p.nickname}{flagged.has(p.userId) && <em>Conferir</em>}</button>
                <span className="muted">{p.aircraftName}</span>
                <span className="num">{totalTargets(p)}</span>
                <span className="ctr">{p.attended === false ? <span className="muted">Não voou</span> : <button type="button" className={`rq-chip ${p.survived ? 'ok' : p.survived === false ? 'no' : ''}`} aria-pressed={!!p.survived} onClick={() => patch(p.userId, { attended: true, survived: !p.survived })}>{p.survived ? 'Sim' : p.survived === false ? 'Não' : '—'}</button>}</span>
                <span className="num">{fmtPoints(c.subtotal)}</span>
                <span className="num rq-pm">{fmtPoints(c.total)}</span>
              </div>
              {isOpen && (
                <div className="rq-detail">
                  <label className="rq-voou"><input type="checkbox" checked={!!p.attended} onChange={(e) => patch(p.userId, e.target.checked ? { attended: true, survived: p.survived ?? true } : { attended: false })} /> Participou da missão</label>
                  <div className="rq-counts">
                    {REPORT_TARGETS.map(({ key, label }) => (
                      <label key={key}><span>{label}</span><input type="number" min={0} max={99} disabled={!p.attended} value={p.counts[key]} onChange={(e) => setCount(p.userId, key, Number(e.target.value))} /></label>
                    ))}
                  </div>
                  <p className="muted">Base {fmtPoints(c.subtotal)}{c.aircraftBonus ? ` · bônus da aeronave +${fmtPoints(c.aircraftBonus)}` : ''}{c.survivalBonus ? ` · bônus de sobrevivência +${fmtPoints(c.survivalBonus)}` : ''}</p>
                </div>
              )}
            </div>
          );
        })}
        <div className="rq-row rq-total"><span className="rq-total-label">Total</span><span /><span className="num">{targetsTotal}</span><span /><span className="num">{fmtPoints(baseTotal)}</span><span className="num rq-pm big">{fmtPoints(totalPm)}</span></div>
      </section>
  );
}
