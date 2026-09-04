import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shell, PageTitle } from '@/components/Shell';
import { saveSettings, useSettings } from '@/db/hooks';
import type { Settings } from '@/types';

const DEFAULT_MODEL: Record<Settings['provider'], string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o',
};

export default function SettingsRoute() {
  const settings = useSettings();
  const [params] = useSearchParams();
  const error = params.get('error');

  return (
    <Shell>
      <PageTitle
        title="Settings"
        subtitle="Your key is kept in this browser's localStorage and sent only to the provider you pick. It is never sent anywhere else, and there is no server."
      />

      {error ? (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3.5 font-mono text-[13px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Provider</Label>
          <div className="flex gap-2">
            {(['anthropic', 'openai'] as const).map((p) => (
              <Button
                key={p}
                variant={settings.provider === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => saveSettings({ provider: p, model: DEFAULT_MODEL[p] })}
              >
                {p === 'anthropic' ? 'Anthropic' : 'OpenAI'}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiKey">API key</Label>
          <Input
            id="apiKey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={settings.provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
            value={settings.apiKey}
            onChange={(e) => saveSettings({ apiKey: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Input
            id="model"
            spellCheck={false}
            value={settings.model}
            onChange={(e) => saveSettings({ model: e.target.value })}
          />
        </div>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Anthropic calls are sent from the browser with the{' '}
        <code className="font-mono">anthropic-dangerous-direct-browser-access</code> header. That
        exposes your key to any script running on this page, which is the trade for having no
        server. Use a key scoped to this purpose.
      </p>
    </Shell>
  );
}
