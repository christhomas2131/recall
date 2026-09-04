import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './schema';
import type { Project, Question, Settings } from '@/types';

/* ------------------------------------------------------------------ *
 * In-memory overlay + debounced persistence.
 *
 * Mutations land in memory synchronously so the UI never lags behind a
 * keystroke; the Dexie write is debounced 300ms per Section 8. Pending
 * writes flush on pagehide and on visibilitychange so a correction is
 * never lost.
 * ------------------------------------------------------------------ */

const cache = new Map<string, Project>();
const listeners = new Map<string, Set<() => void>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Map<string, Promise<void>>();
const redo = new Set<string>();
/** Project ids whose IndexedDB lookup has finished, hit or miss. */
const resolved = new Set<string>();

const DEBOUNCE_MS = 300;

function emit(id: string) {
  listeners.get(id)?.forEach((fn) => fn());
}

function subscribe(id: string, fn: () => void) {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

function scheduleFlush(id: string) {
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      void flushProject(id);
    }, DEBOUNCE_MS),
  );
}

async function flushProject(id: string) {
  const project = cache.get(id);
  if (!project) return;
  // A write is already running against an older snapshot. Queue this one
  // rather than dropping it, or the newest correction never lands.
  if (inflight.has(id)) {
    redo.add(id);
    return;
  }
  const write = (async () => {
    try {
      await db.projects.put(project);
    } finally {
      inflight.delete(id);
      if (redo.delete(id)) void flushProject(id);
    }
  })();
  inflight.set(id, write);
  await write;
}

export function flushAll() {
  for (const [id, t] of timers) {
    clearTimeout(t);
    timers.delete(id);
    void flushProject(id);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
}

/** Apply an immutable update. Returns the new project, or undefined if unknown id. */
export function mutateProject(
  id: string,
  fn: (draft: Project) => Project,
): Project | undefined {
  const current = cache.get(id);
  if (!current) return undefined;
  const next = fn(current);
  const committed: Project = { ...next, updatedAt: Date.now() };
  cache.set(id, committed);
  emit(id);
  scheduleFlush(id);
  return committed;
}

export function mutateQuestion(
  projectId: string,
  questionId: string,
  fn: (q: Question) => Question,
) {
  return mutateProject(projectId, (p) => ({
    ...p,
    questions: p.questions.map((q) => (q.id === questionId ? fn(q) : q)),
  }));
}

export async function createProject(project: Project) {
  cache.set(project.id, project);
  resolved.add(project.id);
  await db.projects.put(project);
  emit(project.id);
}

export async function deleteProject(id: string) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
  redo.delete(id);
  cache.delete(id);
  resolved.add(id);
  // Let any write already on its way finish, or it lands after the delete
  // and resurrects the project.
  await inflight.get(id)?.catch(() => {});
  await db.projects.delete(id);
  emit(id);
}

/* ------------------------------------------------------------------ *
 * Hooks
 * ------------------------------------------------------------------ */

export function useProject(id: string | undefined) {
  // Derived, not state: switching project id must not render one frame of
  // "not found" while a stale `loading` catches up.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!id || resolved.has(id) || cache.has(id)) return;
    let cancelled = false;
    void db.projects.get(id).then((found) => {
      if (cancelled) return;
      resolved.add(id);
      if (found && !cache.has(id)) cache.set(id, found);
      emit(id);
      setTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const project = useSyncExternalStore(
    useCallback((cb: () => void) => (id ? subscribe(id, cb) : () => {}), [id]),
    useCallback(() => (id ? cache.get(id) : undefined), [id]),
  );

  const loading = !!id && project === undefined && !resolved.has(id);

  return { project, loading };
}

export function useProjects() {
  return useLiveQuery(async () => {
    const all = await db.projects.toArray();
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }, []);
}

export function useQuestions(projectId: string | undefined): Question[] {
  const { project } = useProject(projectId);
  return project?.questions ?? [];
}

/* ------------------------------------------------------------------ *
 * Settings — localStorage only.
 * ------------------------------------------------------------------ */

const SETTINGS_KEY = 'recall.settings';

export const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-5',
  hasAcknowledged: false,
};

const settingsListeners = new Set<() => void>();
let settingsSnapshot: Settings = readSettings();

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function getSettings(): Settings {
  return settingsSnapshot;
}

export function saveSettings(patch: Partial<Settings>) {
  settingsSnapshot = { ...settingsSnapshot, ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsSnapshot));
  settingsListeners.forEach((fn) => fn());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      settingsListeners.add(cb);
      return () => settingsListeners.delete(cb);
    },
    () => settingsSnapshot,
  );
}
