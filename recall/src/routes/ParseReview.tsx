import { useState } from 'react';
import { nanoid } from 'nanoid';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Shell, PageTitle } from '@/components/Shell';
import { mutateProject, useProject } from '@/db/hooks';
import { describeGap, detectGaps } from '@/lib/gaps';
import type { Role } from '@/types';

function RoleEditor({
  role,
  index,
  total,
  onChange,
  onMove,
  onDelete,
}: {
  role: Role;
  index: number;
  total: number;
  onChange: (patch: Partial<Role>) => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  return (
    <div className="panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="eyebrow text-muted-foreground">
          Role {index + 1} of {total}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label="Move earlier in the list"
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label="Move later in the list"
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={onDelete}
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`emp-${role.id}`}>Employer</Label>
          <Input
            id={`emp-${role.id}`}
            value={role.employer}
            onChange={(e) => onChange({ employer: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`title-${role.id}`}>Title</Label>
          <Input
            id={`title-${role.id}`}
            value={role.title}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`start-${role.id}`}>Start</Label>
          <Input
            id={`start-${role.id}`}
            placeholder="March 2021"
            value={role.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`end-${role.id}`}>End</Label>
          <Input
            id={`end-${role.id}`}
            placeholder="Leave blank if current"
            value={role.endDate ?? ''}
            onChange={(e) => onChange({ endDate: e.target.value.trim() || null })}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor={`loc-${role.id}`}>Location</Label>
          <Input
            id={`loc-${role.id}`}
            value={role.location ?? ''}
            onChange={(e) => onChange({ location: e.target.value || undefined })}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor={`bul-${role.id}`}>Bullets — one per line</Label>
          <Textarea
            id={`bul-${role.id}`}
            rows={Math.max(3, role.bullets.length + 1)}
            className="text-xs"
            value={role.bullets.join('\n')}
            onChange={(e) =>
              onChange({
                bullets: e.target.value.split('\n').map((b) => b.replace(/^[-•*]\s*/, '')),
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

export default function ParseReview() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { project, loading } = useProject(projectId);
  const [confirmedOnce, setConfirmedOnce] = useState(false);

  if (loading) return <Shell>Loading…</Shell>;
  if (!project) return <Shell>Project not found.</Shell>;

  const roles = project.resume.roles;

  const updateRoles = (next: Role[]) =>
    mutateProject(project.id, (p) => ({
      ...p,
      resume: { ...p.resume, roles: next, gaps: detectGaps(next) },
    }));

  const gaps = project.resume.gaps;

  return (
    <Shell>
      <PageTitle
        title="Check the parse"
        subtitle="Recall read this out of your resume. Fix anything wrong — everything downstream is built from it, and Recall will not invent an employer, title, or date to fill a hole."
      />

      <div className="space-y-4">
        {roles.map((role, i) => (
          <RoleEditor
            key={role.id}
            role={role}
            index={i}
            total={roles.length}
            onChange={(patch) =>
              updateRoles(roles.map((r) => (r.id === role.id ? { ...r, ...patch } : r)))
            }
            onMove={(delta) => {
              const next = [...roles];
              const target = i + delta;
              if (target < 0 || target >= next.length) return;
              [next[i], next[target]] = [next[target], next[i]];
              updateRoles(next);
            }}
            onDelete={() => updateRoles(roles.filter((r) => r.id !== role.id))}
          />
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={() =>
          updateRoles([
            ...roles,
            {
              id: nanoid(),
              employer: '',
              title: '',
              startDate: '',
              endDate: null,
              bullets: [],
            },
          ])
        }
      >
        Add a role
      </Button>

      {gaps.length ? (
        <div className="panel mt-8 px-5 py-4">
          <div className="eyebrow text-muted-foreground">
            Gaps in the dates
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {gaps.map((g, i) => (
              <li key={i}>{describeGap(g, roles)}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Stated so you are not surprised by the question. Recall will draft one neutral
            question about it.
          </p>
        </div>
      ) : null}

      {roles.length === 1 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Answers will draw from a single role.
        </p>
      ) : null}

      <div className="mt-10 flex items-center gap-3 border-t border-border pt-6">
        <Button
          disabled={roles.length === 0}
          onClick={() => {
            setConfirmedOnce(true);
            navigate(`/p/${project.id}/calibrate`);
          }}
        >
          Looks right
        </Button>
        {confirmedOnce ? null : (
          <span className="text-xs text-muted-foreground">
            Nothing generates until you confirm this.
          </span>
        )}
      </div>
    </Shell>
  );
}
