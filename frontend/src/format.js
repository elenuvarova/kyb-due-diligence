// Shared date formatter so every panel renders dates the same way (and Distress stops
// showing raw ISO strings). Falls back to the original value if it isn't a valid date.
export function formatDate(value) {
  if (!value) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
