import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const SHORTCUTS: [string, string][] = [
  ['j / k', 'next / previous detail'],
  ['Enter', 'open the detail'],
  ['c', 'confirm it'],
  ['e', 'edit it'],
  ['d', 'delete it and rewrite around it'],
  ['Esc', 'close'],
  ['n / p', 'next / previous question'],
  ['?', 'this sheet'],
];

export function ShortcutSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard</DialogTitle>
        </DialogHeader>
        <dl className="space-y-2 text-sm">
          {SHORTCUTS.map(([key, label]) => (
            <div key={key} className="flex items-baseline justify-between gap-6">
              <dt className="font-mono text-xs text-muted-foreground">{key}</dt>
              <dd className="text-right">{label}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
