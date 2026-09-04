import { useCallback, useSyncExternalStore } from 'react';
import type { ShortlistRow } from './furnace';

/** Jobs picked in Harvest, waiting to be tailored in Churn. localStorage only. */
const KEY = 'recall.churnQueue';

const listeners = new Set<() => void>();
let snapshot: ShortlistRow[] = read();

function read(): ShortlistRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ShortlistRow[]) : [];
  } catch {
    return [];
  }
}

function commit(rows: ShortlistRow[]) {
  snapshot = rows;
  localStorage.setItem(KEY, JSON.stringify(rows));
  listeners.forEach((fn) => fn());
}

export function getQueue(): ShortlistRow[] {
  return snapshot;
}

export function queueJobs(rows: ShortlistRow[]) {
  const seen = new Set(snapshot.map((r) => r.url ?? `${r.company}-${r.role}`));
  const added = rows.filter((r) => !seen.has(r.url ?? `${r.company}-${r.role}`));
  commit([...snapshot, ...added]);
  return added.length;
}

export function removeJob(index: number) {
  commit(snapshot.filter((_, i) => i !== index));
}

export function clearQueue() {
  commit([]);
}

export function useChurnQueue(): ShortlistRow[] {
  return useSyncExternalStore(
    useCallback((cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }, []),
    () => snapshot,
  );
}
