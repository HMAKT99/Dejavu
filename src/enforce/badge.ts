import type { ScoreCard } from './score.js';

/**
 * Local SVG badge for READMEs — shields.io look, zero network. Every badge
 * in a README is an ad; every regeneration is a re-check.
 */

function color(score: number): string {
  if (score >= 90) return '#4c1'; // green
  if (score >= 80) return '#97ca00';
  if (score >= 70) return '#dfb317'; // yellow
  if (score >= 60) return '#fe7d37'; // orange
  return '#e05d44'; // red
}

// ~6.1px per char at font-size 11 in Verdana — the shields.io approximation
function width(text: string): number {
  return Math.round(text.length * 6.1) + 12;
}

export function renderBadge(card: ScoreCard): string {
  const label = 'dejavu';
  const value = `${card.score}/100 ${card.grade}`;
  const lw = width(label);
  const vw = width(value);
  const total = lw + vw;
  const c = color(card.score);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${label}: ${value}">
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${total}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="20" fill="#555"/>
    <rect x="${lw}" width="${vw}" height="20" fill="${c}"/>
    <rect width="${total}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${lw / 2}" y="14">${label}</text>
    <text x="${lw + vw / 2}" y="14">${value}</text>
  </g>
</svg>
`;
}
