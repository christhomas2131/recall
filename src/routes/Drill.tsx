import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CoachingNote } from '@/components/CoachingNote';
import { SegmentText } from '@/components/AnswerCard';
import { TokenSpan } from '@/components/TokenSpan';
import { BridgeBackdrop } from '@/components/Shell';
import { mutateQuestion, useProject } from '@/db/hooks';
import {
  drillQueue,
  formatElapsed,
  isDrillable,
  SLOW_SECONDS,
  VERY_SLOW_SECONDS,
} from '@/lib/drill';
import { cn } from '@/lib/utils';
import type { DrillAttempt, Project, Question } from '@/types';

const RATINGS: { rating: DrillAttempt['rating']; label: string; hint: string }[] = [
  { rating: 'nailed', label: 'Nailed it', hint: 'came out clean' },
  { rating: 'rough', label: 'Rough', hint: 'got there, badly' },
  { rating: 'redo', label: 'Redo', hint: 'come back soon' },
];

function DrillSession({ project }: { project: Project }) {
  const [cursor, setCursor] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  // The queue is fixed when the session starts so ratings do not reorder
  // the deck underneath the person using it.
  const queue = useMemo(() => drillQueue(project), [project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const question = queue[cursor];

  useEffect(() => {
    startedAt.current = Date.now();
    setElapsed(0);
    setRevealed(false);
  }, [cursor]);

  useEffect(() => {
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [cursor]);

  const rate = useCallback(
    (rating: DrillAttempt['rating']) => {
      if (!question) return;
      const attempt: DrillAttempt = {
        at: Date.now(),
        elapsedSeconds: Math.floor((Date.now() - startedAt.current) / 1000),
        rating,
      };
      mutateQuestion(project.id, question.id, (q) => ({
        ...q,
        drillHistory: [...q.drillHistory, attempt],
      }));
      setCursor((c) => c + 1);
    },
    [project.id, question],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' && !revealed) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      if (!revealed) return;
      if (e.key === '1') rate('nailed');
      if (e.key === '2') rate('rough');
      if (e.key === '3') rate('redo');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rate, revealed]);

  if (!question) {
    return (
      <div className="mx-auto w-full max-w-content px-8 py-24 text-center max-md:px-5">
        <p className="text-lg">
          {queue.length === 0
            ? 'Nothing to drill yet.'
            : `Through all ${queue.length} of them.`}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {queue.length === 0 && project.mode === 'standard'
            ? 'Standard mode unlocks a question for drilling once every invented detail in it is confirmed or corrected.'
            : 'Anything you marked Redo comes back first next time.'}
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          {queue.length > 0 ? (
            <Button onClick={() => setCursor(0)}>Run through again</Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link to={`/p/${project.id}/verify`}>Back to questions</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-content flex-col px-8 py-10 max-md:px-5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <Link to={`/p/${project.id}/verify`} className="hover:text-foreground">
          ← Leave drill
        </Link>
        <div className="flex items-center gap-4">
          <span className="tabular-nums">
            {cursor + 1} of {queue.length}
          </span>
          <span
            className={cn(
              'tabular-nums',
              elapsed >= VERY_SLOW_SECONDS
                ? 'font-medium text-foreground underline underline-offset-4'
                : elapsed >= SLOW_SECONDS
                  ? 'text-foreground'
                  : 'text-muted-foreground',
            )}
          >
            {formatElapsed(elapsed)}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center py-16">
        <h1 className="page-title">{question.text}</h1>

        {elapsed >= VERY_SLOW_SECONDS && !revealed ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Past 90 seconds. In a real screen you would have lost them by now.
          </p>
        ) : elapsed >= SLOW_SECONDS && !revealed ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Past 60 seconds. This answer should be landing about now.
          </p>
        ) : null}

        {revealed ? (
          <>
            <div className="reading-panel mt-8">
              <div className="answer-prose">
                <SegmentText
                  segments={question.shortAnswer}
                  renderToken={(t) => <TokenSpan token={t} />}
                />
              </div>
            </div>
            <CoachingNote note={question.coachingNote} />
          </>
        ) : (
          <Button className="mt-10 self-start" onClick={() => setRevealed(true)}>
            Show the answer
          </Button>
        )}
      </div>

      {revealed ? (
        <div className="border-t border-border pt-5">
          <div className="eyebrow text-muted-foreground">
            How did that go?
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {RATINGS.map((r, i) => (
              <Button key={r.rating} variant="outline" onClick={() => rate(r.rating)}>
                <span className="mr-2 font-mono text-xs text-muted-foreground">{i + 1}</span>
                {r.label}
                <span className="ml-2 text-xs text-muted-foreground">{r.hint}</span>
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Say it out loud first. Space reveals the answer.
        </p>
      )}
    </div>
  );
}

function LockedList({ project }: { project: Project }) {
  const locked = project.questions.filter((q) => !isDrillable(project, q));
  if (project.mode !== 'standard' || locked.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-content border-t px-8 py-6 hairline max-md:px-5">
      <div className="eyebrow text-muted-foreground">
        Locked until verified ({locked.length})
      </div>
      <ul className="mt-2 space-y-1">
        {locked.map((q: Question) => (
          <li key={q.id}>
            <Link
              to={`/p/${project.id}/verify/${q.id}`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {q.text}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Drill() {
  const { projectId } = useParams();
  const { project, loading } = useProject(projectId);

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  if (!project) return <div className="p-10 text-sm">Project not found.</div>;

  return (
    <div className="relative min-h-dvh">
      <BridgeBackdrop />
      <div className="above">
        <DrillSession project={project} />
        <LockedList project={project} />
      </div>
    </div>
  );
}
