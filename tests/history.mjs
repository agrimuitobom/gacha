/**
 * コーデ履歴と、店舗までの距離表示を検証する。
 *
 *   npm run build && node scripts/serve-and-run.js -- node tests/history.mjs
 */
import { launchChromium } from './browser.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173/';

const results = [];
const ok = (name, passed, detail = '') =>
  results.push(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

const weather = (temp) => ({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({
    current_weather: { temperature: temp, weathercode: 0, time: '2026-09-13T12:00' },
    hourly: { time: ['2026-09-13T12:00'], precipitation_probability: [0] },
  }),
});

const browser = await launchChromium();

async function open(temp, options = {}) {
  const context = await browser.newContext({
    reducedMotion: 'reduce', viewport: { width: 420, height: 880 }, ...options,
  });
  await context.route('**/api.open-meteo.com/**', (r) => r.fulfill(weather(temp)));
  await context.route('**/images.unsplash.com/**', (r) => r.abort());
  await context.route('**/placehold.co/**', (r) => r.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE_URL);
  await page.waitForTimeout(2800);
  return { context, page, errors };
}

/* ---------- コーデ履歴 ---------- */
{
  const { context, page, errors } = await open(5);

  // 寒い日なのでアウターも含まれるはず
  await page.click('#gacha-btn');
  await page.waitForSelector('#result-screen:not(.hidden)');
  await page.waitForTimeout(300);
  const decided = await page.textContent('#result-items');
  const outerIncluded = decided.includes('アウター') && !decided.includes('未登録');
  await page.click('[data-action="decide-outfit"]');
  await page.waitForTimeout(1500);

  await page.click('[data-action="open-calendar"]');
  await page.waitForTimeout(1500);

  const history = await page.textContent('#outfit-history');
  ok('決めたコーデが履歴に残る',
    history.includes('トップス') && history.includes('決定:'),
    history.replace(/\s+/g, ' ').slice(0, 60));
  ok('アウターも履歴に記録される',
    !outerIncluded || history.includes('アウター'),
    outerIncluded ? '寒い日のアウターを含む' : '（この回はアウターなし）');

  // 決めていない日を選ぶと、その旨が出る
  const otherDay = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-action="select-date"]')];
    const today = buttons.find((b) => b.getAttribute('aria-current') === 'date');
    const other = buttons.find((b) => b !== today);
    other.click();
    return other.dataset.date;
  });
  await page.waitForTimeout(1200);
  ok('決めていない日は「まだ決めていません」',
    (await page.textContent('#outfit-history')).includes('まだ決めていません'), otherDay);

  // カレンダーに記録があることを示す印が出る
  const marks = await page.evaluate(() =>
    document.querySelectorAll('[data-action="select-date"] .bg-indigo-600').length);
  ok('カレンダーにコーデ記録の印が出る', marks >= 1, `${marks}日`);

  ok('JSエラーが発生していない', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

/* ---------- 最近着たものを避ける ---------- */
{
  const { context, page } = await open(24);

  // 今日のコーデを決めて記録を作る
  await page.click('#gacha-btn');
  await page.waitForSelector('#result-screen:not(.hidden)');
  await page.waitForTimeout(300);
  const worn = (await page.textContent('#result-items')).replace(/\s+/g, '');
  await page.click('[data-action="decide-outfit"]');
  await page.waitForTimeout(1500);

  // 決めた直後に引き直すと、同じ組み合わせは出にくくなるはず
  let same = 0;
  await page.click('#gacha-btn');
  await page.waitForSelector('#result-screen:not(.hidden)');
  await page.waitForTimeout(300);
  for (let i = 0; i < 20; i += 1) {
    await page.click('[data-action="regacha"]');
    await page.waitForTimeout(450);
    if ((await page.textContent('#result-items')).replace(/\s+/g, '') === worn) same += 1;
  }
  // 手持ちが少ないので0にはならないが、履歴を見ていれば明らかに減る
  ok('直近に着た組み合わせが出にくくなる', same <= 8, `20回中 ${same}回`);
  await context.close();
}

/* ---------- 店舗までの距離 ---------- */
{
  const { context, page } = await open(20);
  await page.click('[data-action="open-shop"]');
  await page.waitForTimeout(1200);

  const text = await page.textContent('#shop-list');
  ok('座標が無いうちは距離を表示しない',
    !/km 先|直線距離/.test(text), text.replace(/\s+/g, ' ').slice(0, 60));
  ok('根拠のない「2.7 km 先」が消えている', !text.includes('2.7'));
  ok('店舗情報そのものは表示される',
    text.includes('minami') && text.includes('キャマラド'));
  await context.close();
}

{
  const { context, page } = await open(20);
  await page.click('[data-action="open-shop"]');
  await page.waitForTimeout(1200);
  ok('座標が無ければ現在地の導線も出さない',
    (await page.locator('[data-action="locate-shops"]').count()) === 0);
  await context.close();
}

/* ---------- 距離計算そのものの正しさ ---------- */
{
  // 座標を入れれば距離が出る、その計算が正しいことを直接確かめる。
  // 既知の測地値と突き合わせる（緯度1度 ≒ 111.2km、赤道の経度1度 ≒ 111.3km）
  const { distanceKm, formatDistance } = await import('../src/domain/geo.js');

  const lat1deg = distanceKm({ lat: 35, lon: 139 }, { lat: 36, lon: 139 });
  ok('緯度1度の距離が既知の値と合う', Math.abs(lat1deg - 111.2) < 0.5, `${lat1deg.toFixed(2)} km`);

  const lon1deg = distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
  ok('赤道上の経度1度が既知の値と合う', Math.abs(lon1deg - 111.3) < 0.5, `${lon1deg.toFixed(2)} km`);

  // 高緯度では経度方向が cos(緯度) 倍に縮む
  const at35 = distanceKm({ lat: 35, lon: 139 }, { lat: 35, lon: 140 });
  const expected = 111.19 * Math.cos((35 * Math.PI) / 180);
  ok('緯度による経度方向の縮みが反映される',
    Math.abs(at35 - expected) < 0.5, `${at35.toFixed(2)} km / 理論値 ${expected.toFixed(2)} km`);

  ok('同一地点は0になる', distanceKm({ lat: 35, lon: 139 }, { lat: 35, lon: 139 }) === 0);

  ok('1km 未満はメートル表記になる',
    formatDistance(0.45) === '450 m' && formatDistance(2.74) === '2.7 km',
    `${formatDistance(0.45)} / ${formatDistance(2.74)}`);
}

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
