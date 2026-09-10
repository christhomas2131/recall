# Recall

Recall is a local-first resume interview-preparation app. It parses a resume, generates targeted questions and draft answers, forces invented details through verification, and exports the finished work. Project data stays in the browser's IndexedDB.

## Start here

You need Git and Node.js 20.19+ or 22.12+.

```sh
git clone <your-recall-repository-url>
cd recall
npm ci
npm run doctor
npm start
```

`npm start` is agent-neutral. It selects an authenticated Codex CLI, an authenticated Claude Code CLI, a configured custom agent adapter, or API mode. Resume work remains inside Recall's UI.

Override automatic selection in `.env.local` with `RECALL_AGENT=codex`, `claude`, `custom`, or `api`. The direct commands remain available as `npm run app:codex`, `npm run app:claude`, `npm run app:custom`, and `npm run app:api`.

Codex mode uses its local app-server session with a read-only sandbox and no tool approvals. Claude mode uses non-interactive JSON output with every built-in and MCP tool removed, no saved session, and one turn. API mode reads OpenAI or Anthropic credentials from `.env.local`. Browser-side provider calls and browser-held API keys do not exist.

See [docs/agent-adapters.md](docs/agent-adapters.md) to connect another coding agent through the small local stdio contract.

## Harvest

Harvest is optional. It runs the pinned Career Churn Furnace engine as a managed local process:

```sh
npm run setup:harvest
npm run harvest:status
npm run harvest:onboard
```

The installer pins published CCF commit `492fc715d44ef7e8ee6e9c1cbe10f0b3f80398a2` and requires Git, Python 3.11+, and `uv`. `npm run doctor` reports whether the engine is installed, whether onboarding is ready, and every missing required onboarding section. Recall refuses to start a crawl until required candidate and search facts are complete.

## Development and checks

`npm run dev` starts the UI only. AI work intentionally fails until a local companion is running.

```sh
npm run check
npm run test:e2e
npm audit
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [docs/release-checklist.md](docs/release-checklist.md) before publishing.

## Security boundary

Every companion binds only to `127.0.0.1`, uses a random launch token, enforces the expected browser origin and JSON content type, and is reached through Vite's local proxy. Do not expose its ports to a LAN, tunnel, container ingress, or public host.

Resume contents are sensitive. Model inputs leave the browser through the selected local companion and reach that runtime's provider. Review the applicable provider's data policy before using real candidate material.

## License

MIT, see [LICENSE](LICENSE).
