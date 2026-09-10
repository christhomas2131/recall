import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mutateQuestion } from '@/db/hooks';
import { regenerateAnswer } from './operations';
import { patchToken, uniqueTokens } from './segments';
import { describeError, isKeyProblem, versionOf } from './useAnswers';
import type { MergeResult } from './merge';
import type { Project, Question, TokenSegment } from '@/types';

const DELETE_NOTE = (text: string) =>
  `Remove the claim about ${text} entirely. Do not replace it with a hedge or a vaguer version.`;

function focusToken(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-token-id="${id}"]`);
  el?.focus();
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

export function useVerification(project: Project, question: Question) {
  const navigate = useNavigate();
  const tokens = useMemo(
    () => uniqueTokens(question.shortAnswer, question.longAnswer),
    [question.shortAnswer, question.longAnswer],
  );

  const [activeTokenId, setActiveTokenId] = useState<string | null>(null);
  const [autoFocusInput, setAutoFocusInput] = useState(false);
  const [rawCursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<MergeResult | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const lastRun = useRef<{ userNote: string; excludeTokenId?: string } | null>(null);

  /* ---------------- token state changes ---------------- */

  const applyToToken = useCallback(
    (tokenId: string, patch: Partial<Omit<TokenSegment, 'kind' | 'id'>>) => {
      mutateQuestion(project.id, question.id, (q) => ({
        ...q,
        shortAnswer: patchToken(q.shortAnswer, tokenId, patch),
        longAnswer: patchToken(q.longAnswer, tokenId, patch),
      }));
    },
    [project.id, question.id],
  );

  const confirm = useCallback(
    (token: TokenSegment, note: string) => {
      applyToToken(token.id, {
        state: 'confirmed',
        userNote: note || token.userNote,
      });
      setActiveTokenId(null);
    },
    [applyToToken],
  );

  const saveEdit = useCallback(
    (token: TokenSegment, text: string, note: string) => {
      applyToToken(token.id, {
        text,
        state: 'edited',
        userNote: note || token.userNote,
      });
      setActiveTokenId(null);
    },
    [applyToToken],
  );

  /* ---------------- regeneration ---------------- */

  const runRegeneration = useCallback(
    async (userNote: string, excludeTokenId?: string) => {
      const role = project.resume.roles.find((r) => r.id === question.sourceRoleId);
      if (!role) {
        setError('That question has no source role.');
        return;
      }
      lastRun.current = { userNote, excludeTokenId };
      setError(null);
      setBusy(true);
      try {
        const merged = await regenerateAnswer({
          question,
          role,
          userNote,
          jobDescription: project.jobDescription,
          styleProfile: project.styleProfile,
          excludeTokenId,
        });
        setProposal(merged);
        setActiveTokenId(null);
      } catch (e) {
        if (isKeyProblem(e)) {
          navigate(`/settings?error=${encodeURIComponent(e.message)}`);
          return;
        }
        setError(describeError(e, 'The rewrite failed.'));
      } finally {
        setBusy(false);
      }
    },
    [navigate, project, question],
  );

  const regenerate = useCallback(
    (token: TokenSegment, note: string) => {
      if (note) applyToToken(token.id, { userNote: note });
      void runRegeneration(note || DELETE_NOTE(token.text));
    },
    [applyToToken, runRegeneration],
  );

  const remove = useCallback(
    (token: TokenSegment) => {
      void runRegeneration(DELETE_NOTE(token.text), token.id);
    },
    [runRegeneration],
  );

  const acceptProposal = useCallback(() => {
    if (!proposal) return;
    mutateQuestion(project.id, question.id, (q) => ({
      ...q,
      versions: versionOf(q, 'regeneration'),
      shortAnswer: proposal.shortAnswer,
      longAnswer: proposal.longAnswer,
      coachingNote: proposal.coachingNote,
      generatedAt: Date.now(),
    }));
    setProposal(null);
    setCursor(0);
  }, [project.id, question.id, proposal]);

  const discardProposal = useCallback(() => setProposal(null), []);

  /* ---------------- keyboard ---------------- */

  // A regeneration can shrink the token list under the cursor; clamp on read
  // rather than correcting it in an effect one render later.
  const cursor = Math.min(rawCursor, Math.max(0, tokens.length - 1));
  const diffOpen = proposal !== null;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Escape') {
        setActiveTokenId(null);
        setShortcutsOpen(false);
        return;
      }
      if (isTyping(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      // A modal owns the keyboard while it is up; otherwise c/e/d would
      // mutate the answer sitting behind the diff.
      if (diffOpen || shortcutsOpen) return;

      const index = cursor;
      const token = tokens[index];

      switch (e.key) {
        case 'j': {
          if (!tokens.length) return;
          e.preventDefault();
          const nextIndex = Math.min(tokens.length - 1, index + 1);
          setCursor(nextIndex);
          setActiveTokenId(null);
          focusToken(tokens[nextIndex].id);
          return;
        }
        case 'k': {
          if (!tokens.length) return;
          e.preventDefault();
          const nextIndex = Math.max(0, index - 1);
          setCursor(nextIndex);
          setActiveTokenId(null);
          focusToken(tokens[nextIndex].id);
          return;
        }
        case 'Enter':
          if (!token) return;
          e.preventDefault();
          setAutoFocusInput(false);
          setActiveTokenId(token.id);
          return;
        case 'c':
          if (!token) return;
          e.preventDefault();
          confirm(token, '');
          return;
        case 'e':
          if (!token) return;
          e.preventDefault();
          setAutoFocusInput(true);
          setActiveTokenId(token.id);
          return;
        case 'd':
          if (!token || busy) return;
          e.preventDefault();
          remove(token);
          return;
        case 'n': {
          e.preventDefault();
          const i = project.questions.findIndex((q) => q.id === question.id);
          const next = project.questions[i + 1];
          if (next) navigate(`/p/${project.id}/verify/${next.id}`);
          return;
        }
        case 'p': {
          e.preventDefault();
          const i = project.questions.findIndex((q) => q.id === question.id);
          const prev = project.questions[i - 1];
          if (prev) navigate(`/p/${project.id}/verify/${prev.id}`);
          return;
        }
        default:
          return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, confirm, cursor, diffOpen, navigate, project, question.id, remove, shortcutsOpen, tokens]);

  const retryLast = useCallback(() => {
    const last = lastRun.current;
    if (!last) return;
    void runRegeneration(last.userNote, last.excludeTokenId);
  }, [runRegeneration]);

  return {
    tokens,
    retryLast,
    activeTokenId,
    setActiveTokenId,
    autoFocusInput,
    setAutoFocusInput,
    busy,
    error,
    setError,
    proposal,
    acceptProposal,
    discardProposal,
    shortcutsOpen,
    setShortcutsOpen,
    actions: { confirm, saveEdit, remove: (t: TokenSegment) => remove(t), regenerate },
  };
}
