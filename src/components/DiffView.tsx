import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SegmentText } from '@/components/AnswerCard';
import { TokenSpan } from '@/components/TokenSpan';
import type { MergeResult } from '@/lib/merge';
import type { Segment } from '@/types';

export function DiffView({
  open,
  previous,
  proposal,
  previousCoachingNote,
  onAccept,
  onDiscard,
}: {
  open: boolean;
  previous: Segment[];
  proposal: MergeResult | null;
  previousCoachingNote: string;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  if (!proposal) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onDiscard() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>The rewrite</DialogTitle>
          <DialogDescription>
            Confirmed details keep their marking. Anything newly invented is marked amber again.
          </DialogDescription>
        </DialogHeader>

        {proposal.missingFacts.length ? (
          <div className="rounded-md bg-destructive/10 px-3.5 py-3 font-mono text-xs text-destructive">
            The rewrite dropped {proposal.missingFacts.length} confirmed{' '}
            {proposal.missingFacts.length === 1 ? 'detail' : 'details'} after a retry:{' '}
            {proposal.missingFacts.map((f) => `"${f}"`).join(', ')}. Discard the rewrite if you
            need them kept.
          </div>
        ) : null}

        <div className="max-h-[55vh] space-y-6 overflow-y-auto">
          <section>
            <div className="eyebrow text-muted-foreground">Before</div>
            <div className="answer-prose mt-2 text-muted-foreground">
              <SegmentText
                segments={previous}
                renderToken={(t) => <TokenSpan token={t} />}
              />
            </div>
          </section>

          <section>
            <div className="eyebrow text-muted-foreground">After</div>
            <div className="answer-prose mt-2">
              <SegmentText
                segments={proposal.shortAnswer}
                renderToken={(t) => <TokenSpan token={t} />}
              />
            </div>
          </section>

          {proposal.coachingNote !== previousCoachingNote ? (
            <section>
              <div className="eyebrow text-muted-foreground">
                New coaching note
              </div>
              <p className="mt-2 text-sm leading-relaxed">{proposal.coachingNote}</p>
            </section>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
          <Button onClick={onAccept}>Accept rewrite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
