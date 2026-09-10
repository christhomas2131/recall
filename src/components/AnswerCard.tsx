import type { ReactNode } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CoachingNote } from '@/components/CoachingNote';
import { uniqueTokens } from '@/lib/segments';
import type { Question, Segment, TokenSegment } from '@/types';

export function SegmentText({
  segments,
  renderToken,
}: {
  segments: Segment[];
  renderToken: (token: TokenSegment) => ReactNode;
}) {
  return (
    <>
      {/* Keyed by position: the same token id can legitimately appear twice
          in one answer, and the array is always replaced wholesale. */}
      {segments.map((s, i) =>
        s.kind === 'text' ? (
          <span key={i}>{s.text}</span>
        ) : (
          <span key={i}>{renderToken(s)}</span>
        ),
      )}
    </>
  );
}

export function AnswerCard({
  question,
  renderToken,
  header,
}: {
  question: Question;
  renderToken: (token: TokenSegment) => ReactNode;
  header?: ReactNode;
}) {
  const tokens = uniqueTokens(question.shortAnswer, question.longAnswer);
  const remaining = tokens.filter((t) => t.state === 'unverified').length;

  return (
    <article>
      <h1 className="font-serif text-[32px] leading-[1.2]">{question.text}</h1>
      {header}

      <div className="reading-panel mt-6">
        <div className="answer-prose">
          <SegmentText segments={question.shortAnswer} renderToken={renderToken} />
        </div>
      </div>

      {tokens.length === 0 && question.generatedAt !== null ? (
        <p className="mt-4 text-xs text-muted-foreground">No details to verify.</p>
      ) : null}

      <CoachingNote note={question.coachingNote} />

      {question.longAnswer.length ? (
        <Collapsible className="mt-7 border-t border-border pt-4">
          <CollapsibleTrigger className="eyebrow text-muted-foreground hover:text-foreground">
            The material underneath
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="answer-prose mt-4 text-muted-foreground">
              <SegmentText segments={question.longAnswer} renderToken={renderToken} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {remaining > 0 ? (
        <p className="mt-6 text-xs text-unverified">
          {remaining} invented {remaining === 1 ? 'detail' : 'details'} still marked.
        </p>
      ) : null}
    </article>
  );
}
