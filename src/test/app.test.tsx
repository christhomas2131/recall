import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { DEFAULT_SETTINGS, flushAll, saveSettings } from '@/db/hooks';
import { db } from '@/db/schema';

async function reset() {
  // Drain any debounced write still queued from the previous test.
  flushAll();
  // saveSettings, not localStorage.clear(), so the in-memory snapshot resets too.
  saveSettings(DEFAULT_SETTINGS);
  window.history.pushState({}, '', '/');
  await db.delete();
  await db.open();
}

describe('the app runs', () => {
  beforeEach(reset);

  it('walks onboarding, the sample project, the parse review and calibration', async () => {
    const user = userEvent.setup();
    render(<App />);

    // 1. Onboarding is required before anything else.
    expect(
      await screen.findByRole('heading', { name: /writes wrong answers on purpose/i }),
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /I understand/i })[0]);

    // 2. Projects screen, empty.
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Load sample/i }));

    // 3. Parse review shows the three sample roles, editable.
    expect(await screen.findByRole('heading', { name: /Check the parse/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Northline Health Collaborative')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Broadfield Systems')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Lakeshore Housing Initiative')).toBeInTheDocument();
    expect(screen.getByText(/Role 1 of 3/)).toBeInTheDocument();

    // 4. An edit survives into the store.
    const employer = screen.getByDisplayValue('Broadfield Systems');
    await user.clear(employer);
    await user.type(employer, 'Broadfield');
    expect(screen.getByDisplayValue('Broadfield')).toBeInTheDocument();

    // 5. Confirming the parse hands off to calibration.
    await user.click(screen.getByRole('button', { name: /Looks right/i }));
    expect(
      await screen.findByRole('heading', { name: /How you actually talk/i }),
    ).toBeInTheDocument();

    // 6. Style profile writes through.
    await user.click(screen.getByRole('button', { name: /Expansive/ }));
    await user.click(screen.getByRole('button', { name: /On to the questions/i }));

    // 7. The question screen offers generation and nothing has been generated yet.
    expect(
      await screen.findByRole('button', { name: /Generate questions/i }),
    ).toBeInTheDocument();
  }, 30000);

  it('keeps the corrected resume across a reload', async () => {
    const user = userEvent.setup();
    const first = render(<App />);

    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });
    await user.click(screen.getAllByRole('button', { name: /I understand/i })[0]);
    await user.click(await screen.findByRole('button', { name: /Load sample/i }));
    await screen.findByRole('heading', { name: /Check the parse/i });

    const title = screen.getByDisplayValue('Field Coordinator');
    await user.clear(title);
    await user.type(title, 'Intake Coordinator');

    // Wait for the 300ms debounced write to reach IndexedDB.
    await waitFor(
      async () => {
        const stored = await db.projects.toArray();
        expect(
          stored.some((p) => p.resume.roles.some((r) => r.title === 'Intake Coordinator')),
        ).toBe(true);
      },
      { timeout: 3000 },
    );

    // Remount the whole tree at the same URL, as a reload would.
    first.unmount();
    render(<App />);

    await screen.findByRole('heading', { name: /Check the parse/i });
    expect(screen.getByDisplayValue('Intake Coordinator')).toBeInTheDocument();

    // And it is listed from the database on the projects screen.
    await user.click(screen.getByRole('link', { name: 'Recall' }));
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(await screen.findByText(/Sample — Vantage Grid/)).toBeInTheDocument();
  }, 30000);

  it('routes to settings without exposing browser-side credential controls', async () => {
    const user = userEvent.setup();
    localStorage.setItem('recall.settings', JSON.stringify({
      provider: 'openai', apiKey: 'legacy-secret', model: 'legacy-model', hasAcknowledged: false,
    }));
    saveSettings({ hasAcknowledged: false });
    render(<App />);
    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });
    await user.click(screen.getAllByRole('button', { name: /I understand/i })[0]);
    await user.click(await screen.findByRole('link', { name: 'Settings' }));

    expect(await screen.findByText(/Browser-held provider keys have been removed/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
    expect(localStorage.getItem('recall.settings')).toBe('{"hasAcknowledged":true}');
  }, 30000);
});

describe('the export gate', () => {
  beforeEach(reset);

  it('blocks in standard mode and permits in fast mode with a warning', async () => {
    const user = userEvent.setup();
    saveSettings({ hasAcknowledged: true });

    const now = Date.now();
    await db.projects.put({
      id: 'proj',
      name: 'Gated project',
      mode: 'standard',
      createdAt: now,
      updatedAt: now,
      resume: {
        rawText: '',
        roles: [
          {
            id: 'r1',
            employer: 'Northline',
            title: 'Program Operations Lead',
            startDate: '2021',
            endDate: null,
            bullets: [],
          },
        ],
        education: [],
        skills: [],
        gaps: [],
      },
      questions: [
        {
          id: 'q1',
          text: 'Tell me about a process you fixed.',
          category: 'behavioral',
          sourceRoleId: 'r1',
          shortAnswer: [
            { kind: 'text', text: 'I cut it to ' },
            {
              kind: 'token',
              id: 'tok',
              text: 'four weeks',
              originalText: 'four weeks',
              state: 'unverified',
              category: 'duration',
            },
            { kind: 'text', text: '.' },
          ],
          longAnswer: [],
          coachingNote: 'The number is the point. Say it and stop.',
          versions: [],
          drillHistory: [],
          generatedAt: now,
        },
      ],
    });

    window.history.pushState({}, '', '/p/proj/export');
    render(<App />);

    // Standard mode: the gate opens a blocking dialog instead of exporting.
    await user.click(await screen.findByRole('button', { name: /Copy everything/i }));
    const blocked = await screen.findByRole('dialog');
    expect(within(blocked).getByText(/still unverified/i)).toBeInTheDocument();
    expect(within(blocked).getByText('four weeks')).toBeInTheDocument();
    // The dialog ships its own icon close button, so take the footer one.
    const closeButtons = within(blocked).getAllByRole('button', { name: 'Close' });
    await user.click(closeButtons[closeButtons.length - 1]);

    // Switch to Fast mode: the same action now offers a confirm dialog.
    await user.click(screen.getByRole('button', { name: 'fast' }));
    await user.click(screen.getByRole('button', { name: /Copy everything/i }));
    const confirmDialog = await screen.findByRole('dialog');
    expect(
      within(confirmDialog).getByText(
        /1 details in this document are AI-generated and unverified\. Confirm these before using them\./,
      ),
    ).toBeInTheDocument();
    expect(within(confirmDialog).getByRole('button', { name: /Export anyway/i })).toBeInTheDocument();
  }, 30000);
});
