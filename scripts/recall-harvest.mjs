import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { findHarvestRuntime, harvestArgs, harvestOnboarding } from './harvest-runtime.mjs';

const state = {
  running: false,
  done: false,
  phase: '',
  current: '',
  count: 0,
  kept: 0,
  dropped: 0,
  dupes: 0,
  raw_total: 0,
  log: [],
  summary: [],
  ticker: [],
  outfile: '',
  error: '',
};

let crawlProcess;

async function filesByNewest(directory, predicate) {
  const names = await readdir(directory).catch(() => []);
  const matches = await Promise.all(names.filter(predicate).map(async (name) => ({
    name,
    modified: (await stat(join(directory, name))).mtimeMs,
  })));
  return matches.sort((a, b) => b.modified - a.modified);
}

async function readShortlist(found) {
  if (!found) return [];
  const files = await filesByNewest(found.crawlerData, (name) => /^_shortlist_\d{4}\.json$/.test(name));
  if (!files.length) return [];
  try {
    const payload = JSON.parse(await readFile(join(found.crawlerData, files[0].name), 'utf8'));
    return Array.isArray(payload?.rows) ? payload.rows : [];
  } catch {
    return [];
  }
}

async function latestWorkbook(found) {
  if (!found) return null;
  const files = await filesByNewest(found.crawlerData, (name) => /\.xlsx$/i.test(name));
  return files[0] ? join(found.crawlerData, files[0].name) : null;
}

function ingest(chunk) {
  for (const raw of chunk.toString('utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    state.log.push(line);
    state.log = state.log.slice(-400);
    const stage = line.match(/^\[([^\]]+)\]/);
    if (stage) state.phase = stage[1];
    state.current = line.slice(0, 180);
  }
}

async function refreshArtifacts(found) {
  const rows = await readShortlist(found);
  const workbook = await latestWorkbook(found);
  state.kept = rows.length;
  state.count = rows.length;
  state.outfile = workbook ?? '';
  return rows;
}

async function startCrawl() {
  if (state.running) return { ok: true, busy: true };
  const found = await findHarvestRuntime();
  if (!found) throw Object.assign(new Error('Career Churn Furnace engine is not installed. Set RECALL_CCF_ROOT to its checkout.'), { status: 503 });
  const onboarding = await harvestOnboarding(found);
  if (!onboarding.ready) {
    throw Object.assign(new Error(`Harvest onboarding is incomplete. Still needed: ${onboarding.missing.join(', ')}. Run npm run harvest:onboard.`), { status: 409 });
  }

  state.running = true;
  state.done = false;
  state.phase = 'starting';
  state.current = '';
  state.error = '';
  state.log = [];
  state.count = 0;
  state.kept = 0;
  state.dropped = 0;
  state.dupes = 0;
  state.raw_total = 0;
  state.outfile = '';
  const args = harvestArgs(['crawl']);
  crawlProcess = spawn(found.ccf, args, {
    cwd: found.root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  crawlProcess.stdout.on('data', ingest);
  crawlProcess.stderr.on('data', ingest);
  crawlProcess.on('error', (error) => {
    state.error = `Crawler could not start: ${error.message}`;
  });
  crawlProcess.on('exit', async (code) => {
    state.running = false;
    state.done = true;
    state.phase = code === 0 ? 'Finished' : 'Failed';
    if (code !== 0 && !state.error) state.error = `Crawler exited with code ${code}.`;
    await refreshArtifacts(found);
    crawlProcess = undefined;
  });
  return { ok: true, busy: false };
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

export async function handleHarvestRequest(request, response) {
  const path = new URL(request.url, 'http://localhost').pathname.replace('/api/recall-harvest', '');
  const found = await findHarvestRuntime();

  if (request.method === 'GET' && path === '/health') {
    const onboarding = await harvestOnboarding(found);
    return sendJson(response, 200, {
      ok: Boolean(found),
      engine: found ? 'managed' : 'missing',
      ready: Boolean(found) && onboarding.ready,
      onboarding,
      command: found ? 'npm run harvest:onboard' : 'npm run setup:harvest',
      message: !found
        ? 'Install Career Churn Furnace or set RECALL_CCF_ROOT.'
        : onboarding.ready
          ? ''
          : `Harvest onboarding is incomplete. Still needed: ${onboarding.missing.join(', ')}.`,
    });
  }
  if (!found) return sendJson(response, 503, { error: 'Career Churn Furnace engine is not installed. Set RECALL_CCF_ROOT.' });
  if (request.method === 'GET' && path === '/crawl/status') {
    if (!state.running) await refreshArtifacts(found);
    return sendJson(response, 200, state);
  }
  if (request.method === 'GET' && path === '/crawl/shortlist') {
    return sendJson(response, 200, { rows: await readShortlist(found) });
  }
  if (request.method === 'POST' && path === '/crawl/start') {
    try {
      return sendJson(response, 200, await startCrawl());
    } catch (error) {
      return sendJson(response, Number(error?.status) || 500, { error: error.message });
    }
  }
  if (request.method === 'GET' && path === '/crawl/download') {
    const workbook = await latestWorkbook(found);
    if (!workbook) return sendJson(response, 404, { error: 'No crawl workbook exists yet.' });
    const bytes = await readFile(workbook);
    response.writeHead(200, {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${workbook.split(/[\\/]/).pop()}"`,
      'content-length': String(bytes.length),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(bytes);
    return;
  }
  sendJson(response, 404, { error: 'Harvest route not found.' });
}

export function shutdownHarvest() {
  if (!crawlProcess || crawlProcess.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(crawlProcess.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    crawlProcess.kill('SIGTERM');
  }
}
