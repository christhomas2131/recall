import { SegmentText } from '@/components/AnswerCard';
import { TokenSpan } from '@/components/TokenSpan';
import { corrections, exportStats, MARK_LEGEND, verificationFooter } from '@/lib/exportDoc';
import type { Project } from '@/types';

/**
 * The whole document, laid out for paper. Hidden on screen so collapsed
 * disclosures on the verification screen cannot swallow content in print.
 */
export function PrintDocument({ project }: { project: Project }) {
  const stats = exportStats(project);
  const edits = corrections(project);
  const generated = project.questions.filter((q) => q.generatedAt !== null);

  return (
    <div className="hidden print:block">
      <h1 className="font-serif text-[32px] leading-tight">{project.name}</h1>

      {project.mode === 'fast' && stats.unverified.length ? (
        <section className="mt-4 border border-black/40 p-3">
          <p className="eyebrow">
            {stats.unverified.length} details in this document are AI-generated and unverified.
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {stats.unverified.map((t) => (
              <li key={t.id}>{t.text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {stats.unverified.length ? (
        <p className="mt-3 text-xs italic">{MARK_LEGEND}</p>
      ) : null}

      {generated.map((question) => {
        const role = project.resume.roles.find((r) => r.id === question.sourceRoleId);
        return (
          <section key={question.id} className="mt-8 break-inside-avoid">
            <h2 className="font-serif text-[22px] leading-snug">{question.text}</h2>
            <p className="mt-1 text-xs italic">
              {role ? `${role.title}, ${role.employer}` : 'No source role'}
              {question.competency ? ` · ${question.competency}` : ''}
            </p>
            <div className="answer-prose mt-3">
              <SegmentText
                segments={question.shortAnswer}
                renderToken={(t) => <TokenSpan token={t} />}
              />
            </div>
            {question.coachingNote.trim() ? (
              <p className="mt-3 border-l-2 border-black/30 pl-3 text-sm">
                <span className="eyebrow">Coaching note — </span>
                {question.coachingNote}
              </p>
            ) : null}
            {question.longAnswer.length ? (
              <>
                <h3 className="eyebrow mt-4">The material underneath</h3>
                <div className="answer-prose mt-2">
                  <SegmentText
                    segments={question.longAnswer}
                    renderToken={(t) => <TokenSpan token={t} />}
                  />
                </div>
              </>
            ) : null}
          </section>
        );
      })}

      {edits.length ? (
        <section className="mt-10 break-before-page">
          <h2 className="font-serif text-[22px] leading-snug">Corrections</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {edits.map((c, i) => (
              <li key={i}>
                <span className="font-serif text-[17px]">{c.current}</span> — Recall first wrote “
                {c.original}”
                {c.note ? <div className="mt-0.5 text-xs">{c.note}</div> : null}
                <div className="mt-0.5 text-xs italic">{c.questionText}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 border-t border-black/30 pt-3 text-xs italic">
        {verificationFooter(project)}
      </p>
    </div>
  );
}
