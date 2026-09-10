import type { z } from 'zod';
import type { Prompt } from './prompts';

export type LLMErrorKind =
  | 'no-key'
  | 'auth'
  | 'rate-limit'
  | 'network'
  | 'schema'
  | 'http';

export class LLMError extends Error {
  kind: LLMErrorKind;
  detail?: string;

  constructor(kind: LLMErrorKind, message: string, detail?: string) {
    super(message);
    this.name = 'LLMError';
    this.kind = kind;
    this.detail = detail;
  }
}

interface CallOpts {
  maxTokens?: number;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const localTransport = import.meta.env.VITE_LLM_TRANSPORT;
export const usesLocalCompanion = ['api', 'codex', 'claude', 'custom', 'test'].includes(localTransport);

/** Strip ```json fences and any prose either side of the outermost JSON object. */
function extractJson(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) text = text.slice(start, end + 1);
  return text;
}

async function requestOnce(prompt: Prompt, opts: CallOpts): Promise<string> {
  if (!usesLocalCompanion) {
    throw new LLMError(
      'no-key',
      'AI is not running. Start Recall with npm start.',
    );
  }

  const maxTokens = opts.maxTokens ?? 4096;
  const companionName = localTransport === 'api'
    ? 'API'
    : localTransport === 'claude'
      ? 'Claude Code'
      : localTransport === 'custom'
        ? 'custom agent'
        : 'Codex';
  let res: Response;
  try {
    res = await fetch('/api/recall-agent/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ system: prompt.system, user: prompt.user, maxTokens }),
      signal: opts.signal,
    });
  } catch (e) {
    throw new LLMError(
      'network',
      `Could not reach the local ${companionName} companion. Start Recall with npm start.`,
      e instanceof Error ? e.message : String(e),
    );
  }
  if (localTransport === 'api' && (res.status === 401 || res.status === 403)) {
    throw new LLMError('auth', 'The API key was rejected. Check .env.local.');
  }
  if (res.status === 429 || res.status >= 500) {
    const detail = await res.text().catch(() => '');
    throw new LLMError('rate-limit', `The local ${companionName} companion returned ${res.status}.`, detail.slice(0, 500));
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new LLMError('http', `The local ${companionName} companion could not complete that request.`, detail.slice(0, 500));
  }
  const payload = (await res.json()) as { text?: unknown };
  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    throw new LLMError('http', `The local ${companionName} companion returned an empty response.`);
  }
  return payload.text;
}

/** Retries transient failures (429/5xx) with exponential backoff, three attempts. */
async function requestWithBackoff(prompt: Prompt, opts: CallOpts): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await requestOnce(prompt, opts);
    } catch (e) {
      lastError = e;
      const retryable = e instanceof LLMError && (e.kind === 'rate-limit' || e.kind === 'network');
      if (!retryable || attempt === 2) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError;
}

/**
 * Single entry point for every model call. Requests JSON, strips fences,
 * validates with Zod, retries once with the validation error appended,
 * then throws a typed LLMError the UI can render.
 */
export async function callLLM<T>(
  prompt: Prompt,
  schema: z.ZodType<T>,
  opts: CallOpts = {},
): Promise<T> {
  let attemptPrompt = prompt;
  let lastIssue = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await requestWithBackoff(attemptPrompt, opts);
    const jsonText = extractJson(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      lastIssue = 'The response was not valid JSON.';
      attemptPrompt = withCorrection(prompt, lastIssue);
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) return result.data;

    lastIssue = result.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    attemptPrompt = withCorrection(prompt, lastIssue);
  }

  throw new LLMError('schema', 'The model returned data in the wrong shape.', lastIssue);
}

function withCorrection(prompt: Prompt, issue: string): Prompt {
  return {
    system: prompt.system,
    user: `${prompt.user}

Your previous response was rejected: ${issue}
Return only the JSON object described above, with no commentary and no code fences.`,
  };
}
