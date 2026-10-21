export function Pagination({ offset, total, pageSize = 50, busy = false, onChange }: {
  offset: number; total: number; pageSize?: number; busy?: boolean; onChange: (offset: number) => void;
}) {
  if (total <= pageSize && offset === 0) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;
  const pages = Array.from(new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]))
    .filter(page => page >= 1 && page <= pageCount).sort((first, second) => first - second);
  return <nav className="pagination" aria-label="Paginação" aria-busy={busy}>
    <span className="pagination-summary" role="status"><strong>{Math.min(offset + 1, total)}–{Math.min(offset + pageSize, total)}</strong> de <strong>{total.toLocaleString('pt-BR')}</strong> registros</span>
    <div className="pagination-controls">
      <button type="button" className="pagination-direction" aria-label="Página anterior" disabled={busy || offset === 0} onClick={() => onChange(Math.max(0, offset - pageSize))}><span aria-hidden="true">←</span><span className="pagination-direction-label">Anterior</span></button>
      <div className="pagination-pages">{pages.map((page, index) => <span className="pagination-page-group" key={page}>
        {index > 0 && page - pages[index - 1] > 1 && <span className="pagination-ellipsis" aria-hidden="true">…</span>}
        <button type="button" aria-label={`Página ${page}`} aria-current={page === currentPage ? 'page' : undefined} disabled={busy} onClick={() => onChange((page - 1) * pageSize)}>{page}</button>
      </span>)}</div>
      <span className="pagination-mobile-page">{currentPage} / {pageCount}</span>
      <button type="button" className="pagination-direction" aria-label="Próxima página" disabled={busy || offset + pageSize >= total} onClick={() => onChange(offset + pageSize)}><span className="pagination-direction-label">Próxima</span><span aria-hidden="true">→</span></button>
    </div>
  </nav>;
}
import './pagination.css';

