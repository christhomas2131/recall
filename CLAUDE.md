# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Recall** — a local-first browser app that helps job seekers rebuild their work history into
interview-ready answers. It generates draft answers containing *deliberately invented* specifics and
pushes the user to correct them, on the theory that a specific wrong guess triggers real memory where
a vague question does not. The fabrication is scaffolding, not output.

Three top-level directories:

| Path | Role |
|---|---|
| `recall_spec_v2.md` | The written spec. Source of truth for behaviour. |
| `recall/` | The app. npm + Vite + React 19. **All commands run from here.** |
| `tokensand-clone/` | A separate pnpm monorepo — a friend's site clone, used only as the visual design source. Not part of Recall's build. |

## Commands

All from `recall/`.

```bash
npm run dev            # Vite dev server on :5173
npm run build          # tsc -b && vite build — typechecks, then bundles
npm test               # vitest run, whole suite
npm run lint           # oxlint

npx tsc -b             # typecheck alone, faster than a full build
npx vitest run src/lib/__tests__/merge.test.ts       # one file
npx vitest run -t "restores id, state"               # one test by name
npx oxlint src --ignore-pattern 'src/components/ui/**'   # skip vendored shadcn
```

Tests run in **jsdom globally** (`vitest.config.ts`). `src/test/setup.ts` wires `fake-indexeddb` and
registers RTL `cleanup` manually — vitest globals are off, so auto-cleanup never fires on its own.

## The spec governs

`recall_spec_v2.md` Section 0 is a set of anti-churn directives written to stop exactly the kind of
drift this app invites. Before changing behaviour, check whether the spec already decided it.

Two parts are reproduced verbatim in code and should stay that way:

- **Section 4** — the data model, copied into `src/types/index.ts` unchanged.
- **Section 6** — the four LLM prompts, in `src/llm/prompts.ts`. Do not "improve" prompt wording;
  poor first-pass output is expected and is the user's to iterate on.

The spec predates the current visual design and the Harvest/Churn sections, both of which the user
added later and which override it where they conflict.

## Architecture — the parts that span files

### Answers are `Segment[]`, never marked-up strings

The model returns segment arrays directly. A `TokenSegment` is one invented specific with its own
`id`, `state` (`unverified | confirmed | edited`), `originalText` and optional `userNote`. Never parse
markup out of prose to find tokens.

### `repairSpacing` must never touch a token's `text`

`src/lib/segments.ts`. Models routinely drop the space beside a token span. The repair inserts a
**separate text segment** when the gap follows a token, rather than padding the token.

This is load-bearing, not stylistic: `src/lib/merge.ts` matches token text **verbatim** against locked
facts during regeneration. Pad a token with a trailing space and its confirmed state is silently lost
on the next rewrite — the exact guarantee Section 6.4 exists to provide. Regression-tested in
`segments.test.ts` and `merge.test.ts`.

### One token, two answers, one identity

A specific often appears in both the short and long answer. `linkDuplicateTokens` gives the long-answer
copy the **same id** as its short-answer twin, so:

- `patchToken` updates every copy of an id
- `uniqueTokens(...)` dedupes by id — always use it for counting, or progress and exports double-count
- The same id may legitimately appear twice in one array, so `SegmentText` keys by position, not id

### Persistence: in-memory overlay, debounced write

`src/db/hooks.ts`. Mutations land in a module-level `cache` synchronously and notify
`useSyncExternalStore` subscribers, so the UI never lags a keystroke. The Dexie write is debounced
300ms, and flushes on `pagehide` / `visibilitychange`.

Two non-obvious invariants, both regression-tested in `src/db/__tests__/persistence.test.ts`:

- A flush arriving while another is **in flight** goes onto the `redo` set. Dropping it loses the
  newest correction permanently, because `flushAll` has already cleared the timer.
- `deleteProject` **awaits** the in-flight write before deleting, or that write lands afterwards and
  resurrects the project.

That cache is keyed by project id and outlives `db.delete()`. **Tests must use a unique project id
per test** or state leaks between them — see the counter in `src/test/verify.test.tsx`.

### Every model call goes through `callLLM`

`src/llm/client.ts` is the only place that talks to a provider. It requests JSON, strips code fences,
validates with Zod, retries **once** with the validation error appended, backs off exponentially on
429/5xx across three attempts, and throws a typed `LLMError`. Never render unvalidated content.
`no-key` and `auth` errors route the UI to `/settings`.

### Two generation contracts that must not converge

- `src/llm/prompts.ts` — **invents on purpose.** That is the product.
- `src/llm/churn.ts` — **forbidden to invent.** A résumé goes to an employer. Every rewritten bullet
  must trace to one already on the page, and anything the posting wants that the résumé cannot
  evidence goes in `gaps` rather than getting quietly filled.

Keep the system prompts apart. `churn.test.tsx` asserts the anti-invention instruction actually
reaches the model.

### Harvest bridges to an external Python service

`src/lib/furnace.ts` is a typed client over the **Career Churn Furnace**, a separate Python project at
`~/Desktop/Automata Projects - Mac/Career Churn Furnace`, serving on `:8765`. Harvest does not crawl —
that project owns the scrapers, lane scoring, dedupe and liveness.

Two operational facts:

- Its `app/serve.py` was patched with a `_cors()` helper and `do_OPTIONS` (origin allow-listed to
  localhost). Backup at `app/serve.py.bak-before-recall-cors`. Restart the server after editing it —
  no auto-reload.
- Its `CRAWLER_DATA_DIR` defaults to `Career Churn Furnace/crawler`, which is often empty. The
  populated shortlists live in `Job Crawler 6.2026/`. Start it with that env var to see real rows.

### Design system

The palette and type are lifted from `tokensand-clone/artifacts/tokensand` — pale blue `#d0dce6`,
cream cards, near-black ink, Lora / IBM Plex Mono / Inter, pill buttons. They live as CSS variables in
`src/index.css` **mapped onto shadcn's variable names**, so every vendored primitive in
`src/components/ui/` inherits the theme without being forked.

`BridgeBackdrop` renders the fixed pixel-art scene. Per-section scenes use a layered
`background-image` whose second layer is the bridge, so a missing plate falls back instead of leaving
a hole — dropping `scene-skyline.png` or `scene-houses.png` into `public/images/` activates them with
no code change. `/onboarding` is a horizontally sliding four-panel deck whose backdrop pans with the
panel index.

## Gotchas that have already cost time

- **The repo path contains spaces.** `vite.config.ts` must resolve the `@` alias with
  `fileURLToPath(new URL(...))`. `new URL(...).pathname` URL-encodes the spaces and the bundler fails
  to resolve every aliased import.
- **TypeScript 6** rejects `baseUrl` as deprecated. Path aliases use `paths` alone.
- **Lora ships one identical file for all four weights** (verified by md5), so the serif has no real
  bold. Build hierarchy from size, italics and rules; `font-semibold` on serif only produces faux bold.
- The 30% question-distribution rule in Section 6.2 is **arithmetically unsatisfiable below four
  roles** — three roles and fifteen questions leaves twelve slots. `enforceDistribution` falls back to
  the even split. Both behaviours are pinned in `distribution.test.ts`.
