// Returns a "days ago" string for a date input. Returns '' for falsy/invalid
// dates so callers can `&&`-render conditionally.
export function getDaysAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Math.abs(new Date() - date);
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}
