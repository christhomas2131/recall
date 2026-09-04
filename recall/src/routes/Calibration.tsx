import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Shell, PageTitle } from '@/components/Shell';
import { mutateProject, useProject } from '@/db/hooks';
import { cn } from '@/lib/utils';
import type { Project, StyleProfile } from '@/types';

const VERBOSITY: { value: StyleProfile['verbosity']; label: string; hint: string }[] = [
  { value: 'terse', label: 'Terse', hint: '2–3 sentences' },
  { value: 'standard', label: 'Standard', hint: '4–5 sentences' },
  { value: 'expansive', label: 'Expansive', hint: '6–8 sentences' },
];

const DEFAULT_PROFILE: StyleProfile = { verbosity: 'standard' };

function CalibrationForm({ project }: { project: Project }) {
  const navigate = useNavigate();
  const profile = project.styleProfile ?? DEFAULT_PROFILE;

  const update = (patch: Partial<StyleProfile>) =>
    mutateProject(project.id, (p) => ({
      ...p,
      styleProfile: { ...(p.styleProfile ?? DEFAULT_PROFILE), ...patch },
    }));

  return (
    <Shell>
      <PageTitle
        title="How you actually talk"
        subtitle="Three questions. They shape every answer Recall drafts, and you can change them later — the next regeneration picks up the change."
      />

      <div className="space-y-10">
        <div className="space-y-2">
          <Label htmlFor="sample">1. Paste something you wrote</Label>
          <p className="text-xs text-muted-foreground">
            An email, a Slack message, a paragraph from a cover letter. Recall matches its cadence
            rather than inventing a voice for you. Leave it blank for plain and declarative.
          </p>
          <Textarea
            id="sample"
            rows={7}
            value={profile.writingSample ?? ''}
            onChange={(e) => update({ writingSample: e.target.value || undefined })}
          />
        </div>

        <div className="space-y-2">
          <Label>2. How long should the spoken answer be?</Label>
          <div className="flex gap-2">
            {VERBOSITY.map((v) => (
              <button
                key={v.value}
                onClick={() => update({ verbosity: v.value })}
                className={cn(
                  'rounded-panel border px-4 py-3 text-left font-mono text-sm',
                  profile.verbosity === v.value
                    ? 'border-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <div>{v.label}</div>
                <div className="text-xs text-muted-foreground">{v.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="avoid">3. Anything you never want to hear yourself say?</Label>
          <p className="text-xs text-muted-foreground">
            Words, phrases, or claims to keep out. "synergy", "passionate about", any mention of
            headcount.
          </p>
          <Textarea
            id="avoid"
            rows={3}
            value={profile.avoid ?? ''}
            onChange={(e) => update({ avoid: e.target.value || undefined })}
          />
        </div>
      </div>

      <div className="mt-10 flex items-center gap-3 border-t border-border pt-6">
        <Button onClick={() => navigate(`/p/${project.id}/verify`)}>
          {project.questions.length ? 'Back to questions' : 'On to the questions'}
        </Button>
        {project.questions.length ? null : (
          <Button variant="ghost" onClick={() => navigate(`/p/${project.id}/verify`)}>
            Skip this
          </Button>
        )}
      </div>
    </Shell>
  );
}

export default function Calibration() {
  const { projectId } = useParams();
  const { project, loading } = useProject(projectId);

  if (loading) return <Shell>Loading…</Shell>;
  if (!project) return <Shell>Project not found.</Shell>;
  return <CalibrationForm project={project} />;
}
