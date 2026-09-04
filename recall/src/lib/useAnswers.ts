import { nanoid } from 'nanoid';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mutateQuestion } from '@/db/hooks';
import { LLMError } from '@/llm/client';
import { generateAnswer, generateAnswersInBatch, type GeneratedAnswer } from './operations';
import type { AnswerVersion, Project, Question } from '@/types';

export function describeError(e: unknown, fallback: string): string {
  if (e instanceof LLMError) return `${e.message}${e.detail ? ` (${e.detail})` : ''}`;
  return fallback;
}

export function isKeyProblem(e: unknown): e is LLMError {
  return e instanceof LLMError && (e.kind === 'no-key' || e.kind === 'auth');
}

/** Snapshot the current answer into history before overwriting it. */
export function versionOf(
  question: Question,
  trigger: AnswerVersion['trigger'],
): AnswerVersion[] {
  if (question.generatedAt === null) return question.versions;
  return [
    ...question.versions,
    {
      id: nanoid(),
      createdAt: question.generatedAt,
      shortAnswer: question.shortAnswer,
      longAnswer: question.longAnswer,
      coachingNote: question.coachingNote,
      trigger,
    },
  ];
}

export function commitAnswer(
  projectId: string,
  questionId: string,
  answer: GeneratedAnswer,
  trigger: AnswerVersion['trigger'],
) {
  mutateQuestion(projectId, questionId, (q) => ({
    ...q,
    versions: versionOf(q, trigger),
    shortAnswer: answer.shortAnswer,
    longAnswer: answer.longAnswer,
    coachingNote: answer.coachingNote,
    generatedAt: Date.now(),
  }));
}

/** Generation for a single question, with key errors routed to Settings. */
export function useGenerateAnswer(project: Project | undefined) {
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (question: Question, trigger: AnswerVersion['trigger'] = 'initial') => {
      if (!project) return;
      const role = project.resume.roles.find((r) => r.id === question.sourceRoleId);
      if (!role) {
        setError('That question has no source role. Pick one before generating.');
        return;
      }
      setError(null);
      setPending(question.id);
      try {
        const answer = await generateAnswer({
          question,
          role,
          jobDescription: project.jobDescription,
          styleProfile: project.styleProfile,
        });
        commitAnswer(project.id, question.id, answer, trigger);
      } catch (e) {
        if (isKeyProblem(e)) {
          navigate(`/settings?error=${encodeURIComponent(e.message)}`);
          return;
        }
        setError(describeError(e, 'Answer generation failed.'));
      } finally {
        setPending(null);
      }
    },
    [project, navigate],
  );

  return { generate, pending, error, setError };
}

export interface BatchState {
  running: boolean;
  done: number;
  total: number;
  failed: number;
  error: string | null;
}

/**
 * Fast mode generates every answer in one batch on entry (Section 2).
 * Runs at most once per project per mount and can be stopped.
 */
export function useFastModeBatch(project: Project | undefined) {
  const navigate = useNavigate();
  const [state, setState] = useState<BatchState>({
    running: false,
    done: 0,
    total: 0,
    failed: 0,
    error: null,
  });
  const stopped = useRef(false);
  const startedFor = useRef<string | null>(null);

  const run = useCallback(
    async (target: Project, questionIds: string[]) => {
      if (!questionIds.length) return;
      stopped.current = false;
      setState({ running: true, done: 0, total: questionIds.length, failed: 0, error: null });
      let keyProblem: LLMError | null = null;
      await generateAnswersInBatch({
        project: target,
        questionIds,
        shouldStop: () => {
          if (keyProblem) return true;
          return stopped.current;
        },
        onAnswer: (questionId, answer) => {
          commitAnswer(target.id, questionId, answer, 'initial');
          setState((s) => ({ ...s, done: s.done + 1 }));
        },
        onError: (_questionId, error) => {
          // A bad key fails every remaining call, so stop and say so once.
          if (isKeyProblem(error)) keyProblem = error;
          setState((s) => ({
            ...s,
            done: s.done + 1,
            failed: s.failed + 1,
            error: s.error ?? describeError(error, 'Answer generation failed.'),
          }));
        },
      });
      setState((s) => ({ ...s, running: false }));
      if (keyProblem) {
        navigate(`/settings?error=${encodeURIComponent((keyProblem as LLMError).message)}`);
      }
    },
    [navigate],
  );

  useEffect(() => {
    if (!project || project.mode !== 'fast') return;
    if (startedFor.current === project.id) return;
    const ungenerated = project.questions.filter((q) => q.generatedAt === null);
    if (project.questions.length === 0 || ungenerated.length === 0) return;
    startedFor.current = project.id;
    void run(project, ungenerated.map((q) => q.id));
  }, [project, run]);

  const stop = useCallback(() => {
    stopped.current = true;
    setState((s) => ({ ...s, running: false }));
  }, []);

  const startManually = useCallback(
    (target: Project) => {
      startedFor.current = target.id;
      void run(
        target,
        target.questions.filter((q) => q.generatedAt === null).map((q) => q.id),
      );
    },
    [run],
  );

  return { state, stop, startManually };
}
