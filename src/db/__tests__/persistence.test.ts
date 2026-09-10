import { beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/dom';
import { createProject, deleteProject, flushAll, mutateProject } from '../hooks';
import { db } from '../schema';
import type { Project } from '@/types';

function makeProject(id: string): Project {
  return {
    id,
    name: 'v0',
    mode: 'standard',
    createdAt: 0,
    updatedAt: 0,
    resume: { rawText: '', roles: [], education: [], skills: [], gaps: [] },
    questions: [],
  };
}

beforeEach(async () => {
  flushAll();
  await db.delete();
  await db.open();
});

describe('debounced persistence', () => {
  it('never drops a write that arrives while another is in flight', async () => {
    await createProject(makeProject('p-inflight'));

    mutateProject('p-inflight', (p) => ({ ...p, name: 'v1' }));
    flushAll(); // starts the write for v1 without awaiting it

    mutateProject('p-inflight', (p) => ({ ...p, name: 'v2' }));
    flushAll(); // lands while v1 is still in flight

    await waitFor(async () => {
      const stored = await db.projects.get('p-inflight');
      expect(stored?.name).toBe('v2');
    });
  });

  it('keeps a project deleted even when a write was already on its way', async () => {
    await createProject(makeProject('p-deleted'));

    mutateProject('p-deleted', (p) => ({ ...p, name: 'v1' }));
    flushAll(); // write in flight

    await deleteProject('p-deleted');

    // Give any stray write a chance to land before asserting.
    await new Promise((r) => setTimeout(r, 50));
    expect(await db.projects.get('p-deleted')).toBeUndefined();
  });

  it('flushes a pending debounced write on its own timer', async () => {
    await createProject(makeProject('p-timer'));
    mutateProject('p-timer', (p) => ({ ...p, name: 'debounced' }));

    await waitFor(
      async () => {
        const stored = await db.projects.get('p-timer');
        expect(stored?.name).toBe('debounced');
      },
      { timeout: 2000 },
    );
  });
});
