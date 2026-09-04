import { describe, expect, it } from 'vitest';
import { enforceDistribution, type DraftQuestion } from '../distribution';
import type { Role } from '@/types';

const roles: Role[] = [
  {
    id: 'ops',
    employer: 'Northline Health',
    title: 'Program Operations Lead',
    startDate: '2021',
    endDate: null,
    bullets: ['Ran grants operations across 53 partner organizations', 'Built the burn-rate tracker'],
  },
  {
    id: 'saas',
    employer: 'Broadfield Systems',
    title: 'Senior Analyst, Client Delivery',
    startDate: '2018',
    endDate: '2020',
    bullets: ['Owned implementation delivery for six enterprise SaaS customers', 'Wrote the migration runbook'],
  },
  {
    id: 'housing',
    employer: 'Lakeshore Housing',
    title: 'Field Coordinator',
    startDate: '2016',
    endDate: '2018',
    bullets: ['Coordinated intake and case assignment', 'Redesigned the paper intake form'],
  },
];

const draft = (text: string, sourceRoleId: string): DraftQuestion => ({
  text,
  category: 'behavioral',
  sourceRoleId,
});

function counts(questions: DraftQuestion[]) {
  const map = new Map<string, number>();
  for (const q of questions) map.set(q.sourceRoleId, (map.get(q.sourceRoleId) ?? 0) + 1);
  return map;
}

describe('enforceDistribution', () => {
  it('caps a hogging role at the achievable share', () => {
    const questions = Array.from({ length: 15 }, (_, i) => draft(`Question ${i}`, 'ops'));
    const result = enforceDistribution(questions, roles);
    const cap = Math.max(Math.floor(15 * 0.3), Math.ceil(15 / roles.length));
    for (const [, n] of counts(result)) expect(n).toBeLessThanOrEqual(cap);
    expect(result).toHaveLength(15);
  });

  it('keeps a distribution that already satisfies the rule', () => {
    const questions = [
      draft('a', 'ops'),
      draft('b', 'saas'),
      draft('c', 'housing'),
      draft('d', 'ops'),
      draft('e', 'saas'),
      draft('f', 'housing'),
    ];
    expect(enforceDistribution(questions, roles).map((q) => q.sourceRoleId)).toEqual(
      questions.map((q) => q.sourceRoleId),
    );
  });

  it('prefers the role whose bullets share keywords when breaking ties', () => {
    const questions = [
      draft('Tell me about the intake form you redesigned', 'ops'),
      draft('Tell me about enterprise SaaS implementation delivery', 'ops'),
      draft('Generic question one', 'ops'),
      draft('Generic question two', 'ops'),
    ];
    const result = enforceDistribution(questions, roles);
    const byText = new Map(result.map((q) => [q.text, q.sourceRoleId]));
    expect(byText.get('Tell me about the intake form you redesigned')).toBe('housing');
    expect(byText.get('Tell me about enterprise SaaS implementation delivery')).toBe('saas');
  });

  it('skips the rule for a single-role resume', () => {
    const one = [roles[0]];
    const questions = Array.from({ length: 10 }, (_, i) => draft(`Q${i}`, 'ops'));
    expect(enforceDistribution(questions, one).every((q) => q.sourceRoleId === 'ops')).toBe(true);
  });

  it('rehomes a question pointing at an unknown role', () => {
    const questions = [draft('a', 'ghost'), draft('b', 'ops'), draft('c', 'saas')];
    const result = enforceDistribution(questions, roles);
    expect(result.every((q) => roles.some((r) => r.id === q.sourceRoleId))).toBe(true);
  });
});

describe('the 30% ceiling against real role counts', () => {
  const draftsFor = (n: number, roleId: string) =>
    Array.from({ length: n }, (_, i) => draft(`Question ${i}`, roleId));

  it('cannot reach 30% with three roles, so it lands on the even split', () => {
    // 3 roles x 30% of 15 = 12 slots for 15 questions. Unsatisfiable by
    // arithmetic, so the strictest achievable distribution is 1/3 each.
    const result = enforceDistribution(draftsFor(15, 'ops'), roles);
    const share = [...counts(result).values()];
    expect(share.every((n) => n <= 5)).toBe(true);
    expect(share.reduce((a, b) => a + b, 0)).toBe(15);
    expect(Math.max(...share) / 15).toBeCloseTo(1 / 3, 5);
  });

  it('does honour the literal 30% rule once there are four roles', () => {
    const fourRoles = [
      ...roles,
      {
        id: 'analytics',
        employer: 'Meridian Data',
        title: 'Reporting Analyst',
        startDate: '2014',
        endDate: '2016',
        bullets: ['Built the weekly executive dashboard in SQL'],
      },
    ];
    const result = enforceDistribution(draftsFor(15, 'ops'), fourRoles);
    for (const [, n] of counts(result)) {
      expect(n / 15).toBeLessThanOrEqual(0.3);
    }
  });
});
