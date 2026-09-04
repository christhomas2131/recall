import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { TokenSpan } from '@/components/TokenSpan';
import type { TokenSegment } from '@/types';

export interface TokenActions {
  confirm: (token: TokenSegment, note: string) => void;
  saveEdit: (token: TokenSegment, text: string, note: string) => void;
  remove: (token: TokenSegment) => void;
  regenerate: (token: TokenSegment, note: string) => void;
}

export function TokenPopover({
  token,
  open,
  onOpenChange,
  actions,
  busy,
  autoFocusInput,
}: {
  token: TokenSegment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: TokenActions;
  busy: boolean;
  autoFocusInput?: boolean;
}) {
  const [text, setText] = useState(token.text);
  const [note, setNote] = useState(token.userNote ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setText(token.text);
      setNote(token.userNote ?? '');
    }
  }, [open, token.text, token.userNote]);

  useEffect(() => {
    if (open && autoFocusInput) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [open, autoFocusInput]);

  const changed = text.trim() !== token.text && text.trim().length > 0;
  const hasNote = note.trim().length > 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <TokenSpan token={token} active={open} onActivate={() => onOpenChange(true)} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-4" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-baseline justify-between">
          <span className="eyebrow text-muted-foreground">
            {token.category}
          </span>
          {token.state !== 'unverified' ? (
            <span className="text-[11px] text-muted-foreground">
              {token.state === 'edited' ? 'corrected by you' : 'confirmed'}
            </span>
          ) : null}
        </div>

        <Input
          ref={inputRef}
          className="mt-2"
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && changed) {
              e.preventDefault();
              actions.saveEdit(token, text.trim(), note.trim());
            }
          }}
        />

        {token.state === 'edited' && token.originalText !== token.text ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Recall first guessed: <span className="line-through">{token.originalText}</span>
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {changed ? (
            <Button size="sm" onClick={() => actions.saveEdit(token, text.trim(), note.trim())}>
              Save edit
            </Button>
          ) : (
            <Button size="sm" onClick={() => actions.confirm(token, note.trim())}>
              Confirm
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => actions.remove(token)}
          >
            Delete
          </Button>
        </div>

        <label className="mt-4 block text-xs text-muted-foreground" htmlFor={`note-${token.id}`}>
          What actually happened?
        </label>
        <Textarea
          id={`note-${token.id}`}
          className="mt-1.5 text-sm"
          rows={3}
          placeholder="No — it was six weeks, and the holdup was the finance handoff."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {hasNote ? (
          <Button
            size="sm"
            variant="secondary"
            className="mt-3 w-full"
            disabled={busy}
            onClick={() => actions.regenerate(token, note.trim())}
          >
            {busy ? 'Rewriting…' : 'Regenerate this answer'}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
