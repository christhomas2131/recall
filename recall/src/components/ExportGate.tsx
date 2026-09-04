import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { tokenProgress } from '@/components/ProgressHeader';
import { uniqueTokens } from '@/lib/segments';
import type { Project } from '@/types';

export interface UnverifiedItem {
  questionId: string;
  questionText: string;
  tokenText: string;
}

export function unverifiedItems(project: Project): UnverifiedItem[] {
  const items: UnverifiedItem[] = [];
  for (const question of project.questions) {
    for (const token of uniqueTokens(question.shortAnswer, question.longAnswer)) {
      if (token.state !== 'unverified') continue;
      items.push({
        questionId: question.id,
        questionText: question.text,
        tokenText: token.text,
      });
    }
  }
  return items;
}

/**
 * Section 2. Standard mode blocks every export path while an unverified token
 * remains; Fast mode allows it behind one confirm dialog.
 */
export function useExportGate(project: Project) {
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const remaining = tokenProgress(project).total - tokenProgress(project).resolved;
  const blocked = project.mode === 'standard' && remaining > 0;

  const request = useCallback(
    (action: () => void) => {
      if (blocked) {
        setBlockedOpen(true);
        return;
      }
      if (project.mode === 'fast' && remaining > 0) {
        setPendingAction(() => action);
        setConfirmOpen(true);
        return;
      }
      action();
    },
    [blocked, project.mode, remaining],
  );

  return {
    blocked,
    remaining,
    request,
    blockedOpen,
    setBlockedOpen,
    confirmOpen,
    setConfirmOpen,
    pendingAction,
    setPendingAction,
  };
}

export function ExportGateDialogs({
  project,
  gate,
}: {
  project: Project;
  gate: ReturnType<typeof useExportGate>;
}) {
  const items = unverifiedItems(project);

  return (
    <>
      <Dialog open={gate.blockedOpen} onOpenChange={gate.setBlockedOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {items.length} {items.length === 1 ? 'detail is' : 'details are'} still unverified
            </DialogTitle>
            <DialogDescription>
              Standard mode holds exports until you have been through every invented specific.
              Switch to Fast mode if you want to export with them marked instead.
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {items.map((item, i) => (
              <li key={`${item.questionId}-${i}`}>
                <Link
                  to={`/p/${project.id}/verify/${item.questionId}`}
                  onClick={() => gate.setBlockedOpen(false)}
                  className="block rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <span className="token-unverified text-sm">{item.tokenText}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {item.questionText}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button variant="ghost" onClick={() => gate.setBlockedOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gate.confirmOpen} onOpenChange={gate.setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Before you export</DialogTitle>
            <DialogDescription>
              {gate.remaining} details in this document are AI-generated and unverified. Confirm
              these before using them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                gate.setPendingAction(null);
                gate.setConfirmOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const action = gate.pendingAction;
                gate.setPendingAction(null);
                gate.setConfirmOpen(false);
                action?.();
              }}
            >
              Export anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
