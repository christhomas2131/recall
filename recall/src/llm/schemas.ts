import { z } from 'zod';

export const TokenCategorySchema = z.enum([
  'duration',
  'count',
  'metric',
  'money',
  'date',
  'outcome',
  'artifact',
  'mechanism',
]);

/* 6.1 — resume parse */
export const ResumeParseSchema = z.object({
  roles: z.array(
    z.object({
      employer: z.string(),
      title: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      bullets: z.array(z.string()),
      location: z.string(),
    }),
  ),
  education: z.array(z.string()),
  skills: z.array(z.string()),
});
export type ResumeParseResponse = z.infer<typeof ResumeParseSchema>;

/* 6.2 — question generation */
export const QuestionGenSchema = z.object({
  questions: z.array(
    z.object({
      text: z.string().min(1),
      category: z.enum(['universal', 'behavioral', 'role-specific', 'situational']),
      sourceRoleId: z.string(),
      competency: z.string(),
    }),
  ),
});
export type QuestionGenResponse = z.infer<typeof QuestionGenSchema>;

/* 6.3 / 6.4 — answer generation. Raw shape before ids are assigned. */
export const RawSegmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }),
  z.object({
    kind: z.literal('token'),
    text: z.string().min(1),
    category: TokenCategorySchema,
  }),
]);
export type RawSegment = z.infer<typeof RawSegmentSchema>;

export const AnswerGenSchema = z.object({
  shortAnswer: z.array(RawSegmentSchema).min(1),
  longAnswer: z.array(RawSegmentSchema).min(1),
  coachingNote: z.string().min(1),
});
export type AnswerGenResponse = z.infer<typeof AnswerGenSchema>;
