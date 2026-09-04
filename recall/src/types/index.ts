export type Mode = 'standard' | 'fast';

export type TokenState = 'unverified' | 'confirmed' | 'edited';

export type TokenCategory =
  | 'duration'      // "seven weeks", "four months"
  | 'count'         // "fifty-three organizations", "eleven of sixty-one"
  | 'metric'        // "completion rate", "median time"
  | 'money'         // "$20M portfolio"
  | 'date'          // "month four", "in 2019"
  | 'outcome'       // "all six closed out fully expended"
  | 'artifact'      // "a shared intake form", "the burn-rate tracker"
  | 'mechanism';    // "I asked for those three things in the same message"

export interface TextSegment {
  kind: 'text';
  text: string;
}

export interface TokenSegment {
  kind: 'token';
  id: string;              // nanoid, stable across regeneration
  text: string;            // current display text
  originalText: string;    // first generated value, never mutated
  state: TokenState;
  category: TokenCategory;
  userNote?: string;       // from "what actually happened?"
}

export type Segment = TextSegment | TokenSegment;

export interface Role {
  id: string;
  employer: string;
  title: string;
  startDate: string;       // "2021-03" or "2021", free-form, user-correctable
  endDate: string | null;  // null = current
  bullets: string[];
  location?: string;
}

export interface Gap {
  afterRoleId: string;
  beforeRoleId: string | null;
  months: number;
}

export interface ParsedResume {
  rawText: string;
  roles: Role[];
  education: string[];
  skills: string[];
  gaps: Gap[];
}

export interface StyleProfile {
  writingSample?: string;
  verbosity: 'terse' | 'standard' | 'expansive';  // 2-3 / 4-5 / 6-8 sentences
  avoid?: string;
}

export type QuestionCategory =
  | 'universal'
  | 'behavioral'
  | 'role-specific'
  | 'situational';

export interface AnswerVersion {
  id: string;
  createdAt: number;
  shortAnswer: Segment[];
  longAnswer: Segment[];
  coachingNote: string;
  trigger: 'initial' | 'regeneration' | 'role-reassignment';
}

export interface DrillAttempt {
  at: number;
  elapsedSeconds: number;
  rating: 'nailed' | 'rough' | 'redo';
}

export interface Question {
  id: string;
  text: string;
  category: QuestionCategory;
  sourceRoleId: string;
  competency?: string;          // from JD, if behavioral
  shortAnswer: Segment[];
  longAnswer: Segment[];
  coachingNote: string;         // exactly two sentences
  versions: AnswerVersion[];
  drillHistory: DrillAttempt[];
  generatedAt: number | null;   // null = not yet generated
}

export interface Project {
  id: string;
  name: string;
  mode: Mode;
  createdAt: number;
  updatedAt: number;
  resume: ParsedResume;
  jobDescription?: string;
  styleProfile?: StyleProfile;
  questions: Question[];
}

export interface Settings {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model: string;
  hasAcknowledged: boolean;
}
