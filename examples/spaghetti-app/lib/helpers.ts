// Month 3: a different session, a different tool, no memory of utils/.
// The agent rewrote both helpers under new names. (This is the 8x problem.)

export function makeUrlSlug(text: string): string {
  const lowered = text.toLowerCase().trim();
  const cleaned = lowered.replace(/[^a-z0-9\s-]/g, "");
  const collapsed = cleaned.replace(/[\s-]+/g, "-");
  return collapsed.replace(/^-+|-+$/g, "");
}

export function prettyDate(iso: string, locale: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString(locale, { day: '2-digit' });
  const month = date.toLocaleDateString(locale, { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}
