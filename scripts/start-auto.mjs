import { spawnSync } from 'node:child_process';
import { loadLocalEnv } from './local-env.mjs';

await loadLocalEnv();

function run(command, args) {
  const call = process.platform === 'win32'
    ? { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', `${command}.cmd`, ...args] }
    : { command, args };
  const result = spawnSync(call.command, call.args, { encoding: 'utf8', timeout: 10_000, windowsHide: true });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

const codex = run('codex', ['login', 'status']);
const claude = run('claude', ['auth', 'status']);
const configured = (value) => Boolean(value?.trim() && !/^(your_key_here|replace_me|changeme)$/i.test(value.trim()));
const available = {
  codex: codex.status === 0 && /logged in/i.test(codex.output),
  claude: claude.status === 0 && /"loggedIn"\s*:\s*true/i.test(claude.output),
  custom: Boolean(process.env.RECALL_AGENT_COMMAND?.trim()),
  api: Boolean(configured(process.env.RECALL_MODEL) && (
    (process.env.RECALL_PROVIDER?.toLowerCase() === 'openai' && configured(process.env.OPENAI_API_KEY))
    || (process.env.RECALL_PROVIDER?.toLowerCase() === 'anthropic' && configured(process.env.ANTHROPIC_API_KEY))
  )),
};

const requested = (process.env.RECALL_AGENT ?? 'auto').toLowerCase();
if (!['auto', 'codex', 'claude', 'custom', 'api'].includes(requested)) {
  throw new Error('RECALL_AGENT must be auto, codex, claude, custom, or api.');
}
const selected = requested === 'auto'
  ? (['codex', 'claude', 'custom', 'api'].find((name) => available[name]) ?? '')
  : requested;

if (process.argv.includes('--diagnose')) {
  console.log(JSON.stringify({ available, selected: selected || null }));
  process.exit(0);
}
if (!selected || !available[selected]) {
  throw new Error(`No usable Recall AI runtime was found. Run npm run doctor, authenticate Codex or Claude Code, configure API mode, or configure a custom adapter.${requested !== 'auto' ? ` Requested runtime: ${requested}.` : ''}`);
}
console.log(`[recall] selected ${selected} runtime`);
if (selected === 'codex') await import('./start-codex.mjs');
else if (selected === 'claude') await import('./start-claude.mjs');
else if (selected === 'custom') await import('./start-custom.mjs');
else await import('./start-api.mjs');
