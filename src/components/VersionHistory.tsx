import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { segmentsToText } from '@/lib/segments';
import type { AnswerVersion } from '@/types';

const TRIGGER_LABEL: Record<AnswerVersion['trigger'], string> = {
  initial: 'first draft',
  regeneration: 'rewritten after a correction',
  'role-reassignment': 'rewritten from a different role',
};

export function VersionHistory({ versions }: { versions: AnswerVersion[] }) {
  if (!versions.length) return null;

  return (
    <Collapsible className="mt-6 border-t border-border pt-4">
      <CollapsibleTrigger className="eyebrow text-muted-foreground hover:text-foreground">
        Earlier versions ({versions.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-4 space-y-5">
          {[...versions].reverse().map((v) => (
            <li key={v.id}>
              <div className="text-[11px] text-muted-foreground">
                {new Date(v.createdAt).toLocaleString()} · {TRIGGER_LABEL[v.trigger]}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {segmentsToText(v.shortAnswer)}
              </p>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
