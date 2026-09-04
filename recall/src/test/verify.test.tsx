import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callLLM = vi.fn();

vi.mock('@/llm/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/llm/client')>();
  return { ...actual, callLLM: (...args: unknown[]) => callLLM(...args) };
});

import App from '@/App';
import { DEFAULT_SETTINGS, flushAll, saveSettings } from '@/db/hooks';
import { db } from '@/db/schema';
import type { Project, Segment } from '@/types';

const token = (
  id: string,
  text: string,
  state: 'unverified' | 'confirmed' | 'edited',
): Segment => ({
  kind: 'token',
  id,
  text,
  originalText: text,
  state,
  category: 'duration',
});

let pid = '';
let counter = 0;

function seed(): Project {
  const now = Date.now();
  return {
    id: pid,
    name: 'Vantage Grid',
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
          bullets: ['Rebuilt the subaward approval workflow'],
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
          { kind: 'text', text: 'I cut the approval chain from ' },
          token('t-seven', 'seven weeks', 'unverified'),
          { kind: 'text', text: ' to ' },
          token('t-four', 'four weeks', 'unverified'),
          { kind: 'text', text: '.' },
        ],
        longAnswer: [],
        coachingNote: 'The before-and-after is the whole answer. Land the second number.',
        versions: [],
        drillHistory: [],
        generatedAt: now,
      },
    ],
  };
}

beforeEach(async () => {
  callLLM.mockReset();
  flushAll();
  pid = `proj-${++counter}`;
  saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'k', hasAcknowledged: true });
  await db.delete();
  await db.open();
  await db.projects.put(seed());
  window.history.pushState({}, '', `/p/${pid}/verify/q1`);
});

describe('the verification pass', () => {
  it('marks unverified details and clears the mark on confirm', async () => {
    const user = userEvent.setup();
    render(<App />);

    const seven = await screen.findByRole('button', { name: /Unverified duration: seven weeks/ });
    expect(seven).toHaveClass('token-unverified');
    expect(screen.getByText(/2 invented details still marked/)).toBeInTheDocument();

    await user.click(seven);
    const popover = await screen.findByText('What actually happened?');
    expect(popover).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Confirmed duration: seven weeks/ }),
      ).not.toHaveClass('token-unverified');
    });
    expect(screen.getByText(/1 invented detail still marked/)).toBeInTheDocument();
  }, 30000);

  it('records an edit against the original and shows it in the header progress', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Unverified duration: four weeks/ }));
    const field = screen.getByDisplayValue('four weeks');
    await user.clear(field);
    await user.type(field, 'six weeks');
    await user.click(screen.getByRole('button', { name: 'Save edit' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Corrected duration: six weeks/ }),
      ).toHaveClass('token-edited');
    });

    await waitFor(async () => {
      const stored = await db.projects.get(pid);
      const edited = stored!.questions[0].shortAnswer.find(
        (seg) => seg.kind === 'token' && seg.id === 't-four',
      );
      expect(edited).toMatchObject({
        text: 'six weeks',
        originalText: 'four weeks',
        state: 'edited',
      });
    });
  }, 30000);

  it('regenerates on a correction, keeps confirmed facts verbatim and re-marks new ones', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Confirm one detail so it becomes a locked fact.
    await user.click(await screen.findByRole('button', { name: /Unverified duration: seven weeks/ }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await screen.findByRole('button', { name: /Confirmed duration: seven weeks/ });

    // The model returns the locked fact verbatim plus one brand-new specific.
    callLLM.mockResolvedValue({
      shortAnswer: [
        { kind: 'text', text: 'I cut the approval chain from ' },
        { kind: 'token', text: 'seven weeks', category: 'duration' },
        { kind: 'text', text: ' to ' },
        { kind: 'token', text: 'six weeks', category: 'duration' },
        { kind: 'text', text: ', and the holdup was ' },
        { kind: 'token', text: 'the finance handoff', category: 'mechanism' },
        { kind: 'text', text: '.' },
      ],
      longAnswer: [{ kind: 'text', text: 'The finance step was the bottleneck.' }],
      coachingNote: 'Naming the finance handoff turns this into a diagnosis. Say it flatly.',
    });

    // Correct the other detail and ask for a rewrite.
    await user.click(screen.getByRole('button', { name: /Unverified duration: four weeks/ }));
    await user.type(
      screen.getByLabelText('What actually happened?'),
      'It was six weeks, and the finance handoff was the holdup.',
    );
    await user.click(screen.getByRole('button', { name: /Regenerate this answer/ }));

    // The diff appears with the rewrite.
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 });
    expect(within(dialog).getByText('Before')).toBeInTheDocument();
    expect(within(dialog).getByText('After')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Accept rewrite/ }));

    // The confirmed fact kept its identity and state; the new ones are amber.
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Confirmed duration: seven weeks/ }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /Unverified mechanism: the finance handoff/ }),
    ).toHaveClass('token-unverified');

    await waitFor(async () => {
      const stored = await db.projects.get(pid);
      const q = stored!.questions[0];
      const locked = q.shortAnswer.find((seg) => seg.kind === 'token' && seg.text === 'seven weeks');
      expect(locked).toMatchObject({ id: 't-seven', state: 'confirmed' });
      // The previous answer went into history.
      expect(q.versions).toHaveLength(1);
      expect(q.versions[0].trigger).toBe('regeneration');
    });
  }, 30000);

  it('drives confirmation from the keyboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: /Unverified duration: seven weeks/ });

    await user.keyboard('c'); // confirms the token under the cursor
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Confirmed duration: seven weeks/ }),
      ).toBeInTheDocument();
    });

    await user.keyboard('j'); // next detail
    await user.keyboard('c');
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Confirmed duration: four weeks/ }),
      ).toBeInTheDocument();
    });
  }, 30000);
});

describe('drill mode', () => {
  it('locks an unverified question in standard mode', async () => {
    window.history.pushState({}, '', `/p/${pid}/drill`);
    render(<App />);
    expect(await screen.findByText('Nothing to drill yet.')).toBeInTheDocument();
    expect(screen.getByText(/Locked until verified \(1\)/)).toBeInTheDocument();
  }, 30000);

  it('drills a verified question and records the rating', async () => {
    const user = userEvent.setup();
    const project = seed();
    project.questions[0].shortAnswer = project.questions[0].shortAnswer.map((s) =>
      s.kind === 'token' ? { ...s, state: 'confirmed' as const } : s,
    );
    await db.projects.put(project);

    window.history.pushState({}, '', `/p/${pid}/drill`);
    render(<App />);

    expect(await screen.findByText('Tell me about a process you fixed.')).toBeInTheDocument();
    // The answer is hidden until asked for.
    expect(screen.queryByText(/approval chain/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Show the answer/ }));
    expect(await screen.findByText(/I cut the approval chain from/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Redo/ }));

    await waitFor(async () => {
      const stored = await db.projects.get(pid);
      expect(stored!.questions[0].drillHistory).toHaveLength(1);
      expect(stored!.questions[0].drillHistory[0].rating).toBe('redo');
    });
  }, 30000);
});
