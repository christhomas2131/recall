import Dexie, { type Table } from 'dexie';
import type { Project } from '@/types';

export class RecallDB extends Dexie {
  projects!: Table<Project, string>;

  constructor() {
    super('recall');
    this.version(1).stores({
      projects: 'id, updatedAt, name',
    });
  }
}

export const db = new RecallDB();

// Project data uses IndexedDB. The non-secret onboarding acknowledgement
// stays in localStorage; provider credentials are never browser state.
