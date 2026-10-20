/** A status pill: always shows the text label, colour is only a supporting cue. */
export default function StatusBadge({ status, map }) {
  const entry = map[status] ?? { label: status, tone: '' }
  return <span className={`badge${entry.tone ? ` badge-${entry.tone}` : ''}`}>{entry.label}</span>
}
