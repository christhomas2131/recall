import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Their fixed pixel-art scene. `page` dims it so dense text stays readable.
 * `pan` (0-1) travels along the span as the deck slides between panels.
 */
export type Scene = 'bridge' | 'skyline' | 'houses' | 'hills';

export function BridgeBackdrop({
  variant = 'page',
  pan,
  scene = 'bridge',
}: {
  variant?: 'hero' | 'page';
  pan?: number;
  scene?: Scene;
}) {
  return (
    <div
      className={cn(
        'bridge',
        variant === 'page' && 'bridge--page',
        pan !== undefined && 'bridge--pan',
        scene !== 'bridge' && `bridge--${scene}`,
      )}
      style={pan !== undefined ? ({ '--pan': `${pan * 100}%` } as React.CSSProperties) : undefined}
      aria-hidden
    />
  );
}

const NAV: [string, string][] = [
  ['/', 'Projects'],
  ['/harvest', 'Harvest'],
  ['/churn', 'Churn'],
];

/** Their .site-header: floats over the scene, serif wordmark, mono nav. */
export function SiteHeader({ right }: { right?: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <header className="header-float fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-6 px-8 py-5 max-md:px-5 max-md:py-4 print:hidden">
      <Link to="/" className="shrink-0 font-serif text-[22px] leading-none">
        Recall
      </Link>
      <nav className="flex items-center gap-6 font-mono text-sm max-sm:gap-4">
        {NAV.map(([to, label]) => (
          <Link
            key={to}
            to={to}
            className={cn(
              'hover:opacity-60',
              (to === '/' ? pathname === '/' : pathname.startsWith(to)) && 'underline underline-offset-4',
            )}
          >
            {label}
          </Link>
        ))}
        <Link to="/settings" className="text-muted-foreground hover:opacity-60 max-sm:hidden">
          Settings
        </Link>
        {right}
      </nav>
    </header>
  );
}

/** Their .site-footer. */
export function SiteFooter() {
  return (
    <footer className="mt-24 flex flex-col items-start gap-2 border-t px-8 py-12 hairline max-md:px-5 print:hidden">
      <div className="font-serif text-[28px] leading-none">Recall</div>
      <p className="font-mono text-[13px] text-muted-foreground">
        Projects stay in this browser. AI runs through a loopback-only local companion.
      </p>
    </footer>
  );
}

export function Shell({
  children,
  right,
  className,
  scene,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  scene?: Scene;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <BridgeBackdrop scene={scene} />
      <div className="above flex min-h-dvh flex-col">
        <SiteHeader right={right} />
        <main
          className={cn(
            'mx-auto w-full max-w-content flex-1 px-8 pb-20 pt-[120px] max-md:px-4 max-md:pt-[96px]',
            className,
          )}
        >
          {children}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="mb-10">
      <h1 className="page-title max-w-[16ch]">{title}</h1>
      {subtitle ? <p className="page-subtitle mt-5">{subtitle}</p> : null}
    </div>
  );
}
