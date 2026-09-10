import { readFile } from 'node:fs/promises';

export async function loadLocalEnv() {
  let contents;
  try { contents = await readFile(new URL('../.env.local', import.meta.url), 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at < 1) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
