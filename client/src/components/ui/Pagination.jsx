import Button from './Button.jsx'

/** Previous / Next pagination with a "Page X of Y" label. */
export default function Pagination({ page, totalPages, onChange, label = 'Pagination' }) {
  if (totalPages <= 1) return null
  return (
    <nav className="pagination" aria-label={label}>
      <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span aria-current="page">
        Page {page} of {totalPages}
      </span>
      <Button size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </nav>
  )
}
