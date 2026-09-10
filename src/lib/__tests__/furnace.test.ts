import { beforeEach, describe, expect, it } from 'vitest';
import { isEligible, isLive, rowKey, type ShortlistRow } from '../furnace';
import { clearQueue, getQueue, queueJobs, removeJob } from '../churnQueue';

describe('shortlist row gates', () => {
  it('reads liveness from the crawler\'s own field', () => {
    expect(isLive({ live_status: 'live' })).toBe(true);
    expect(isLive({ live_status: 'ALIVE' })).toBe(true);
    expect(isLive({ live_status: 'dead' })).toBe(false);
    expect(isLive({ live_status: 'gone (404)' })).toBe(false);
  });

  it('treats a missing gate as passing rather than hiding the row', () => {
    expect(isLive({})).toBe(true);
    expect(isEligible({})).toBe(true);
  });

  it('accepts both boolean and string eligibility', () => {
    expect(isEligible({ eligible: true })).toBe(true);
    expect(isEligible({ eligible: 'yes' })).toBe(true);
    expect(isEligible({ eligible: false })).toBe(false);
    expect(isEligible({ eligible: 'no' })).toBe(false);
  });

  it('keys on the url, falling back to company and role', () => {
    expect(rowKey({ url: 'https://x/1' }, 0)).toBe('https://x/1');
    expect(rowKey({ company: 'Acme', role: 'Ops Lead' }, 3)).toBe('Acme-Ops Lead-3');
  });
});

describe('the churn queue', () => {
  const job = (url: string): ShortlistRow => ({ url, role: 'Ops Lead', company: 'Acme' });

  beforeEach(() => clearQueue());

  it('queues jobs picked in Harvest', () => {
    expect(queueJobs([job('a'), job('b')])).toBe(2);
    expect(getQueue()).toHaveLength(2);
  });

  it('does not queue the same posting twice', () => {
    queueJobs([job('a')]);
    expect(queueJobs([job('a'), job('b')])).toBe(1);
    expect(getQueue().map((r) => r.url)).toEqual(['a', 'b']);
  });

  it('removes one without disturbing the rest', () => {
    queueJobs([job('a'), job('b'), job('c')]);
    removeJob(1);
    expect(getQueue().map((r) => r.url)).toEqual(['a', 'c']);
  });

  it('survives a reload through localStorage', () => {
    queueJobs([job('a')]);
    expect(JSON.parse(localStorage.getItem('recall.churnQueue')!)).toHaveLength(1);
  });
});
