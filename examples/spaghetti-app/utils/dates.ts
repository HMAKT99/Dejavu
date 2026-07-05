// The original date helpers — written in week 1, still fine.
export function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString(locale, { day: '2-digit' });
  const month = date.toLocaleDateString(locale, { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const ms = Math.abs(to - from);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
