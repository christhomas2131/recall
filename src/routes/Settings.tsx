import { useSearchParams } from 'react-router-dom';
import { Shell, PageTitle } from '@/components/Shell';

export default function SettingsRoute() {
  const [params] = useSearchParams();
  const error = params.get('error');

  return (
    <Shell>
      <PageTitle
        title="Settings"
        subtitle="Recall accepts AI work only through a loopback-only local companion. Browser-held provider keys have been removed."
      />

      {error ? (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3.5 font-mono text-[13px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="space-y-4 font-mono text-[13px] leading-relaxed text-muted-foreground">
        <p>
          Run <code className="rounded bg-foreground/10 px-1.5 py-0.5 text-foreground">npm start</code>{' '}
          to auto-detect Codex, Claude Code, a configured API provider, or a custom agent adapter.
        </p>
        <p>
          API credentials belong in the gitignored <code className="font-mono text-foreground">.env.local</code>{' '}
          file. Recall never stores them in localStorage or bundles them into browser code.
        </p>
      </div>
    </Shell>
  );
}
