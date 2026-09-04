import { describe, expect, it } from 'vitest';
import { detectGaps, toMonthIndex } from '../gaps';
import type { Role } from '@/types';

const role = (id: string, startDate: string, endDate: string | null): Role => ({
  id,
  employer: id,
  title: 't',
  startDate,
  endDate,
  bullets: [],
});

describe('toMonthIndex', () => {
  it('reads named months, ISO, and numeric forms', () => {
    expect(toMonthIndex('March 2021', 'start')).toBe(2021 * 12 + 2);
    expect(toMonthIndex('2021-03', 'start')).toBe(2021 * 12 + 2);
    expect(toMonthIndex('03/2021', 'start')).toBe(2021 * 12 + 2);
  });

  it('rounds bare years toward the edge that avoids a phantom gap', () => {
    expect(toMonthIndex('2019', 'end')).toBe(2019 * 12 + 11);
    expect(toMonthIndex('2020', 'start')).toBe(2020 * 12);
  });

  it('treats present-tense endings as open', () => {
    expect(toMonthIndex('Present', 'end')).toBeNull();
    expect(toMonthIndex(null, 'end')).toBeNull();
  });
});

describe('detectGaps', () => {
  it('finds a gap longer than three months between consecutive roles', () => {
    const roles = [
      role('recent', 'March 2021', null),
      role('older', 'June 2018', 'November 2019'),
    ];
    const gaps = detectGaps(roles);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ afterRoleId: 'older', beforeRoleId: 'recent', months: 16 });
  });

  it('ignores gaps of three months or less', () => {
    const roles = [role('b', 'March 2021', null), role('a', 'June 2018', 'January 2021')];
    expect(detectGaps(roles)).toEqual([]);
  });

  it('does not invent a gap across a bare-year boundary', () => {
    const roles = [role('b', '2020', null), role('a', '2018', '2019')];
    expect(detectGaps(roles)).toEqual([]);
  });

  it('reports an open trailing gap when the latest role has ended', () => {
    const roles = [role('b', 'January 2015', 'March 2016')];
    const gaps = detectGaps(roles);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].beforeRoleId).toBeNull();
  });
});
