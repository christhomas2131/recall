import type { Gap, Role } from '@/types';

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

const GAP_THRESHOLD_MONTHS = 3;

/**
 * Absolute month index for a free-form date string, or null if unreadable.
 * `edge` decides what a bare year means: a start date rounds to January,
 * an end date rounds to December, so "2019" -> "2020" is not a gap.
 */
export function toMonthIndex(raw: string | null, edge: 'start' | 'end'): number | null {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase();
  if (!s || /present|current|now|ongoing/.test(s)) return null;

  const yearMatch = s.match(/(19|20)\d{2}/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[0]);

  let month: number | null = null;

  const named = MONTHS.findIndex((m) => s.includes(m));
  if (named !== -1) month = named;

  if (month === null) {
    const iso = s.match(/(19|20)\d{2}[-/](\d{1,2})/);
    if (iso) month = Math.min(12, Math.max(1, Number(iso[2]))) - 1;
  }
  if (month === null) {
    const numeric = s.match(/(\d{1,2})[-/](19|20)\d{2}/);
    if (numeric) month = Math.min(12, Math.max(1, Number(numeric[1]))) - 1;
  }
  if (month === null) month = edge === 'start' ? 0 : 11;

  return year * 12 + month;
}

function nowMonthIndex(): number {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
}

/**
 * Roles arrive most-recent-first. Gaps are computed chronologically:
 * `afterRoleId` is the earlier role, `beforeRoleId` the later one, or null
 * when the gap runs from the last role held up to today.
 */
export function detectGaps(roles: Role[]): Gap[] {
  const chronological = [...roles].reverse();
  const gaps: Gap[] = [];

  for (let i = 0; i < chronological.length - 1; i++) {
    const earlier = chronological[i];
    const later = chronological[i + 1];
    const end = toMonthIndex(earlier.endDate, 'end');
    const start = toMonthIndex(later.startDate, 'start');
    if (end === null || start === null) continue;
    const months = start - end;
    if (months > GAP_THRESHOLD_MONTHS) {
      gaps.push({ afterRoleId: earlier.id, beforeRoleId: later.id, months });
    }
  }

  const mostRecent = chronological[chronological.length - 1];
  if (mostRecent) {
    const end = toMonthIndex(mostRecent.endDate, 'end');
    if (end !== null) {
      const months = nowMonthIndex() - end;
      if (months > GAP_THRESHOLD_MONTHS) {
        gaps.push({ afterRoleId: mostRecent.id, beforeRoleId: null, months });
      }
    }
  }

  return gaps;
}

export function describeGap(gap: Gap, roles: Role[]): string {
  const after = roles.find((r) => r.id === gap.afterRoleId);
  const before = gap.beforeRoleId ? roles.find((r) => r.id === gap.beforeRoleId) : null;
  const tail = before ? `and ${before.employer}` : 'and now';
  return `${gap.months} months between ${after?.employer ?? 'a role'} ${tail}`;
}
