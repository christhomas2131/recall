import { mutateProject } from '@/db/hooks';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { tokenProgress } from '@/components/ProgressHeader';
import type { Mode, Project } from '@/types';

export function ModeToggle({ project }: { project: Project }) {
  const { toast } = useToast();

  const set = (mode: Mode) => {
    if (mode === project.mode) return;
    mutateProject(project.id, (p) => ({ ...p, mode }));
    if (mode === 'standard') {
      const remaining = tokenProgress(project).total - tokenProgress(project).resolved;
      if (remaining > 0) {
        toast({
          title: 'Export is blocked now',
          description: `Standard mode holds exports until all ${remaining} unverified details are resolved.`,
        });
      }
    }
  };

  return (
    <div className="flex items-center rounded-pill border border-foreground p-0.5 font-mono text-xs">
      {(['standard', 'fast'] as const).map((m) => (
        <button
          key={m}
          onClick={() => set(m)}
          className={cn(
            'rounded-pill px-3 py-1 capitalize transition-colors',
            project.mode === m
              ? 'bg-foreground text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
