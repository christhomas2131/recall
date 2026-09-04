import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Shell, PageTitle } from '@/components/Shell';
import { useProjects } from '@/db/hooks';
import { removeJob, useChurnQueue } from '@/lib/churnQueue';
import { download, slugify } from '@/lib/exportDoc';
import { callLLM, LLMError } from '@/llm/client';
import { tailorPrompt, TailorSchema, type TailorResult } from '@/llm/churn';
import { cn } from '@/lib/utils';
import type { ParsedResume } from '@/types';

type Source = { jobDescription: string; roleTitle?: string; company?: string };

function toMarkdown(r: TailorResult, source: Source): string {
  const L: string[] = [];
  L.push(`# Tailored résumé notes${source.roleTitle ? ` — ${source.roleTitle}` : ''}`, '');
  if (source.company) L.push(`_${source.company}_`, '');
  L.push('## Positioning', '', r.positioning, '');
  L.push('## Rewritten bullets', '');
  for (const b of r.bullets) {
    L.push(`- **${b.rewritten}**`);
    L.push(`  - was: ${b.original}`);
    if (b.why) L.push(`  - ${b.why}`);
  }
  L.push('', '## What the posting asks for that you evidence', '');
  for (const m of r.matches) {
    L.push(`- **${m.requirement}** (${m.strength}) — ${m.evidence}`);
  }
  if (r.gaps.length) {
    L.push('', '## Gaps — not covered by your résumé', '');
    for (const g of r.gaps) L.push(`- **${g.requirement}** — ${g.note}`);
  }
  L.push('', '## Keywords', '');
  L.push(`- Present: ${r.keywords.present.join(', ') || '—'}`);
  L.push(`- Absent: ${r.keywords.absent.join(', ') || '—'}`);
  L.push('', '---', '', '_Every rewritten bullet traces to one you already wrote. Nothing here was invented._', '');
  return L.join('\n');
}

export default function Churn() {
  const navigate = useNavigate();
  const projects = useProjects();
  const queue = useChurnQueue();

  const [projectId, setProjectId] = useState<string>('');
  const [pasted, setPasted] = useState('');
  const [activeJob, setActiveJob] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [source, setSource] = useState<Source | null>(null);

  const project = useMemo(
    () => projects?.find((p) => p.id === projectId) ?? projects?.[0],
    [projects, projectId],
  );
  const resume: ParsedResume | undefined = project?.resume;
  const roleName = (id: string) =>
    resume?.roles.find((r) => r.id === id)?.employer ?? 'unknown role';

  async function tailor(src: Source) {
    if (!resume) {
      setError('No parsed résumé yet. Create a project first so Churn has material to work from.');
      return;
    }
    if (!src.jobDescription.trim()) {
      setError('Paste a job description, or pick one harvested job.');
      return;
    }
    setError(null);
    setBusy(true);
    setSource(src);
    try {
      const r = await callLLM(tailorPrompt({ resume, ...src }), TailorSchema, { maxTokens: 8192 });
      setResult(r);
    } catch (e) {
      if (e instanceof LLMError && (e.kind === 'no-key' || e.kind === 'auth')) {
        navigate(`/settings?error=${encodeURIComponent(e.message)}`);
        return;
      }
      setError(
        e instanceof LLMError ? `${e.message}${e.detail ? ` (${e.detail})` : ''}` : 'Tailoring failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell scene="houses">
      <PageTitle
        title="Churn"
        subtitle="Point your résumé at one posting. Churn reorders and reframes what you already wrote — and tells you plainly what the posting wants that you cannot evidence."
      />

      {error ? (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3.5 font-mono text-[13px] text-destructive">
          {error}
        </div>
      ) : null}

      {/* Which résumé */}
      <div className="space-y-2">
        <Label htmlFor="churn-project">Résumé</Label>
        {projects === undefined ? (
          <p className="font-mono text-[13px] opacity-70">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="font-mono text-[13px] opacity-75">
            No projects yet.{' '}
            <Link to="/new" className="underline underline-offset-2">
              Parse a résumé first
            </Link>
            .
          </p>
        ) : (
          <select
            id="churn-project"
            value={project?.id ?? ''}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-md border border-foreground bg-[rgba(255,255,255,0.72)] px-3.5 py-3 font-mono text-sm dark:bg-[rgba(16,24,31,0.6)]"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.resume.roles.length} roles
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Harvested queue */}
      <div className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-[28px]">From Harvest</h2>
          <Link
            to="/harvest"
            className="font-mono text-[13px] underline underline-offset-2 hover:opacity-60"
          >
            Go harvest more →
          </Link>
        </div>

        {queue.length === 0 ? (
          <p className="mt-3 font-mono text-[13px] opacity-75">
            Nothing queued. Pick roles in Harvest, or paste a posting below.
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {queue.map((job, i) => (
              <li
                key={`${job.url ?? job.role}-${i}`}
                className={cn('glass-card', activeJob === i && 'ring-2 ring-foreground')}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-serif text-[18px] leading-snug">{job.role}</p>
                    <p className="mt-1 font-mono text-[12px] opacity-75">
                      {job.company}
                      {job.loc ? ` · ${job.loc}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      disabled={busy || !resume}
                      onClick={() => {
                        setActiveJob(i);
                        void tailor({
                          jobDescription: [job.role, job.company, job.note, job.req]
                            .filter(Boolean)
                            .join('\n'),
                          roleTitle: job.role,
                          company: job.company,
                        });
                      }}
                    >
                      {busy && activeJob === i ? 'Tailoring…' : 'Tailor'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeJob(i)}>
                      Remove
                    </Button>
                  </div>
                </div>
                {!job.note && !job.req ? (
                  <p className="mt-3 font-mono text-[12px] text-destructive">
                    The shortlist row has no description text. Paste the posting below for a real
                    tailoring pass.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Paste a posting */}
      <div className="mt-10 space-y-2">
        <Label htmlFor="churn-jd">…or paste a posting</Label>
        <Textarea
          id="churn-jd"
          rows={10}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <div className="pt-2">
          <Button
            disabled={busy || !pasted.trim() || !resume}
            onClick={() => {
              setActiveJob(null);
              void tailor({ jobDescription: pasted });
            }}
          >
            {busy && activeJob === null ? 'Tailoring…' : 'Tailor to this posting'}
          </Button>
        </div>
      </div>

      {/* Result */}
      {result ? (
        <div className="mt-14">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-[32px]">The tailoring</h2>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void navigator.clipboard.writeText(toMarkdown(result, source!))}
              >
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  download(
                    `${slugify(source?.roleTitle ?? 'tailored')}.md`,
                    new Blob([toMarkdown(result, source!)], {
                      type: 'text/markdown;charset=utf-8',
                    }),
                  )
                }
              >
                Markdown
              </Button>
            </div>
          </div>

          <section className="mt-8">
            <p className="eyebrow mb-3 opacity-70">Positioning</p>
            <p className="answer-prose">{result.positioning}</p>
          </section>

          <section className="mt-10">
            <p className="eyebrow mb-4 opacity-70">Rewritten bullets</p>
            <ul className="space-y-5">
              {result.bullets.map((b, i) => (
                <li key={i} className="glass-card">
                  <p className="answer-prose">{b.rewritten}</p>
                  <p className="mt-3 font-mono text-[12px] leading-relaxed opacity-70">
                    was: {b.original}
                  </p>
                  <p className="mt-1 font-mono text-[12px] leading-relaxed opacity-70">
                    {roleName(b.sourceRoleId)}
                    {b.why ? ` · ${b.why}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10">
            <p className="eyebrow mb-4 opacity-70">What you evidence</p>
            <ul className="space-y-3">
              {result.matches.map((m, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-0.5 shrink-0 text-[11px]">
                    {m.strength}
                  </Badge>
                  <div>
                    <p className="font-mono text-[13px]">{m.requirement}</p>
                    <p className="mt-1 font-mono text-[12px] opacity-70">{m.evidence}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {result.gaps.length ? (
            <section className="mt-10">
              <p className="eyebrow mb-4 opacity-70">Gaps — do not paper over these</p>
              <ul className="space-y-3">
                {result.gaps.map((g, i) => (
                  <li key={i} className="border-l-2 border-unverified pl-4">
                    <p className="font-mono text-[13px]">{g.requirement}</p>
                    <p className="mt-1 font-mono text-[12px] opacity-75">{g.note}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-10">
            <p className="eyebrow mb-3 opacity-70">Keywords</p>
            <div className="flex flex-wrap gap-2">
              {result.keywords.present.map((k) => (
                <Badge key={`p-${k}`} variant="outline" className="text-[11px]">
                  {k}
                </Badge>
              ))}
              {result.keywords.absent.map((k) => (
                <Badge
                  key={`a-${k}`}
                  variant="outline"
                  className="border-unverified text-[11px] text-unverified"
                >
                  {k}
                </Badge>
              ))}
            </div>
            <p className="mt-3 font-mono text-[12px] opacity-70">
              Amber means the posting uses the term and your résumé does not. Add it only if it is
              true.
            </p>
          </section>
        </div>
      ) : null}
    </Shell>
  );
}
