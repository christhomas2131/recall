import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shell, PageTitle } from '@/components/Shell';
import { queueJobs } from '@/lib/churnQueue';
import {
  downloadUrl,
  EMPTY_STATUS,
  getShortlist,
  getStatus,
  health,
  isEligible,
  isLive,
  rowKey,
  startCrawl,
  type CrawlStatus,
  type ShortlistRow,
} from '@/lib/furnace';
import { cn } from '@/lib/utils';

type Link = 'checking' | 'online' | 'setup' | 'offline';

function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="glass-card">
      <p className="eyebrow mb-3 opacity-70">Harvest engine not reachable</p>
      <p className="font-mono text-[13px] leading-relaxed">
        Start Recall with <code className="rounded bg-foreground/10 px-1.5 py-0.5">npm start</code>.
        Recall now selects the local AI runtime and manages the crawler process itself.
      </p>
      <Button className="mt-5" variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}

function SetupRequired({ message, command, onRetry }: { message: string; command: string; onRetry: () => void }) {
  return (
    <div className="glass-card">
      <p className="eyebrow mb-3 opacity-70">Harvest needs onboarding</p>
      <p className="font-mono text-[13px] leading-relaxed">{message}</p>
      <p className="mt-3 font-mono text-[13px] leading-relaxed">
        Open a terminal in Recall and run{' '}
        <code className="rounded bg-foreground/10 px-1.5 py-0.5">{command}</code>.
        Return here and retry when the guided setup finishes.
      </p>
      <Button className="mt-5" variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}

function JobCard({
  row,
  index,
  selected,
  onToggle,
}: {
  row: ShortlistRow;
  index: number;
  selected: boolean;
  onToggle: () => void;
}) {
  const live = isLive(row);
  const eligible = isEligible(row);

  return (
    <li
      className={cn(
        'glass-card cursor-pointer transition-colors',
        selected && 'ring-2 ring-foreground',
      )}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-serif text-[19px] leading-snug">{row.role ?? 'Untitled role'}</p>
          <p className="mt-1 font-mono text-[13px] opacity-80">
            {row.company ?? 'Unknown company'}
            {row.loc ? ` · ${row.loc}` : ''}
          </p>
        </div>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${row.role ?? 'role'}`}
          className="mt-1 size-4 shrink-0 accent-current"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {row.bucket ? (
          <Badge variant="outline" className="text-[11px]">
            {row.bucket}
          </Badge>
        ) : null}
        {row._lane ? (
          <Badge variant="outline" className="text-[11px]">
            {row._lane}
          </Badge>
        ) : null}
        {row.sal ? <span className="font-mono text-[12px] opacity-75">{row.sal}</span> : null}
        {!live ? <span className="font-mono text-[12px] text-destructive">not live</span> : null}
        {!eligible ? (
          <span className="font-mono text-[12px] text-destructive">
            ineligible{row.eligible_why ? ` — ${row.eligible_why}` : ''}
          </span>
        ) : null}
      </div>

      {row.note ? (
        <p className="mt-3 font-mono text-[12px] leading-relaxed opacity-75">{row.note}</p>
      ) : null}

      {row.url ? (
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          className="mt-3 inline-block font-mono text-[12px] underline underline-offset-2 hover:opacity-60"
        >
          Open posting{row.ats ? ` (${row.ats})` : ''} →
        </a>
      ) : null}
      <span className="sr-only">{index}</span>
    </li>
  );
}

export default function Harvest() {
  const navigate = useNavigate();
  const [link, setLink] = useState<Link>('checking');
  const [status, setStatus] = useState<CrawlStatus>(EMPTY_STATUS);
  const [rows, setRows] = useState<ShortlistRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [setup, setSetup] = useState({ message: '', command: 'npm run harvest:onboard' });
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setLink('checking');
    const up = await health();
    if (!up || !up.ok) {
      setLink('offline');
      return;
    }
    if (!up.ready) {
      setSetup({ message: up.message, command: up.command });
      setLink('setup');
      return;
    }
    setLink('online');
    try {
      const [s, list] = await Promise.all([getStatus(), getShortlist()]);
      setStatus(s);
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the Harvest engine.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll only while a crawl is actually running.
  useEffect(() => {
    if (!status.running) {
      if (poll.current) {
        clearInterval(poll.current);
        poll.current = null;
      }
      return;
    }
    poll.current = setInterval(async () => {
      try {
        const s = await getStatus();
        setStatus(s);
        if (!s.running) setRows(await getShortlist());
      } catch {
        /* transient; the next tick retries */
      }
    }, 2000);
    return () => {
      if (poll.current) clearInterval(poll.current);
      poll.current = null;
    };
  }, [status.running]);

  async function onHarvest() {
    setError(null);
    setStarting(true);
    try {
      const r = await startCrawl();
      if (r.busy) setError('A crawl was already running. Watching that one.');
      setStatus((s) => ({ ...s, running: true, done: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the crawl.');
    } finally {
      setStarting(false);
    }
  }

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const picked = rows.filter((r, i) => selected.has(rowKey(r, i)));

  return (
    <Shell
      scene="skyline"
      right={
        <span className="font-mono text-xs opacity-70">
          {link === 'online'
            ? 'harvest ready'
            : link === 'setup'
              ? 'onboarding needed'
              : link === 'offline'
                ? 'harvest unavailable'
                : 'checking…'}
        </span>
      }
    >
      <PageTitle
        title="Harvest"
        subtitle="Pull today's live roles through the managed crawler — board scrapers, lane scoring, dedupe and liveness without a second server to start."
      />

      {error ? (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3.5 font-mono text-[13px] text-destructive">
          {error}
        </div>
      ) : null}

      {link === 'offline' ? (
        <Offline onRetry={() => void refresh()} />
      ) : link === 'setup' ? (
        <SetupRequired message={setup.message} command={setup.command} onRetry={() => void refresh()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <Button disabled={status.running || starting || link !== 'online'} onClick={() => void onHarvest()}>
              {status.running ? 'Harvesting…' : starting ? 'Starting…' : 'Harvest today’s jobs'}
            </Button>
            <Button variant="outline" onClick={() => void refresh()}>
              Refresh
            </Button>
            {status.outfile ? (
              <a
                href={downloadUrl()}
                className="font-mono text-[13px] underline underline-offset-2 hover:opacity-60"
              >
                Download workbook
              </a>
            ) : null}
          </div>

          {status.running || status.phase ? (
            <div className="glass-card mt-8">
              <p className="eyebrow mb-3 opacity-70">{status.running ? 'Running' : 'Last run'}</p>
              <p className="font-mono text-[13px]">{status.phase || '—'}</p>
              {status.current ? (
                <p className="mt-1 truncate font-mono text-[12px] opacity-70">{status.current}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-10">
                {(
                  [
                    ['seen', status.raw_total],
                    ['kept', status.kept],
                    ['dropped', status.dropped],
                    ['dupes', status.dupes],
                  ] as const
                ).map(([label, n]) => (
                  <div key={label}>
                    <div className="font-serif text-[30px] leading-none tabular-nums">{n}</div>
                    <div className="stat-label">{label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-10 flex items-baseline justify-between">
            <h2 className="font-serif text-[28px]">
              Shortlist{rows.length ? ` (${rows.length})` : ''}
            </h2>
            {picked.length ? (
              <Button
                size="sm"
                onClick={() => {
                  queueJobs(picked);
                  navigate('/churn');
                }}
              >
                Send {picked.length} to Churn
              </Button>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <p className="mt-4 font-mono text-[13px] opacity-75">
              {status.running
                ? 'The shortlist appears when the crawl finishes.'
                : 'No shortlist yet for today. Press Harvest.'}
            </p>
          ) : (
            <ul className="mt-6 grid grid-cols-2 gap-5 max-md:grid-cols-1">
              {rows.map((row, i) => {
                const key = rowKey(row, i);
                return (
                  <JobCard
                    key={key}
                    row={row}
                    index={i}
                    selected={selected.has(key)}
                    onToggle={() => toggle(key)}
                  />
                );
              })}
            </ul>
          )}
        </>
      )}
    </Shell>
  );
}
