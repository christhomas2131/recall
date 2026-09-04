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

// SPEC-GAP: Section 8 lists a Dexie `settings` table, but Section 3 and
// Section 8 also require the API key and hasAcknowledged to live in
// localStorage. localStorage wins; settings never touch IndexedDB.
