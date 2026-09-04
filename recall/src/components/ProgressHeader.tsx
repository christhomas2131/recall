import { Link, useLocation } from 'react-router-dom';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { uniqueTokens } from '@/lib/segments';
import type { Project, Question } from '@/types';

export interface TokenProgress {
  resolved: number;
  total: number;
  unverifiedByQuestion: { question: Question; remaining: number }[];
}

export function tokenProgress(project: Project): TokenProgress {
  let resolved = 0;
  let total = 0;
  const unverifiedByQuestion: TokenProgress['unverifiedByQuestion'] = [];

  for (const question of project.questions) {
    const tokens = uniqueTokens(question.shortAnswer, question.longAnswer);
    const remaining = tokens.filter((t) => t.state === 'unverified').length;
    total += tokens.length;
    resolved += tokens.length - remaining;
    if (remaining > 0) unverifiedByQuestion.push({ question, remaining });
  }

  return { resolved, total, unverifiedByQuestion };
}

export function ProgressHeader({
  project,
  right,
}: {
  project: Project;
  right?: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const progress = tokenProgress(project);
  const pct = progress.total ? (progress.resolved / progress.total) * 100 : 0;
  const collapsed = project.mode === 'fast';

  const tab = (to: string, label: string) => (
    <Link
      to={to}
      className={cn(
        'font-mono text-sm hover:opacity-60',
        pathname.startsWith(to) ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
    </Link>
  );

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-6 bg-background px-8 py-5 max-md:px-5 max-md:py-4 print:hidden">
        <div className="flex min-w-0 items-center gap-4">
          <Link to="/" className="shrink-0 font-serif text-[22px] leading-none">
            Recall
          </Link>
          <span className="truncate font-mono text-[13px] text-muted-foreground max-sm:hidden">
            {project.name}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-5">
          {tab(`/p/${project.id}/verify`, 'Questions')}
          {tab(`/p/${project.id}/calibrate`, 'Voice')}
          {tab(`/p/${project.id}/drill`, 'Drill')}
          {tab(`/p/${project.id}/export`, 'Export')}

          {progress.total > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-foreground">
                  {collapsed ? (
                    <span className="tabular-nums">
                      {progress.resolved}/{progress.total}
                    </span>
                  ) : (
                    <>
                      <span className="tabular-nums">
                        {progress.resolved}/{progress.total} verified
                      </span>
                      <Progress value={pct} className="h-1 w-24" />
                    </>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 overflow-hidden p-0">
                <div className="eyebrow border-b px-4 py-3 hairline">Details left to check</div>
                {progress.unverifiedByQuestion.length === 0 ? (
                  <p className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    Everything generated so far has been checked.
                  </p>
                ) : (
                  <ul className="max-h-72 overflow-y-auto">
                    {progress.unverifiedByQuestion.map(({ question, remaining }) => (
                      <li key={question.id}>
                        <Link
                          to={`/p/${project.id}/verify/${question.id}`}
                          className="flex items-start gap-3 px-4 py-2.5 text-xs hover:bg-foreground/5"
                        >
                          <span className="line-clamp-2 flex-1">{question.text}</span>
                          <span className="shrink-0 tabular-nums text-unverified">{remaining}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </PopoverContent>
            </Popover>
          ) : null}

          {right}
        </div>
    </header>
  );
}
