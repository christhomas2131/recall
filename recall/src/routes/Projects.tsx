import { nanoid } from 'nanoid';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shell, PageTitle } from '@/components/Shell';
import { createProject, deleteProject, useProjects } from '@/db/hooks';
import { detectGaps } from '@/lib/gaps';
import { uniqueTokens } from '@/lib/segments';
import { SAMPLE_JOB_DESCRIPTION, SAMPLE_RESUME_TEXT } from '@/fixtures/sample';
import type { Project, Role } from '@/types';

function sampleRoles(): Role[] {
  return [
    {
      id: nanoid(),
      employer: 'Northline Health Collaborative',
      title: 'Program Operations Lead',
      startDate: 'March 2021',
      endDate: null,
      location: 'Chicago, IL',
      bullets: [
        'Ran the grants operations function for a $20M portfolio across 53 partner organizations',
        'Rebuilt the subaward approval workflow after a compliance finding in the FY22 audit',
        'Built and maintained the burn-rate tracker used by program directors in monthly review',
        'Managed two program coordinators and a rotating cohort of graduate interns',
        'Served as primary liaison to the finance team during the ERP migration',
      ],
    },
    {
      id: nanoid(),
      employer: 'Broadfield Systems',
      title: 'Senior Analyst, Client Delivery',
      startDate: 'June 2018',
      endDate: 'November 2020',
      location: 'Austin, TX',
      bullets: [
        'Owned implementation delivery for six enterprise SaaS customers in logistics and retail',
        'Reduced average onboarding time from eleven weeks to under six across the portfolio',
        'Wrote the internal runbook for data migration escalations, adopted by three delivery pods',
        'Ran weekly steering calls with customer-side project sponsors',
        'Partnered with product on the intake API redesign after repeated field escalations',
      ],
    },
    {
      id: nanoid(),
      employer: 'Lakeshore Housing Initiative',
      title: 'Field Coordinator',
      startDate: 'August 2016',
      endDate: 'February 2018',
      location: 'Milwaukee, WI',
      bullets: [
        'Coordinated intake and case assignment for a scattered-site housing program',
        'Redesigned the paper intake form into a shared digital form used by four site teams',
        'Tracked outcomes for roughly 200 households per year and reported to the state funder',
        'Trained new caseworkers on documentation standards',
      ],
    },
  ];
}

function buildSampleProject(): Project {
  const roles = sampleRoles();
  const now = Date.now();
  return {
    id: nanoid(),
    name: 'Sample — Vantage Grid, Senior Manager Business Ops',
    mode: 'standard',
    createdAt: now,
    updatedAt: now,
    resume: {
      rawText: SAMPLE_RESUME_TEXT,
      roles,
      education: [
        'M.P.A., Public Administration — University of Wisconsin–Madison, 2016',
        'B.A., Sociology — Loyola University Chicago, 2013',
      ],
      skills: [
        'Grants management', 'Salesforce', 'SQL', 'Excel modeling', 'Tableau',
        'stakeholder facilitation', 'process documentation', 'federal compliance (2 CFR 200)',
        'Jira', 'cross-functional delivery',
      ],
      gaps: detectGaps(roles),
    },
    jobDescription: SAMPLE_JOB_DESCRIPTION,
    questions: [],
  };
}

function projectStatus(project: Project): string {
  if (!project.questions.length) return 'No questions yet';
  const generated = project.questions.filter((q) => q.generatedAt !== null);
  if (!generated.length) return `${project.questions.length} questions, no answers yet`;
  const tokens = generated.flatMap((q) => uniqueTokens(q.shortAnswer, q.longAnswer));
  const done = tokens.filter((t) => t.state !== 'unverified').length;
  return `${done} of ${tokens.length} details verified`;
}

export default function Projects() {
  const projects = useProjects();
  const navigate = useNavigate();

  return (
    <Shell
      right={
        <Button size="sm" onClick={() => navigate('/new')}>
          New project
        </Button>
      }
    >
      <PageTitle
        title="Recall"
        subtitle="Turn your own history into answers you can say out loud. One project per role you are interviewing for."
      />

      {projects === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="panel px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Start with a resume and, if you have one, a job description.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Button onClick={() => navigate('/new')}>New project</Button>
            {import.meta.env.DEV ? (
              <Button
                variant="outline"
                onClick={async () => {
                  const p = buildSampleProject();
                  await createProject(p);
                  navigate(`/p/${p.id}/review`);
                }}
              >
                Load sample
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <ul className="divide-y border-y [&>li]:hairline divide-foreground/20 border-foreground/20">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 py-4">
              <Link to={`/p/${p.id}/review`} className="min-w-0 flex-1 group">
                <div className="truncate font-serif text-[20px] leading-snug group-hover:underline">
                  {p.name}
                </div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  {p.mode === 'fast' ? 'Fast mode' : 'Standard mode'} · {projectStatus(p)} ·{' '}
                  {new Date(p.updatedAt).toLocaleDateString()}
                </div>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  if (confirm(`Delete "${p.name}"? This cannot be undone.`)) {
                    void deleteProject(p.id);
                  }
                }}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      {import.meta.env.DEV && projects && projects.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-6 text-muted-foreground"
          onClick={async () => {
            const p = buildSampleProject();
            await createProject(p);
            navigate(`/p/${p.id}/review`);
          }}
        >
          Load sample
        </Button>
      ) : null}
    </Shell>
  );
}
