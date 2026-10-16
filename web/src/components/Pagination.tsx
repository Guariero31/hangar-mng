export function Pagination({ offset, total, pageSize = 50, busy = false, onChange }: {
  offset: number; total: number; pageSize?: number; busy?: boolean; onChange: (offset: number) => void;
}) {
  if (total <= pageSize && offset === 0) return null;
  return <nav className="toolbar" aria-label="Paginação">
    <button className="btn ghost sm" disabled={busy || offset === 0} onClick={() => onChange(Math.max(0, offset - pageSize))}>Anterior</button>
    <span>{Math.min(offset + 1, total)}–{Math.min(offset + pageSize, total)} de {total}</span>
    <button className="btn ghost sm" disabled={busy || offset + pageSize >= total} onClick={() => onChange(offset + pageSize)}>Próxima</button>
  </nav>;
}
