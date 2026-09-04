import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import type { TokenSegment } from '@/types';

export const TokenSpan = forwardRef<
  HTMLButtonElement,
  {
    token: TokenSegment;
    active?: boolean;
    onActivate?: () => void;
  }
>(function TokenSpan({ token, active, onActivate }, ref) {
  const label =
    token.state === 'unverified'
      ? `Unverified ${token.category}: ${token.text}`
      : token.state === 'edited'
        ? `Corrected ${token.category}: ${token.text}`
        : `Confirmed ${token.category}: ${token.text}`;

  return (
    <button
      ref={ref}
      type="button"
      data-token-id={token.id}
      aria-label={label}
      onClick={onActivate}
      className={cn(
        'cursor-pointer rounded-[2px] text-left font-[inherit] leading-[inherit] transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        token.state === 'unverified' && 'token-unverified hover:bg-unverified-soft',
        token.state === 'edited' && 'token-edited hover:bg-edited-soft',
        token.state === 'confirmed' && 'hover:bg-muted',
        active && 'bg-muted',
      )}
    >
      {token.text}
    </button>
  );
});
