import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import net from 'node:net';
import { join, resolve } from 'node:path';
import { findHarvestRuntime, harvestOnboarding } from './harvest-runtime.mjs';
import { loadLocalEnv } from './local-env.mjs';

await loadLocalEnv();

const root = resolve(import.meta.dirname, '..');
let failures = 0;
let warnings = 0;

const report = (kind, message) => {
  if (kind === 'FAIL') failures++;
  if (kind === 'WARN') warnings++;
  console.log(`${kind.padEnd(4)} ${message}`);
};

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function command(name, args = []) {
  const invocation = process.platform === 'win32' && /\.cmd$/i.test(name)
    ? { name: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', name, ...args] }
    : { name, args };
  const result = spawnSync(invocation.name, invocation.args, { cwd: root, encoding: 'utf8', timeout: 10_000, windowsHide: true });
  return result.status === 0 ? `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() : '';
}

async function portAvailable(port) {
  return new Promise((resolvePort) => {
    const server = net.createServer();
    server.once('error', () => resolvePort(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolvePort(true)));
  });
}

console.log('Recall doctor\n');
const [major, minor] = process.versions.node.split('.').map(Number);
const supportedNode = (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22;
report(supportedNode ? 'PASS' : 'FAIL', `Node ${process.version}${supportedNode ? '' : ' is unsupported. Use Node 20.19+ or 22.12+.'}`);
report(command(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version']) ? 'PASS' : 'FAIL', 'npm is available.');
report(command('git', ['--version']) ? 'PASS' : 'FAIL', 'Git is available.');
report(await exists(join(root, 'node_modules', 'vite', 'package.json')) ? 'PASS' : 'FAIL', 'Dependencies are installed.');

for (const port of [5173, 8787]) {
  const available = await portAvailable(port);
  report(available ? 'PASS' : 'FAIL', `Loopback port ${port} is ${available ? 'available' : 'already in use'}.`);
}

const env = process.env;
const provider = env.RECALL_PROVIDER?.toLowerCase();
const configured = (value) => Boolean(value && !/your_(?:api_)?key|replace_me|example/i.test(value));
const apiReady = Boolean(configured(env.RECALL_MODEL) && (
  (provider === 'openai' && configured(env.OPENAI_API_KEY))
  || (provider === 'anthropic' && configured(env.ANTHROPIC_API_KEY))
));
report(apiReady ? 'PASS' : 'WARN', apiReady ? `API mode is configured for ${provider}.` : 'API mode is not configured. Copy .env.example to .env.local to use it.');

const codexStatus = command(process.platform === 'win32' ? 'codex.cmd' : 'codex', ['login', 'status']);
const codexReady = /logged in/i.test(codexStatus);
report(codexReady ? 'PASS' : 'INFO', codexReady ? 'Codex subscription mode is logged in.' : 'Codex subscription mode is unavailable or logged out.');
const claudeStatus = command(process.platform === 'win32' ? 'claude.cmd' : 'claude', ['auth', 'status']);
const claudeReady = /"loggedIn"\s*:\s*true/i.test(claudeStatus);
report(claudeReady ? 'PASS' : 'INFO', claudeReady ? 'Claude Code subscription mode is logged in.' : 'Claude Code subscription mode is unavailable or logged out.');
const customReady = configured(env.RECALL_AGENT_COMMAND);
report(customReady ? 'PASS' : 'INFO', customReady ? 'A custom agent adapter is configured.' : 'No custom agent adapter is configured.');
if (!apiReady && !codexReady && !claudeReady && !customReady) {
  report('FAIL', 'No AI runtime is ready. Authenticate Codex or Claude Code, configure API mode, or configure a custom adapter.');
}

const foundHarvest = await findHarvestRuntime();
report(foundHarvest ? 'PASS' : 'WARN', foundHarvest ? 'Harvest runtime is installed.' : 'Harvest is optional and not installed. Run npm run setup:harvest.');
if (foundHarvest) {
  const onboarding = await harvestOnboarding(foundHarvest);
  report(
    onboarding.ready ? 'PASS' : 'WARN',
    onboarding.ready
      ? `Harvest onboarding is ready (${onboarding.completed}/${onboarding.total} steps complete).`
      : `Harvest onboarding is incomplete. Still needed: ${onboarding.missing.join(', ')}. Run npm run harvest:onboard.`,
  );
} else {
  report(command('uv', ['--version']) ? 'PASS' : 'WARN', 'uv is required by npm run setup:harvest.');
  report(command('python', ['--version']) ? 'PASS' : 'WARN', 'Python 3.11+ is required by npm run setup:harvest.');
}

let playwrightReady = false;
try {
  const { chromium } = await import('playwright');
  playwrightReady = await exists(chromium.executablePath());
} catch {}
report(playwrightReady ? 'PASS' : 'WARN', playwrightReady ? 'Playwright Chromium is installed.' : 'Playwright Chromium is missing. Run npx playwright install chromium.');
console.log(`\n${failures ? 'NOT READY' : 'READY'}: ${failures} failure(s), ${warnings} warning(s).`);
process.exitCode = failures ? 1 : 0;
