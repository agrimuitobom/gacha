/**
 * CSP の検証。
 *
 * firebase.json に書いたヘッダをそのまま適用した静的サーバで dist を配信し、
 * CSP 違反が1件も起きないことを確認する。
 * 「設定は書いたが実は動かない」状態を防ぐのが目的。
 *
 *   npm run build && node tests/csp.mjs
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const PORT = 4188;
const DIST = 'dist';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** firebase.json の hosting.headers を、実際の配信ヘッダとして再現する */
const hosting = JSON.parse(await readFile('firebase.json', 'utf8')).hosting;

function headersFor(pathname) {
  const result = {};
  for (const rule of hosting.headers || []) {
    const pattern = rule.source;
    const matches =
      pattern === '**' ||
      (pattern.endsWith('/**') && pathname.startsWith(pattern.slice(0, -3))) ||
      pattern === pathname;
    if (!matches) continue;
    for (const { key, value } of rule.headers) result[key] = value;
  }
  return result;
}

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let filePath = join(DIST, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));

  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(DIST, 'index.html'); // SPA rewrite
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      ...headersFor(pathname),
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

const results = [];
const ok = (name, passed, detail = '') =>
  results.push(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const context = await browser.newContext({ reducedMotion: 'reduce' });

await context.route('**/api.open-meteo.com/**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      current_weather: { temperature: 18, weathercode: 0, time: '2026-09-12T12:00' },
      hourly: { time: ['2026-09-12T12:00'], precipitation_probability: [10] },
    }),
  })
);

const page = await context.newPage();
const violations = [];
const pageErrors = [];
page.on('console', (msg) => {
  const text = msg.text();
  if (/Content Security Policy|Refused to/i.test(text)) violations.push(text);
});
page.on('pageerror', (err) => pageErrors.push(err.message));

await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForTimeout(3000);

/* ヘッダが実際に付いているか */
const response = await page.request.get(`http://127.0.0.1:${PORT}/`);
const sent = response.headers();
ok('CSP ヘッダが配信されている', Boolean(sent['content-security-policy']));
ok("script-src に 'unsafe-inline' が無い",
  !/script-src[^;]*unsafe-inline/.test(sent['content-security-policy'] || ''));
ok("script-src に 'unsafe-eval' が無い",
  !/script-src[^;]*unsafe-eval/.test(sent['content-security-policy'] || ''));
ok('X-Content-Type-Options: nosniff', sent['x-content-type-options'] === 'nosniff');
ok('Referrer-Policy が設定されている', Boolean(sent['referrer-policy']));
ok('Permissions-Policy でカメラ/位置情報を自サイトに限定',
  /camera=\(self\)/.test(sent['permissions-policy'] || '') &&
  /geolocation=\(self\)/.test(sent['permissions-policy'] || ''));
ok('COOP が same-origin-allow-popups（Googleサインインを壊さない）',
  sent['cross-origin-opener-policy'] === 'same-origin-allow-popups',
  sent['cross-origin-opener-policy']);

/* 主要な画面を一通り操作して違反が出ないか */
await page.click('#gacha-btn');
await page.waitForSelector('#result-screen:not(.hidden)');
await page.waitForTimeout(400);
await page.click('#result-screen [data-action="open-shop"]');
await page.waitForTimeout(600);
await page.click('#shop-screen [data-action="back"]');
await page.waitForTimeout(200);
await page.click('#result-screen [data-action="back"]');
await page.waitForTimeout(200);
await page.click('[data-action="open-closet"]');
await page.waitForTimeout(800);
await page.click('#closet-screen [data-action="back"]');
await page.waitForTimeout(200);
await page.click('[data-action="open-calendar"]');
await page.waitForTimeout(800);
await page.fill('.schedule-title-input', 'CSP 確認');
await page.click('[data-action="add-schedules"]');
await page.waitForTimeout(800);

ok('アプリ全体を操作してもCSP違反が発生しない', violations.length === 0,
  violations.slice(0, 3).join(' | '));
ok('CSP下でもJSエラーが発生しない', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

/* 期待どおり「違反として弾ける」ことも確認する（ポリシーが素通しでない証明） */
const blockedInline = await page.evaluate(() => {
  const script = document.createElement('script');
  script.textContent = 'window.__cspBypassed = true;';
  document.body.appendChild(script);
  return window.__cspBypassed === true;
});
ok('インラインスクリプトの注入が CSP に阻止される', blockedInline === false);

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

await browser.close();
server.close();
process.exit(failed === 0 ? 0 : 1);
