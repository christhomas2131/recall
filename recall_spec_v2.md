# Claude Code Spec — "Recall"

**Read this entire document before writing code.** It is written to be unambiguous. Where a decision could go two ways, the decision has already been made below. Do not re-litigate it, do not ask, do not explore alternatives. Build what is specified.

---

# 0. ANTI-CHURN DIRECTIVES

Read these first. They exist because this kind of app invites endless iteration.

1. **Do not tune LLM prompts.** Section 6 contains the exact prompts. Use them verbatim. If output quality seems poor, that is expected on first pass and is the user's problem to iterate on, not yours.
2. **Do not build a design system.** Use shadcn/ui defaults with the Tailwind config in Section 8. Do not create custom components where a shadcn primitive exists.
3. **Do not attempt perfect resume parsing.** Section 5 defines a deliberately shallow parse with a mandatory human-correction step. Anything beyond that is out of scope.
4. **Do not add features not in this document.** No auth, no sharing, no collaboration, no analytics, no onboarding tour beyond the single required screen, no dark mode toggle (respect system preference only), no mobile-optimized layout beyond the print stylesheet.
5. **Build in the milestone order in Section 10.** Ship each milestone working before starting the next. Do not scaffold everything and then fill in.
6. **When something is genuinely ambiguous**, pick the simpler option, add a `// SPEC-GAP:` comment explaining the choice, and keep going. Do not stop to ask.
7. **Stop conditions per milestone are in Section 10.** When acceptance criteria pass, move on. Do not polish.

---

# 1. WHAT THIS IS

A local-first web app that helps job seekers reconstruct their own work history into interview-ready answers.

**The mechanism:** people can't recall specifics of their own accomplishments under pressure. A generic prompt produces a generic answer. A *specific wrong guess* triggers real recall — tell someone "you cut the approval chain from seven weeks to four" and they correct you: "no, six weeks, and it was the finance handoff." The correction is the real memory.

Recall generates deliberately specific draft answers containing invented details and pushes the user to correct them. **The fabrication is scaffolding, not output.**

## Explicitly out of scope

Accounts, authentication, cloud sync, sharing, team features, resume writing or editing, cover letters, job search or application tracking, mock interview video, AI voice interviewer, analytics, payment, mobile app.

---

# 2. TWO MODES

Selected at project creation, switchable anytime, persisted per project.

## Standard Mode (default)

| Behavior | Setting |
|---|---|
| Export / copy-all / print | **Blocked** while any UNVERIFIED token remains |
| Blocking modal | Lists unresolved tokens with jump links |
| Drill mode | Locked per-question until that question is fully verified |
| Progress indicator | Persistent in header |
| Generation | Questions first, answers generated on demand per question |

## Fast Mode

| Behavior | Setting |
|---|---|
| Export / copy-all / print | Allowed, behind one confirm dialog |
| Confirm dialog text | "N details in this document are AI-generated and unverified. Confirm these before using them." |
| Export header | Block listing every unverified item |
| Drill mode | Available immediately |
| Progress indicator | Collapsed by default |
| Generation | All answers generated in one batch on entry |

## Invariant across both modes

**Fabricated content is always visually marked, everywhere it appears.** No setting disables this. No toggle exists. Do not build one.

---

# 3. SAFETY CONSTRAINTS

Enforced in code where possible, in prompt where not.

- Every AI-generated specific is a discrete token with independent state.
- **Never fabricate:** credentials, degrees, certifications, employment dates, job titles, employers, or any conduct/quote/failure attributed to a named third party. These come from the resume only. If missing, leave `[?]` for the user to fill.
- **Fabrication is limited to** the user's own scope, actions, methods, counts, durations, sequences, and outcomes.
- Onboarding screen (one screen, required acknowledgment) explains the mechanism before first project creation. Store `hasAcknowledged: boolean` in localStorage.
- All exports carry a verification-status footer.

---

# 4. DATA MODEL

Put this in `src/types/index.ts` exactly as written.

```ts
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
```

**Critical:** answers are stored as `Segment[]`, never as strings with inline markup. The LLM returns segment arrays directly (see Section 6). Never parse markup out of prose.

---

# 5. RESUME PARSING

Deliberately shallow. The human correction step does the real work.

**Extraction:**
- PDF: `pdfjs-dist`, concatenate text content per page
- DOCX: `mammoth`, `extractRawText`
- Paste: as-is

**Structuring:** send raw text to the LLM with the prompt in 6.1. Do not write regex-based date parsers or heading detectors. Do not attempt layout reconstruction.

**Mandatory correction screen.** After parse, show every extracted role in an editable form. User can add, delete, reorder, and edit any field. Nothing proceeds until they click "Looks right."

**Gap detection** runs after correction, in code, on the corrected dates. Gap = more than 3 months between one role's end and the next role's start. Present as neutral fact, not a problem.

**Failure handling:** if extraction returns fewer than 200 characters, show "We couldn't read that file. Try pasting the text instead," with the paste box focused. Do not retry, do not attempt OCR.

---

# 6. LLM PROMPTS

Use these verbatim. All requests demand JSON, validated with Zod, one retry on schema failure, then a visible error.

## 6.1 Resume parse

**System:**
```
You extract structured data from resumes. You return only valid JSON
matching the requested schema. You do not infer, embellish, or add
information that is not present in the text. If a field is absent,
return an empty string or empty array. Never invent employers, titles,
dates, or credentials.
```

**User:**
```
Extract the structured content of this resume.

Return JSON:
{
  "roles": [
    {
      "employer": string,
      "title": string,
      "startDate": string,   // as written, e.g. "March 2021" or "2021"
      "endDate": string,     // as written, or "" if current
      "bullets": string[],   // verbatim from the resume, do not rewrite
      "location": string     // "" if absent
    }
  ],
  "education": string[],     // one line each, verbatim
  "skills": string[]         // individual skills, split from any list
}

Order roles most recent first. Include every role, even brief ones.

RESUME:
<<<
{rawText}
>>>
```

## 6.2 Question generation

**System:**
```
You are an experienced technical recruiter. You generate the questions
that would actually be asked in a screening or hiring-manager interview
for a specific role, given a specific candidate's background. You return
only valid JSON.
```

**User:**
```
Generate {n} interview questions for this candidate and role.

CANDIDATE ROLES:
{roles as: id | employer | title | dates | bullets}

JOB DESCRIPTION:
{jobDescription or "None provided. Generate questions appropriate to the
candidate's most recent role and seniority."}

EMPLOYMENT GAPS DETECTED:
{gaps or "None"}

Requirements:
- Include these universal questions, phrased naturally: tell me about
  yourself; a mistake you made; a weakness; handling competing priorities;
  a project you're proud of; why this company; what you're looking for next.
- Add behavioral questions mapped to competencies stated in the job
  description. Quote the competency in the "competency" field.
- Add role-specific probes about tools, domain, or stated concerns in the
  job description. If the description says something like "resolves
  blockers without becoming one," generate a question targeting that.
- If a gap or a seniority mismatch exists, add one situational question.
  Phrase it as a recruiter would, neutrally, not as an accusation.
- For each question, assign the ONE role from the candidate's history that
  best supports an answer. Use the role id.
- Distribute across the candidate's history. No single role should be
  assigned more than 30 percent of the questions.

Return JSON:
{
  "questions": [
    {
      "text": string,
      "category": "universal" | "behavioral" | "role-specific" | "situational",
      "sourceRoleId": string,
      "competency": string   // "" if not applicable
    }
  ]
}
```

**Post-processing in code:** verify the 30% distribution rule. If violated, reassign the excess questions to the least-used eligible roles, preferring roles whose bullets share keywords with the question text. Do not re-call the LLM.

## 6.3 Answer generation

**System:**
```
You write interview answers in the candidate's own voice, then mark every
invented detail so the candidate can correct it.

Your answers must contain specific, concrete details: durations, counts,
sequences, the name of the thing that broke, the number that changed. You
do not have access to the candidate's real specifics, so you invent
plausible ones. This is intentional. A specific wrong guess triggers the
candidate's real memory; a vague answer does not.

Rules for invention:
- Invent at a scale plausible for the role's seniority, sector, and era.
- Prefer inventing durations, counts, sequences, and mechanisms over
  precise dollar figures.
- Never invent credentials, degrees, certifications, employment dates,
  job titles, or employers.
- Never invent conduct, quotes, or failures attributed to a named third
  party. The candidate's own actions and outcomes only.

You return only valid JSON.
```

**User:**
```
Write an answer to this interview question.

QUESTION: {question.text}

DRAW FROM THIS ROLE:
Employer: {role.employer}
Title: {role.title}
Dates: {role.startDate} to {role.endDate}
Bullets:
{role.bullets}

TARGET ROLE CONTEXT:
{jobDescription excerpt or "None provided"}

VOICE:
{styleProfile.writingSample ? "Match the cadence of this writing sample:\n" + writingSample : "Plain, declarative, conversational."}
Length: {verbosity → "2-3 sentences" | "4-5 sentences" | "6-8 sentences"}
{styleProfile.avoid ? "Never include: " + avoid : ""}

Produce three things.

1. SHORT ANSWER — the version the candidate says out loud. Target the
   length above. Plain declarative sentences. Must end on a result or
   outcome, not on process. Must contain 2 to 5 invented specifics.

2. LONG ANSWER — 5 to 8 sentences. The material underneath. Not a script.

3. COACHING NOTE — exactly two sentences. The first names the specific
   mechanism that makes this answer land (a particular detail, a
   structural choice). The second is a delivery instruction or a warning.
   Write like an interview coach who just heard the candidate attempt it
   once. Do not write generic advice. Never write "be confident," "use
   the STAR method," or "practice this."

   Good examples of the register:
   "The 'two calls and repeat your story' detail is what makes this a
   diagnosis rather than a vague process story. This is where people
   trail off before the result, so say the last clause deliberately."

   "Both halves in one breath, no pause before the admission. Volunteering
   it reads as confidence; having it dug out of you reads as a gap."

Return the answers as segment arrays. Split the text so that every
invented specific is its own token segment and everything else is text.
Token text should be the minimum span that carries the invented claim —
"seven weeks to under four", not the whole sentence.

Return JSON:
{
  "shortAnswer": [
    {"kind":"text","text":"..."} |
    {"kind":"token","text":"...","category":"duration|count|metric|money|date|outcome|artifact|mechanism"}
  ],
  "longAnswer": [ same shape ],
  "coachingNote": string
}
```

**Post-processing in code:** assign a nanoid to each token, set `originalText = text`, set `state = 'unverified'`. Concatenating all segment `text` values must produce readable prose — validate this and retry once if spacing is broken.

## 6.4 Regeneration after correction

**System:** same as 6.3, plus:
```
You are revising an answer the candidate has partially corrected. Some
facts are now confirmed by the candidate and must be preserved exactly.
Do not alter, rephrase, or drop a locked fact.
```

**User:**
```
Revise this answer.

QUESTION: {question.text}

ROLE MATERIAL:
{same as 6.3}

CURRENT ANSWER:
{shortAnswer segments rendered as plain text}

LOCKED FACTS — reproduce each of these verbatim in the revised answer:
{for each confirmed/edited token: "- " + text}

THE CANDIDATE SAYS:
{userNote}

Rewrite the short answer and long answer incorporating what the candidate
said. Preserve every locked fact word for word. Any remaining specifics
you invent are new and must be returned as token segments. Update the
coaching note only if the mechanism changed.

Return the same JSON shape as before.
```

**Merge algorithm in code, after regeneration:**

1. For each returned token segment, check whether its `text` exactly matches a locked fact.
2. If yes, restore that token's original `id`, `state`, `originalText`, and `userNote`.
3. If no, treat as new: fresh nanoid, `state = 'unverified'`, `originalText = text`.
4. If any locked fact does not appear in the output, retry once with the missing facts restated. On second failure, show the user a diff and let them accept or discard.
5. Push the previous answer into `versions[]` before committing.
6. Show a diff view (old vs new, tokens highlighted) with Accept / Discard before writing to the store.

---

# 7. VERIFICATION PASS

The primary screen. Everything else is packaging.

**Layout.** Single column, max-width 720px. Question text as a heading. Short answer below in larger type. Coaching note in a distinct block beneath. Long answer in a collapsed disclosure. Source role shown as a small label with a "change" affordance.

**Token rendering.**

| State | Treatment |
|---|---|
| unverified | amber dotted underline + small amber dot before the span |
| confirmed | no marking |
| edited | subtle green left border on the span |

Never color-only. The dot and border are the accessible affordances.

**Token popover** (click or Enter on focus):
- Current text, editable inline
- Buttons: **Confirm** / **Save edit** / **Delete**
- Textarea: "What actually happened?"
- If the textarea has content on save, offer **Regenerate this answer**

**Delete** removes the token and rewrites the surrounding sentence via a single LLM call using the 6.4 prompt with `userNote = "Remove the claim about {text} entirely. Do not replace it with a hedge or a vaguer version."`

**Keyboard.** `j`/`k` next/previous token, `Enter` open popover, `c` confirm, `e` edit, `d` delete, `Esc` close, `n`/`p` next/previous question. Show a `?` shortcut sheet.

**Progress.** Header shows `confirmed + edited / total tokens` across the project. Clicking it opens a list of questions with remaining counts.

---

# 8. TECHNICAL

**Stack.** React 18, TypeScript, Vite, Tailwind, shadcn/ui, Dexie (IndexedDB), Zod, nanoid, pdfjs-dist, mammoth, docx (export), react-router.

**Setup:**
```bash
npm create vite@latest recall -- --template react-ts
cd recall
npm i dexie dexie-react-hooks zod nanoid pdfjs-dist mammoth docx react-router-dom
npm i -D tailwindcss postcss autoprefixer @types/node
npx tailwindcss init -p
npx shadcn@latest init
npx shadcn@latest add button dialog popover textarea input card badge progress collapsible tabs toast separator
```

**Structure:**
```
src/
  types/index.ts
  db/
    schema.ts          // Dexie tables: projects, settings
    hooks.ts           // useProject, useQuestions, useSettings
  llm/
    client.ts          // provider-agnostic call + Zod validation + retry
    prompts.ts         // the four prompts from Section 6
    schemas.ts         // Zod schemas for each response
  lib/
    parse.ts           // pdf/docx extraction
    gaps.ts            // gap detection
    distribution.ts    // 30% rule enforcement + reassignment
    merge.ts           // regeneration merge algorithm
    segments.ts        // segments <-> plain text helpers
  components/
    TokenSpan.tsx
    TokenPopover.tsx
    AnswerCard.tsx
    CoachingNote.tsx
    ProgressHeader.tsx
    DiffView.tsx
  routes/
    Onboarding.tsx
    Projects.tsx
    Intake.tsx
    ParseReview.tsx
    Calibration.tsx
    Verify.tsx         // primary screen
    Drill.tsx
    Export.tsx
    Settings.tsx
  App.tsx
```

**LLM client.** Single `callLLM<T>(prompt, schema, opts)` that handles both providers, requests JSON, strips markdown fences, validates with Zod, retries once with the validation error appended, and throws a typed error the UI can display. Never render unvalidated content.

**API keys.** localStorage only. Transmitted only to the provider. Settings screen states this plainly. Anthropic calls need `anthropic-dangerous-direct-browser-access: true`.

**Persistence.** Debounced write to Dexie on every mutation, 300ms. Never lose a correction.

---

# 9. EDGE CASES

Handle each explicitly.

| Case | Behavior |
|---|---|
| Resume has one role | Skip the 30% rule. Warn once: "Answers will draw from a single role." |
| Resume has no bullets, titles only | Generate from title and dates. Coaching notes flag thin material. |
| No job description provided | Skip role-specific and situational questions. Generate 10 instead of 15. |
| LLM returns zero tokens in an answer | Retry once with "You must include 2 to 5 invented specifics." Then accept and flag the answer as "no details to verify." |
| LLM returns a token spanning a whole sentence | Accept. Do not attempt to split. |
| User deletes every token in an answer | Allowed. Answer becomes fully verified by definition. |
| Regeneration drops a locked fact | Retry once, then show diff and let user decide. |
| User switches Standard → Fast mid-project | Immediate, no warning. |
| User switches Fast → Standard with unverified tokens | Allowed. Export becomes blocked. Toast explains why. |
| User reassigns source role | Regenerate that answer from scratch. Warn that corrections will be lost. Push old version to history. |
| API key missing or invalid | Block generation, route to Settings with an inline error. Never fail silently. |
| Rate limit / 429 | Exponential backoff, three attempts, then a clear error with a retry button. |
| Very long resume (>15 roles) | Use the 8 most recent for question generation. Note this in the UI. |
| Export with zero questions generated | Disable export, explain. |

---

# 10. MILESTONES

Ship each working before starting the next. Acceptance criteria are the stop condition.

**M1 — Intake and parse**
Onboarding screen, project creation, file upload and paste, extraction, LLM parse, editable parse review, gap detection, persistence.
*Accept when:* a PDF resume becomes a corrected role list that survives a page reload.

**M2 — Questions**
Question generation, 30% distribution enforcement in code, question list UI, source role display and reassignment.
*Accept when:* 15 questions generate from a resume plus JD and no role exceeds 30% of assignments.

**M3 — Answers and tokens**
Answer generation, segment storage, token rendering with all three states, answer card layout, coaching note block.
*Accept when:* an answer renders with amber-marked tokens and the concatenated text reads as clean prose.

**M4 — Verification**
Token popover, confirm/edit/delete, "what actually happened," regeneration, merge algorithm, diff view, version history, keyboard nav, progress.
*Accept when:* correcting one token regenerates the answer, preserves confirmed tokens verbatim, and flags newly invented ones.

**M5 — Modes and export gate**
Mode toggle, Standard blocking modal with jump links, Fast confirm dialog, unverified list in Fast exports.
*Accept when:* Standard blocks export with one unverified token and Fast permits it with a warning.

**M6 — Export**
Markdown, DOCX, print stylesheet. Corrections appendix listing every edited token beside its original. Verification footer.
*Accept when:* a DOCX opens in Word with correct hierarchy and the appendix is present.

**M7 — Drill mode**
One question full screen, hidden answer, elapsed timer with 60s and 90s thresholds, self-rating, spaced queue.
*Accept when:* rating "redo" resurfaces that question sooner than one rated "nailed."

**M8 — Calibration**
Three-question style profile, applied to generation.
*Accept when:* switching terse to expansive visibly changes answer length on regeneration.

---

# 11. DESIGN

Text-forward and restrained. This is a reading and editing tool.

- Serif for answer text (Charter, Georgia, or similar system stack), sans for UI chrome
- Answer text at 18–19px, line-height 1.65
- Max content width 720px
- Neutral grays, one amber accent for unverified, one green for edited. No other color.
- The amber underline should read as a copy editor's mark, not an error state. Unverified is a normal mid-process condition, not a mistake.
- Coaching note in a bordered block with a small label, visually distinct from the answer but not louder than it
- **No gamification.** Progress toward verification is worth showing. Streaks, badges, confetti, and encouragement copy are not. Do not add them.
- Respect `prefers-color-scheme`. No manual toggle.

---

# 12. TEST FIXTURE

Include `src/fixtures/sample.ts` with a realistic three-role resume and a matching JD so the app can be exercised without an API key in a dev-only "load sample" affordance on the projects screen. Roles should span different sectors so the distribution rule is visibly exercised.

---

# 13. THE THING THAT MATTERS MOST

The coaching notes are what separate this from a generic answer generator. Two sentences, specific to that answer, naming the actual mechanism.

If they come out as "be confident" or "structure your answer clearly," the whole tool reads as filler and users will abandon it after one session. The prompt in 6.3 contains two examples of the correct register. Do not shorten or paraphrase those examples when implementing — they are calibration, not decoration.
