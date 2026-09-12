/**
 * dist/ をプレビュー配信し、起動を待ってからコマンドを実行し、必ず後片付けする。
 * CI でもローカルでも同じ手順でテストを回せるようにするためのもの。
 *
 *   node scripts/serve-and-run.js -- node tests/e2e.mjs
 *   PORT=4173 node scripts/serve-and-run.js -- node tests/contrast.mjs
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

const PORT = Number(process.env.PORT || 4173);
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}/`;
const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

const separator = process.argv.indexOf('--');
const command = separator === -1 ? [] : process.argv.slice(separator + 1);
if (command.length === 0) {
  console.error('使い方: node scripts/serve-and-run.js -- <コマンド>');
  process.exit(2);
}

const viteArgs = ['vite', 'preview', '--port', String(PORT), '--host', HOST, '--strictPort'];
if (process.env.VITE_MODE) viteArgs.push('--mode', process.env.VITE_MODE);

const server = spawn('npx', viteArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
let serverClosed = false;
server.on('exit', () => { serverClosed = true; });

function stopServer() {
  if (!serverClosed && server.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
  }
}

async function waitForServer() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (serverClosed) throw new Error('プレビューサーバが起動前に終了しました');
    try {
      const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // まだ起動していない
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`プレビューサーバが ${READY_TIMEOUT_MS}ms 以内に応答しませんでした`);
}

let exitCode = 1;
try {
  await waitForServer();
  console.log(`▶ ${BASE_URL} で配信中。${command.join(' ')} を実行します`);

  exitCode = await new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      stdio: 'inherit',
      env: { ...process.env, BASE_URL },
    });
    child.on('exit', (code, signal) => resolve(signal ? 1 : code ?? 1));
    child.on('error', (err) => {
      console.error(err.message);
      resolve(1);
    });
  });
} catch (err) {
  console.error(err.message);
  exitCode = 1;
} finally {
  stopServer();
}

process.exit(exitCode);
