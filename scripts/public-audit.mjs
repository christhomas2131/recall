import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ignored = new Set(['.git', '.recall-tools', 'dist', 'node_modules', 'node_modules.macos-corrupt-backup', 'playwright-report', 'test-results']);
const privateExtensions = new Set(['.doc', '.docx', '.key', '.p12', '.pem', '.pdf', '.xlsx']);
const textExtensions = new Set(['', '.css', '.example', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml']);
const problems = [];

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

for (const file of await walk(root)) {
  const name = relative(root, file).replaceAll('\\', '/');
  const info = await stat(file);
  if (name.split('/').some((part) => part.startsWith('._'))) problems.push(`${name}: macOS AppleDouble artifact`);
  if ((name.split('/').at(-1)?.startsWith('.env') && name !== '.env.example') || privateExtensions.has(extname(name).toLowerCase())) problems.push(`${name}: private or secret-bearing file type`);
  if (info.size > 10 * 1024 * 1024) problems.push(`${name}: file exceeds 10 MiB`);
  if (!textExtensions.has(extname(name).toLowerCase()) || info.size > 2 * 1024 * 1024) continue;
  const contents = await readFile(file, 'utf8');
  if (/(?:C:\\Users\\|\/Users\/)[^\s"']+/i.test(contents)) problems.push(`${name}: contains an absolute user path`);
  if (contents.includes(['localhost', '8765'].join(':'))) problems.push(`${name}: contains the retired legacy Harvest port`);
  if (name !== '.env.example' && /\b(?:sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,})\b/.test(contents)) problems.push(`${name}: resembles an API key`);
  const productionBrowserSource = name.startsWith('src/')
    && !name.includes('/test/')
    && !name.includes('/__tests__/')
    && !name.endsWith('.test.ts')
    && !name.endsWith('.test.tsx');
  if (productionBrowserSource && /\bapiKey\b|anthropic-dangerous-direct-browser-access|api\.openai\.com\/v1\/chat|api\.anthropic\.com\/v1\/messages/.test(contents)) {
    problems.push(`${name}: contains browser-side provider credential or endpoint code`);
  }
}

if (problems.length) {
  console.error('Public-release audit failed:\n');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('Public-release audit passed. No local artifacts, likely secrets, private documents, or oversized files found.');
}
