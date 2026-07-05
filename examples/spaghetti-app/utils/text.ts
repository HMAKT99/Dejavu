// Week 1: the canonical slugify.
export function slugify(input: string): string {
  const lowered = input.toLowerCase().trim();
  const cleaned = lowered.replace(/[^a-z0-9\s-]/g, '');
  const collapsed = cleaned.replace(/[\s-]+/g, '-');
  return collapsed.replace(/^-+|-+$/g, '');
}
