/**
 * Bridge to the Career Churn Furnace running locally (default :8765).
 *
 * Harvest does not re-implement crawling. The Furnace already owns the board
 * scrapers, lane scoring, dedupe and liveness checks; this is a typed client
 * over the API it already exposes.
 */

const DEFAULT_BASE = 'http://localhost:8765';
const BASE_KEY = 'recall.furnaceBase';

export function furnaceBase(): string {
  try {
    return localStorage.getItem(BASE_KEY) || DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

export function setFurnaceBase(base: string) {
  localStorage.setItem(BASE_KEY, base.replace(/\/+$/, '') || DEFAULT_BASE);
}

export type FurnaceErrorKind = 'offline' | 'cors' | 'http';

export class FurnaceError extends Error {
  kind: FurnaceErrorKind;
  constructor(kind: FurnaceErrorKind, message: string) {
    super(message);
    this.name = 'FurnaceError';
    this.kind = kind;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${furnaceBase()}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    // A blocked CORS preflight and a dead server are indistinguishable here.
    throw new FurnaceError(
      'offline',
      'Could not reach the Furnace. Start it, or check the address in Settings.',
    );
  }
  if (!res.ok) {
    throw new FurnaceError('http', `Furnace returned ${res.status}.`);
  }
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ *
 * Shapes, mirroring crawler_bridge.STATE and _shortlist_<date>.json
 * ------------------------------------------------------------------ */

export interface CrawlStatus {
  running: boolean;
  done: boolean;
  phase: string;
  current: string;
  count: number;
  kept: number;
  dropped: number;
  dupes: number;
  raw_total: number;
  log: string[];
  summary: string[];
  ticker: string[];
  outfile: string;
}

export interface ShortlistRow {
  pick?: number | string;
  role?: string;
  company?: string;
  loc?: string;
  sal?: string;
  url?: string;
  ats?: string;
  src?: string;
  req?: string;
  note?: string;
  bucket?: string;
  _lane?: string;
  eligible?: boolean | string;
  eligible_why?: string;
  live_status?: string;
  live_strength?: string | number;
  live_why?: string;
  friction?: string | number;
  baf?: string | number;
  dedupe?: string;
  shown_before?: boolean | string;
}

export const EMPTY_STATUS: CrawlStatus = {
  running: false,
  done: false,
  phase: '',
  current: '',
  count: 0,
  kept: 0,
  dropped: 0,
  dupes: 0,
  raw_total: 0,
  log: [],
  summary: [],
  ticker: [],
  outfile: '',
};

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

export async function health(): Promise<boolean> {
  try {
    const r = await call<{ ok?: boolean }>('/api/health');
    return r.ok !== false;
  } catch {
    return false;
  }
}

export function getStatus() {
  return call<CrawlStatus>('/api/crawl/status');
}

export async function getShortlist(): Promise<ShortlistRow[]> {
  const r = await call<{ rows?: ShortlistRow[] }>('/api/crawl/shortlist');
  return r.rows ?? [];
}

export function startCrawl() {
  return call<{ ok: boolean; busy: boolean }>('/api/crawl/start', { method: 'POST', body: '{}' });
}

export function getProfile() {
  return call<Record<string, unknown>>('/api/profile');
}

export function downloadUrl() {
  return `${furnaceBase()}/api/crawl/download`;
}

/** True when the row cleared the Furnace's own eligibility and liveness gates. */
export function isLive(row: ShortlistRow): boolean {
  const s = String(row.live_status ?? '').toLowerCase();
  return s === '' || s.includes('live') || s.includes('ok') || s.includes('alive');
}

export function isEligible(row: ShortlistRow): boolean {
  const e = row.eligible;
  if (typeof e === 'boolean') return e;
  const s = String(e ?? '').toLowerCase();
  return s === '' || s === 'true' || s === 'yes' || s === 'y';
}

export function rowKey(row: ShortlistRow, i: number): string {
  return String(row.url || `${row.company ?? ''}-${row.role ?? ''}-${i}`);
}
