import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { DEFAULT_SETTINGS, saveSettings } from '@/db/hooks';
import { clearQueue, getQueue } from '@/lib/churnQueue';
import type { ShortlistRow } from '@/lib/furnace';

/** The same five synthetic rows the live Furnace served back. */
const ROWS: ShortlistRow[] = [
  {
    pick: 1, role: 'Senior Manager, Business Operations', company: 'Vantage Grid',
    loc: 'Remote, US', sal: '$165k–$190k', bucket: 'GREEN', _lane: 'ops',
    url: 'https://example.invalid/jobs/vg', ats: 'greenhouse',
    eligible: true, live_status: 'live',
    note: 'Owns operating cadence and the reporting layer.',
    req: '5+ years business operations.',
  },
  {
    pick: 2, role: 'Director of Program Operations', company: 'Harbor Civic Trust',
    loc: 'San Francisco, CA', sal: '$140k–$160k', bucket: 'GREEN', _lane: 'gov-civic',
    url: 'https://example.invalid/jobs/hct', ats: 'lever',
    eligible: 'yes', live_status: 'ALIVE', note: 'Grants operations.', req: '2 CFR 200.',
  },
  {
    pick: 3, role: 'Delivery Operations Lead', company: 'Northwind Logistics',
    loc: 'Austin, TX', bucket: 'YELLOW', _lane: 'tech-saas',
    url: 'https://example.invalid/jobs/nw', ats: 'ashby',
    eligible: false, eligible_why: 'requires 10+ yrs; onsite 5 days',
    live_status: 'live', note: 'Enterprise implementation delivery.',
  },
  {
    pick: 4, role: 'Chief of Staff, Operations', company: 'Meridian Data',
    loc: 'New York, NY', sal: '$150k', bucket: 'GREEN', _lane: 'ops',
    url: 'https://example.invalid/jobs/md', ats: 'greenhouse',
    eligible: true, live_status: 'gone (404)', live_why: 'posting removed',
  },
  { pick: 5, role: 'Operations Analyst', company: 'Cascade Health', bucket: 'YELLOW', _lane: 'ops' },
];

const STATUS = {
  running: false, done: true, phase: 'Finished', current: '',
  count: 5, kept: 5, dropped: 12, dupes: 3, raw_total: 20,
  log: [], summary: [], ticker: [], outfile: 'job_cash_map_0831.xlsx',
};

let online = true;
let started = false;
let onboardingReady = true;

function mockFurnace() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!online) throw new TypeError('Failed to fetch');
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/api/recall-harvest/health')) return json({
      ok: true,
      ready: onboardingReady,
      message: onboardingReady ? '' : 'Harvest onboarding is incomplete. Still needed: resume, search.',
      command: 'npm run harvest:onboard',
    });
    if (url.endsWith('/api/recall-harvest/crawl/status')) return json(STATUS);
    if (url.endsWith('/api/recall-harvest/crawl/shortlist')) return json({ rows: ROWS });
    if (url.endsWith('/api/recall-harvest/crawl/start') && init?.method === 'POST') {
      started = true;
      return json({ ok: true, busy: false });
    }
    return new Response('{}', { status: 404 });
  }));
}

beforeEach(() => {
  online = true;
  started = false;
  onboardingReady = true;
  clearQueue();
  saveSettings({ ...DEFAULT_SETTINGS, hasAcknowledged: true });
  mockFurnace();
  window.history.pushState({}, '', '/harvest');
});

afterEach(() => vi.unstubAllGlobals());

describe('Harvest against synthetic Furnace data', () => {
  it('renders every shortlist row with its company and pay', async () => {
    render(<App />);
    expect(await screen.findByText('Senior Manager, Business Operations')).toBeInTheDocument();
    for (const r of ROWS) expect(screen.getByText(r.role!)).toBeInTheDocument();
    expect(screen.getByText(/Vantage Grid · Remote, US/)).toBeInTheDocument();
    expect(screen.getByText('$165k–$190k')).toBeInTheDocument();
    expect(await screen.findByText(/Shortlist \(5\)/)).toBeInTheDocument();
  }, 30000);

  it('surfaces the crawler\'s own liveness and eligibility verdicts', async () => {
    render(<App />);
    await screen.findByText('Chief of Staff, Operations');
    // Only the 404 row is dead; ALIVE and a blank status both count as live.
    expect(screen.getAllByText('not live')).toHaveLength(1);
    expect(screen.getByText(/ineligible — requires 10\+ yrs; onsite 5 days/)).toBeInTheDocument();
  }, 30000);

  it('shows the run counters from status', async () => {
    render(<App />);
    await screen.findByText('Finished');
    for (const label of ['SEEN', 'KEPT', 'DROPPED', 'DUPES']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  }, 30000);

  it('queues selected roles and hands them to Churn', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Senior Manager, Business Operations');

    await user.click(screen.getByRole('checkbox', { name: /Senior Manager, Business Operations/ }));
    await user.click(screen.getByRole('checkbox', { name: /Director of Program Operations/ }));

    const send = await screen.findByRole('button', { name: /Send 2 to Churn/ });
    await user.click(send);

    await waitFor(() => expect(getQueue()).toHaveLength(2));
    expect(getQueue().map((r) => r.company)).toEqual(['Vantage Grid', 'Harbor Civic Trust']);
    expect(await screen.findByRole('heading', { name: 'Churn' })).toBeInTheDocument();
  }, 30000);

  it('starts a crawl when asked', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Harvest today’s jobs/ }));
    await waitFor(() => expect(started).toBe(true));
  }, 30000);

  it('explains itself when the managed engine is down instead of failing silently', async () => {
    online = false;
    render(<App />);
    expect(await screen.findByText(/Harvest engine not reachable/)).toBeInTheDocument();
    expect(screen.getByText(/harvest unavailable/)).toBeInTheDocument();
  }, 30000);

  it('shows exact onboarding recovery instead of starting an unconfigured crawl', async () => {
    onboardingReady = false;
    render(<App />);
    expect(await screen.findByText(/Harvest needs onboarding/)).toBeInTheDocument();
    expect(screen.getByText(/Still needed: resume, search/)).toBeInTheDocument();
    expect(screen.getByText('npm run harvest:onboard')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Harvest today/ })).not.toBeInTheDocument();
  }, 30000);
});
