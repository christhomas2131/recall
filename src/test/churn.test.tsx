import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callLLM = vi.fn();
vi.mock('@/llm/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/llm/client')>();
  return { ...actual, callLLM: (...a: unknown[]) => callLLM(...a) };
});

import App from '@/App';
import { DEFAULT_SETTINGS, flushAll, saveSettings } from '@/db/hooks';
import { db } from '@/db/schema';
import { clearQueue, queueJobs } from '@/lib/churnQueue';
import type { Project } from '@/types';

const TAILORED = {
  positioning:
    'Operations lead who rebuilt an approval workflow after an audit finding and ran grants operations across a partner network.',
  matches: [
    {
      requirement: 'Own the operating cadence across finance and delivery',
      evidence: 'Served as primary liaison to the finance team during the ERP migration',
      sourceRoleId: 'r1',
      strength: 'strong' as const,
    },
    {
      requirement: 'SQL and a BI tool',
      evidence: 'Built and maintained the burn-rate tracker used in monthly review',
      sourceRoleId: 'r1',
      strength: 'partial' as const,
    },
  ],
  gaps: [
    { requirement: 'Forecast accuracy ownership', note: 'No forecasting work appears on the résumé.' },
    { requirement: 'Capacity planning', note: 'Nothing evidences headcount or capacity modelling.' },
  ],
  bullets: [
    {
      sourceRoleId: 'r1',
      original: 'Rebuilt the subaward approval workflow after a compliance finding in the FY22 audit',
      rewritten: 'Rebuilt the subaward approval workflow after an FY22 audit finding, fixing the handoff rather than the symptom',
      why: 'Mirrors the posting’s "fix the process, not the symptom".',
    },
  ],
  keywords: { present: ['operating cadence', 'compliance'], absent: ['forecasting', 'capacity planning'] },
};

function seedProject(): Project {
  const now = Date.now();
  return {
    id: 'churn-proj', name: 'Vantage Grid', mode: 'standard', createdAt: now, updatedAt: now,
    resume: {
      rawText: '',
      roles: [{
        id: 'r1', employer: 'Northline Health', title: 'Program Operations Lead',
        startDate: 'March 2021', endDate: null,
        bullets: [
          'Rebuilt the subaward approval workflow after a compliance finding in the FY22 audit',
          'Built and maintained the burn-rate tracker used in monthly review',
          'Served as primary liaison to the finance team during the ERP migration',
        ],
      }],
      education: ['M.P.A., Public Administration'], skills: ['SQL', 'Tableau'], gaps: [],
    },
    questions: [],
  };
}

beforeEach(async () => {
  callLLM.mockReset();
  callLLM.mockResolvedValue(TAILORED);
  flushAll();
  clearQueue();
  saveSettings({ ...DEFAULT_SETTINGS, hasAcknowledged: true });
  await db.delete();
  await db.open();
  await db.projects.put(seedProject());
  window.history.pushState({}, '', '/churn');
});

describe('Churn against synthetic data', () => {
  it('offers the parsed résumé and the harvested queue', async () => {
    queueJobs([{ role: 'Senior Manager, Business Ops', company: 'Vantage Grid', loc: 'Remote, US', note: 'Owns cadence.', url: 'u1' }]);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Churn' })).toBeInTheDocument();
    expect(await screen.findByText(/Vantage Grid — 1 roles/)).toBeInTheDocument();
    expect(screen.getByText('Senior Manager, Business Ops')).toBeInTheDocument();
  }, 30000);

  it('tailors a queued job and shows every rewrite beside its original', async () => {
    const user = userEvent.setup();
    queueJobs([{ role: 'Senior Manager, Business Ops', company: 'Vantage Grid', note: 'Owns cadence.', req: 'SQL.', url: 'u1' }]);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Tailor' }));

    expect(await screen.findByText(TAILORED.positioning)).toBeInTheDocument();
    expect(screen.getByText(TAILORED.bullets[0].rewritten)).toBeInTheDocument();
    // The honesty guarantee: the original is always shown next to the rewrite.
    expect(screen.getByText(/was: Rebuilt the subaward approval workflow after a compliance finding/)).toBeInTheDocument();
    expect(screen.getByText(/Northline Health/)).toBeInTheDocument();
  }, 30000);

  it('shows gaps rather than papering over them', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText(/paste a posting/), 'Own forecast accuracy and capacity planning.');
    await user.click(screen.getByRole('button', { name: /Tailor to this posting/ }));

    expect(await screen.findByText(/Gaps — do not paper over these/)).toBeInTheDocument();
    expect(screen.getByText('Forecast accuracy ownership')).toBeInTheDocument();
    expect(screen.getByText('Capacity planning')).toBeInTheDocument();
  }, 30000);

  it('separates keywords the résumé has from the ones it does not', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText(/paste a posting/), 'Forecasting and capacity planning.');
    await user.click(screen.getByRole('button', { name: /Tailor to this posting/ }));

    await screen.findByText('operating cadence');
    expect(screen.getByText('forecasting')).toBeInTheDocument();
    expect(screen.getByText(/Amber means the posting uses the term and your résumé does not/)).toBeInTheDocument();
  }, 30000);

  it('sends the résumé and the posting into the prompt', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText(/paste a posting/), 'Own the operating cadence.');
    await user.click(screen.getByRole('button', { name: /Tailor to this posting/ }));

    await waitFor(() => expect(callLLM).toHaveBeenCalledTimes(1));
    const prompt = callLLM.mock.calls[0][0] as { system: string; user: string };
    expect(prompt.system).toContain('You never invent experience');
    expect(prompt.user).toContain('Own the operating cadence.');
    expect(prompt.user).toContain('Rebuilt the subaward approval workflow');
    expect(prompt.user).toContain('id: r1');
  }, 30000);

  it('refuses to tailor with nothing pasted', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Churn' });
    expect(screen.getByRole('button', { name: /Tailor to this posting/ })).toBeDisabled();
    expect(callLLM).not.toHaveBeenCalled();
    await user.click(screen.getByRole('heading', { name: 'Churn' }));
  }, 30000);
});
