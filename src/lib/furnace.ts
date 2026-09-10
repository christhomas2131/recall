/**
 * Bridge to the managed Career Churn Furnace engine through Recall's companion.
 *
 * The browser never calls or starts a second server. Recall's loopback companion
 * owns the crawler process and exposes this narrow same-origin API.
 */

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
    res = await fetch(`/api/recall-harvest${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new FurnaceError(
      'offline',
      'Could not reach the managed Harvest engine. Start Recall with npm start.',
    );
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => null) as { error?: unknown } | null;
    const detail = typeof payload?.error === 'string' ? ` ${payload.error}` : '';
    throw new FurnaceError('http', `Furnace returned ${res.status}.${detail}`);
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

export interface HarvestHealth {
  ok: boolean;
  ready: boolean;
  engine: 'managed' | 'missing';
  message: string;
  command: string;
  onboarding: {
    ready: boolean;
    completed: number;
    total: number;
    missing: string[];
    recommendations: string[];
  };
}

export async function health(): Promise<HarvestHealth | null> {
  try {
    const r = await call<Partial<HarvestHealth>>('/health');
    return {
      ok: r.ok !== false,
      ready: r.ready !== false,
      engine: r.engine === 'missing' ? 'missing' : 'managed',
      message: r.message ?? '',
      command: r.command ?? 'npm run harvest:onboard',
      onboarding: r.onboarding ?? {
        ready: r.ready !== false,
        completed: 0,
        total: 9,
        missing: [],
        recommendations: [],
      },
    };
  } catch {
    return null;
  }
}

export function getStatus() {
  return call<CrawlStatus>('/crawl/status');
}

export async function getShortlist(): Promise<ShortlistRow[]> {
  const r = await call<{ rows?: ShortlistRow[] }>('/crawl/shortlist');
  return r.rows ?? [];
}

export function startCrawl() {
  return call<{ ok: boolean; busy: boolean }>('/crawl/start', { method: 'POST', body: '{}' });
}

export function downloadUrl() {
  return '/api/recall-harvest/crawl/download';
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
