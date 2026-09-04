import { z } from 'zod';
import type { ParsedResume, Role } from '@/types';
import type { Prompt } from './prompts';

/*
 * Churn is the inverse of Section 6.3. The answer generator invents specifics
 * on purpose, because a wrong guess triggers real memory. A resume goes to an
 * employer, so this side invents nothing: it selects, reorders and reframes
 * material that is already on the page, and reports what is missing instead
 * of papering over it.
 */

export const TAILOR_SYSTEM = `You tailor a résumé to a specific job description.

You never invent experience. Every bullet you produce must be traceable to a
bullet the candidate already wrote. You may reorder, reframe, compress, and
change emphasis or vocabulary to match the posting's language. You may not add
a metric, a tool, a scope, a duration, an employer, a title, a date or a
credential that is not already present in the source material.

Where the posting asks for something the résumé does not evidence, you say so
in the gaps list. You do not quietly fill it.

You return only valid JSON.`;

export const TailorSchema = z.object({
  positioning: z.string().min(1),
  matches: z.array(
    z.object({
      requirement: z.string().min(1),
      evidence: z.string().min(1),
      sourceRoleId: z.string(),
      strength: z.enum(['strong', 'partial']),
    }),
  ),
  gaps: z.array(
    z.object({
      requirement: z.string().min(1),
      note: z.string(),
    }),
  ),
  bullets: z.array(
    z.object({
      sourceRoleId: z.string(),
      original: z.string().min(1),
      rewritten: z.string().min(1),
      why: z.string(),
    }),
  ),
  keywords: z.object({
    present: z.array(z.string()),
    absent: z.array(z.string()),
  }),
});

export type TailorResult = z.infer<typeof TailorSchema>;

function roleBlock(role: Role): string {
  const bullets = role.bullets.filter((b) => b.trim());
  return `id: ${role.id}
${role.title} — ${role.employer} (${role.startDate} to ${role.endDate ?? 'present'})
${bullets.length ? bullets.map((b) => `- ${b}`).join('\n') : '- (no bullets listed)'}`;
}

export function tailorPrompt(args: {
  resume: ParsedResume;
  jobDescription: string;
  roleTitle?: string;
  company?: string;
}): Prompt {
  const { resume, jobDescription, roleTitle, company } = args;
  const target = [roleTitle, company].filter(Boolean).join(' at ');

  return {
    system: TAILOR_SYSTEM,
    user: `Tailor this résumé to the posting below.

${target ? `TARGET: ${target}\n` : ''}JOB DESCRIPTION:
<<<
${jobDescription.trim().slice(0, 6000)}
>>>

CANDIDATE RÉSUMÉ:
${resume.roles.map(roleBlock).join('\n\n')}

SKILLS AS LISTED: ${resume.skills.filter(Boolean).join(', ') || '(none listed)'}
EDUCATION AS LISTED: ${resume.education.filter(Boolean).join(' | ') || '(none listed)'}

Produce:

1. POSITIONING — 2 to 3 sentences the candidate could put at the top of the
   résumé for this posting. Drawn only from what is above.

2. MATCHES — each posting requirement the résumé genuinely evidences. Quote the
   requirement from the posting. For evidence, quote or closely paraphrase the
   candidate's own bullet, and give the role id it came from. Mark "strong"
   when the bullet directly demonstrates it, "partial" when it is adjacent.

3. GAPS — requirements in the posting with no support in the résumé. State the
   requirement and one sentence on what is missing. Do not suggest inventing
   anything. An empty gaps list is only correct if the résumé really covers
   everything.

4. BULLETS — the rewritten bullets, strongest first. For each: the role id, the
   original bullet verbatim, the rewritten version, and one short line on what
   the rewrite changed and why it fits this posting. Every fact in the
   rewritten bullet must appear in the original.

5. KEYWORDS — terms the posting leans on, split into those already present in
   the résumé and those absent.

Return JSON:
{
  "positioning": string,
  "matches": [{"requirement": string, "evidence": string, "sourceRoleId": string, "strength": "strong" | "partial"}],
  "gaps": [{"requirement": string, "note": string}],
  "bullets": [{"sourceRoleId": string, "original": string, "rewritten": string, "why": string}],
  "keywords": {"present": string[], "absent": string[]}
}`,
  };
}
