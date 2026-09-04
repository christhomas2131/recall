import type { z } from 'zod';
import { getSettings } from '@/db/hooks';
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
  const { provider, apiKey, model } = getSettings();
  if (!apiKey.trim()) {
    throw new LLMError('no-key', 'No API key set. Add one in Settings.');
  }

  const maxTokens = opts.maxTokens ?? 4096;

  const url =
    provider === 'anthropic'
      ? 'https://api.anthropic.com/v1/messages'
      : 'https://api.openai.com/v1/chat/completions';

  const headers: Record<string, string> =
    provider === 'anthropic'
      ? {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        }
      : {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        };

  const body =
    provider === 'anthropic'
      ? {
          model,
          max_tokens: maxTokens,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
        }
      : {
          model,
          max_completion_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    throw new LLMError(
      'network',
      'Could not reach the provider.',
      e instanceof Error ? e.message : String(e),
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new LLMError('auth', 'The API key was rejected. Check it in Settings.');
  }
  if (res.status === 429 || res.status >= 500) {
    throw new LLMError('rate-limit', `Provider returned ${res.status}.`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new LLMError('http', `Provider returned ${res.status}.`, detail.slice(0, 500));
  }

  const json = (await res.json()) as unknown;
  const text =
    provider === 'anthropic'
      ? (json as { content?: { type: string; text?: string }[] }).content
          ?.filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join('') ?? ''
      : (json as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message
          ?.content ?? '';

  if (!text.trim()) {
    throw new LLMError('http', 'The provider returned an empty response.');
  }
  return text;
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
