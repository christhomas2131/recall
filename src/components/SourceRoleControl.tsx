import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { Role } from '@/types';

export function SourceRoleControl({
  roles,
  sourceRoleId,
  hasAnswer,
  onReassign,
}: {
  roles: Role[];
  sourceRoleId: string;
  hasAnswer: boolean;
  onReassign: (roleId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = roles.find((r) => r.id === sourceRoleId);

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="truncate">
        {current ? `${current.title} · ${current.employer}` : 'No source role'}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="underline underline-offset-2 hover:text-foreground">change</button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3">
          <div className="mb-2 text-xs font-medium">Answer from a different role</div>
          {hasAnswer ? (
            <p className="mb-3 text-xs text-muted-foreground">
              This rewrites the answer from scratch. Corrections you have made to it will be lost;
              the current version is kept in history.
            </p>
          ) : null}
          <div className="space-y-1">
            {roles.map((r) => (
              <Button
                key={r.id}
                variant={r.id === sourceRoleId ? 'secondary' : 'ghost'}
                size="sm"
                className="h-auto w-full justify-start py-1.5 text-left"
                onClick={() => {
                  setOpen(false);
                  if (r.id !== sourceRoleId) onReassign(r.id);
                }}
              >
                <span className="block truncate">
                  {r.title} · {r.employer}
                </span>
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
