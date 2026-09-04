import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AnswerCard } from '@/components/AnswerCard';
import { DiffView } from '@/components/DiffView';
import { ModeToggle } from '@/components/ModeToggle';
import { ProgressHeader } from '@/components/ProgressHeader';
import { BridgeBackdrop, SiteFooter } from '@/components/Shell';
import { ShortcutSheet } from '@/components/ShortcutSheet';
import { SourceRoleControl } from '@/components/SourceRoleControl';
import { TokenPopover } from '@/components/TokenPopover';
import { VersionHistory } from '@/components/VersionHistory';
import { mutateProject, useProject } from '@/db/hooks';
import { generateQuestions, MAX_ROLES_FOR_QUESTIONS } from '@/lib/operations';
import { uniqueTokens } from '@/lib/segments';
import { describeError, isKeyProblem, useFastModeBatch, useGenerateAnswer } from '@/lib/useAnswers';
import { useVerification } from '@/lib/useVerification';
import type { Project, Question } from '@/types';

function ErrorBlock({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 rounded-md bg-destructive/10 px-4 py-3.5 font-mono text-[13px] text-destructive">
      <span>{error}</span>
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 border-destructive/40 text-destructive hover:text-destructive"
          onClick={onRetry}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Single question — the verification pass
 * ------------------------------------------------------------------ */

function QuestionScreen({ project, question }: { project: Project; question: Question }) {
  const navigate = useNavigate();
  const { generate, pending, error } = useGenerateAnswer(project);
  const v = useVerification(project, question);
  const index = project.questions.findIndex((q) => q.id === question.id);
  const prev = project.questions[index - 1];
  const next = project.questions[index + 1];

  return (
    <div className="relative min-h-dvh">
      <BridgeBackdrop />
      <div className="above flex min-h-dvh flex-col">
      <ProgressHeader project={project} right={<ModeToggle project={project} />} />
      <main className="mx-auto w-full max-w-content px-8 pb-20 pt-[120px] max-md:px-4 max-md:pt-[96px]">
        <div className="mb-6 flex items-center justify-between text-xs text-muted-foreground">
          <Link to={`/p/${project.id}/verify`} className="hover:text-foreground">
            ← All questions
          </Link>
          <span className="tabular-nums">
            {index + 1} of {project.questions.length}
          </span>
        </div>

        {error ? <ErrorBlock error={error} onRetry={() => void generate(question)} /> : null}
        {v.error ? <ErrorBlock error={v.error} onRetry={v.retryLast} /> : null}

        <AnswerCard
          question={question}
          renderToken={(token) => (
            <TokenPopover
              token={token}
              open={v.activeTokenId === token.id}
              onOpenChange={(open) => v.setActiveTokenId(open ? token.id : null)}
              autoFocusInput={v.autoFocusInput}
              busy={v.busy}
              actions={v.actions}
            />
          )}
          header={
            <div className="mt-3 flex items-center justify-between gap-4">
              <SourceRoleControl
                roles={project.resume.roles}
                sourceRoleId={question.sourceRoleId}
                hasAnswer={question.generatedAt !== null}
                onReassign={(roleId) => {
                  const hadAnswer = question.generatedAt !== null;
                  mutateProject(project.id, (p) => ({
                    ...p,
                    questions: p.questions.map((q) =>
                      q.id === question.id ? { ...q, sourceRoleId: roleId } : q,
                    ),
                  }));
                  if (hadAnswer) {
                    void generate({ ...question, sourceRoleId: roleId }, 'role-reassignment');
                  }
                }}
              />
              <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                {question.category}
              </Badge>
            </div>
          }
        />

        {question.generatedAt === null ? (
          <div className="mt-8 panel px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Recall will draft an answer with invented specifics for you to correct.
            </p>
            <Button
              className="mt-5"
              disabled={pending === question.id}
              onClick={() => void generate(question)}
            >
              {pending === question.id ? 'Drafting…' : 'Draft an answer'}
            </Button>
          </div>
        ) : null}

        {v.busy ? (
          <p className="mt-6 text-xs text-muted-foreground">Rewriting the answer…</p>
        ) : null}

        <VersionHistory versions={question.versions} />

        <div className="mt-6 text-xs text-muted-foreground">
          <button
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => v.setShortcutsOpen(true)}
          >
            Keyboard shortcuts (?)
          </button>
        </div>

        <nav className="mt-12 flex items-center justify-between border-t border-border pt-5 text-sm">
          <button
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            disabled={!prev}
            onClick={() => prev && navigate(`/p/${project.id}/verify/${prev.id}`)}
          >
            {prev ? '← Previous question' : ''}
          </button>
          <button
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            disabled={!next}
            onClick={() => next && navigate(`/p/${project.id}/verify/${next.id}`)}
          >
            {next ? 'Next question →' : ''}
          </button>
        </nav>
      </main>

      <DiffView
        open={v.proposal !== null}
        previous={question.shortAnswer}
        proposal={v.proposal}
        previousCoachingNote={question.coachingNote}
        onAccept={v.acceptProposal}
        onDiscard={v.discardProposal}
      />
      <ShortcutSheet open={v.shortcutsOpen} onOpenChange={v.setShortcutsOpen} />
      <SiteFooter />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Question list
 * ------------------------------------------------------------------ */

function QuestionRow({ project, question }: { project: Project; question: Question }) {
  const { generate, pending } = useGenerateAnswer(project);
  const tokens = uniqueTokens(question.shortAnswer, question.longAnswer);
  const remaining = tokens.filter((t) => t.state === 'unverified').length;

  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-4">
        <Link
          to={`/p/${project.id}/verify/${question.id}`}
          className="min-w-0 flex-1 text-[15px] leading-snug hover:underline"
        >
          {question.text}
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {question.category}
          </Badge>
          {question.generatedAt === null ? (
            <span className="text-xs text-muted-foreground">no answer yet</span>
          ) : remaining > 0 ? (
            <span className="text-xs tabular-nums text-unverified">{remaining} to check</span>
          ) : (
            <span className="text-xs text-muted-foreground">verified</span>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-4">
        <SourceRoleControl
          roles={project.resume.roles}
          sourceRoleId={question.sourceRoleId}
          hasAnswer={question.generatedAt !== null}
          onReassign={(roleId) => {
            const hadAnswer = question.generatedAt !== null;
            mutateProject(project.id, (p) => ({
              ...p,
              questions: p.questions.map((q) =>
                q.id === question.id ? { ...q, sourceRoleId: roleId } : q,
              ),
            }));
            if (hadAnswer) {
              void generate({ ...question, sourceRoleId: roleId }, 'role-reassignment');
            }
          }}
        />
        <div className="flex shrink-0 items-center gap-3">
          {question.competency ? (
            <span className="text-xs italic text-muted-foreground">{question.competency}</span>
          ) : null}
          {question.generatedAt === null ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={pending === question.id}
              onClick={() => void generate(question)}
            >
              {pending === question.id ? 'Drafting…' : 'Draft'}
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function DistributionSummary({ project }: { project: Project }) {
  const counts = new Map<string, number>();
  for (const q of project.questions) {
    counts.set(q.sourceRoleId, (counts.get(q.sourceRoleId) ?? 0) + 1);
  }
  const total = project.questions.length;

  return (
    <div className="mt-10 border-t border-border pt-5">
      <div className="eyebrow text-muted-foreground">
        Questions per role
      </div>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {project.resume.roles.map((r) => {
          const n = counts.get(r.id) ?? 0;
          return (
            <li key={r.id} className="flex justify-between gap-4">
              <span className="truncate">
                {r.title} · {r.employer}
              </span>
              <span className="shrink-0 tabular-nums">
                {n} ({total ? Math.round((n / total) * 100) : 0}%)
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function QuestionList({ project }: { project: Project }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const batch = useFastModeBatch(project);

  async function onGenerateQuestions() {
    setError(null);
    setBusy(true);
    try {
      const questions = await generateQuestions(project);
      mutateProject(project.id, (p) => ({ ...p, questions }));
    } catch (e) {
      if (isKeyProblem(e)) {
        navigate(`/settings?error=${encodeURIComponent(e.message)}`);
        return;
      }
      setError(describeError(e, 'Question generation failed.'));
    } finally {
      setBusy(false);
    }
  }

  const truncatedRoles = project.resume.roles.length > MAX_ROLES_FOR_QUESTIONS;
  const ungenerated = project.questions.filter((q) => q.generatedAt === null);

  return (
    <div className="relative min-h-dvh">
      <BridgeBackdrop />
      <div className="above flex min-h-dvh flex-col">
      <ProgressHeader project={project} right={<ModeToggle project={project} />} />
      <main className="mx-auto w-full max-w-content px-8 pb-20 pt-[120px] max-md:px-4 max-md:pt-[96px]">
        {error ? (
          <ErrorBlock error={error} onRetry={() => void onGenerateQuestions()} />
        ) : null}

        {project.questions.length === 0 ? (
          <div className="panel px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              {project.jobDescription
                ? '15 questions from your resume and the job description.'
                : 'No job description, so 10 general questions from your resume.'}
            </p>
            <Button className="mt-5" disabled={busy} onClick={() => void onGenerateQuestions()}>
              {busy ? 'Writing questions…' : 'Generate questions'}
            </Button>
            <div className="mt-4">
              <Link
                to={`/p/${project.id}/review`}
                className="text-xs text-muted-foreground underline underline-offset-2"
              >
                Back to the parsed resume
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-baseline justify-between">
              <h1 className="page-title">Questions</h1>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      'Regenerate the question set? Every answer and correction in this project is discarded.',
                    )
                  ) {
                    void onGenerateQuestions();
                  }
                }}
              >
                Regenerate set
              </Button>
            </div>

            {batch.state.running ? (
              <div className="panel mb-6 flex items-center justify-between px-5 py-4 text-sm">
                <span className="tabular-nums text-muted-foreground">
                  Drafting answers — {batch.state.done} of {batch.state.total}
                </span>
                <Button variant="ghost" size="sm" onClick={batch.stop}>
                  Stop
                </Button>
              </div>
            ) : batch.state.failed > 0 ? (
              <ErrorBlock
                error={`${batch.state.failed} of ${batch.state.total} answers failed to draft. ${
                  batch.state.error ?? ''
                }`}
                onRetry={() => batch.startManually(project)}
              />
            ) : project.mode === 'fast' && ungenerated.length > 0 ? (
              <div className="panel mb-6 flex items-center justify-between px-5 py-4 text-sm">
                <span className="text-muted-foreground">
                  {ungenerated.length} questions have no answer yet.
                </span>
                <Button variant="outline" size="sm" onClick={() => batch.startManually(project)}>
                  Draft them all
                </Button>
              </div>
            ) : null}

            {truncatedRoles ? (
              <p className="mb-4 text-xs text-muted-foreground">
                Your resume has {project.resume.roles.length} roles. Questions were drawn from the{' '}
                {MAX_ROLES_FOR_QUESTIONS} most recent.
              </p>
            ) : null}
            {project.resume.roles.length === 1 ? (
              <p className="mb-4 text-xs text-muted-foreground">
                Answers will draw from a single role.
              </p>
            ) : null}

            <ul className="divide-y divide-border border-y border-border">
              {project.questions.map((q) => (
                <QuestionRow key={q.id} project={project} question={q} />
              ))}
            </ul>

            <DistributionSummary project={project} />
          </>
        )}
      </main>
      <SiteFooter />
      </div>
    </div>
  );
}

export default function Verify() {
  const { projectId, questionId } = useParams();
  const { project, loading } = useProject(projectId);

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  if (!project) return <div className="p-10 text-sm">Project not found.</div>;

  if (questionId) {
    const question = project.questions.find((q) => q.id === questionId);
    if (!question) return <div className="p-10 text-sm">Question not found.</div>;
    return <QuestionScreen project={project} question={question} />;
  }

  return <QuestionList project={project} />;
}
