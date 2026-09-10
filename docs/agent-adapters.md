# Local agent adapters

`npm start` is the agent-neutral entry point. It detects authenticated Codex, authenticated Claude Code, a custom adapter, or API mode, in that order. Set `RECALL_AGENT` to `codex`, `claude`, `custom`, or `api` in `.env.local` to override selection.

Codex uses its app-server protocol. Claude Code uses print mode with JSON output, no tools, no saved session, one turn, and plan permissions. Both keep resume work in Recall's UI while using the local account's authenticated CLI.

## Custom adapter contract

Any other coding agent can be connected through a trusted local wrapper:

```dotenv
RECALL_AGENT=custom
RECALL_AGENT_COMMAND=/absolute/path/to/recall-agent-wrapper
RECALL_AGENT_ARGS_JSON=[]
```

The executable receives one UTF-8 JSON object on standard input:

```json
{"system":"instructions","user":"untrusted resume data","maxTokens":4096}
```

It must write exactly one JSON object to standard output and exit zero:

```json
{"text":"{\"result\":\"the model's JSON response\"}"}
```

The wrapper is trusted executable code. It must disable agent tools, prevent filesystem and network actions beyond the model request, avoid persisting resume prompts, preserve stdout for the response contract, and send diagnostics to stderr. Never configure a wrapper supplied by an untrusted repository.
