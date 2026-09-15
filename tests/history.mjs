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

/* ---------- 服屋を探す（Google マップへの直リンク） ---------- */
{
  // ショップ画面は畳んだ。手で登録した2店舗も、営業時間が手入力で古くなっても
  // 誰も気づかず、そこから計算する「営業中」バッジが自信を持って間違える作りだった。
  // マップ側の情報のほうが正確なので、ホームから直接そこへ送る。
  const { context, page } = await open(20);

  const links = page.locator('[data-find-shops]');
  ok('ホームと結果画面にリンクがある', (await links.count()) === 2, `${await links.count()} 個`);

  const home = links.first();
  ok('ボタンではなくリンクである',
    (await home.evaluate((el) => el.tagName)) === 'A',
    await home.evaluate((el) => el.tagName));
  ok('別タブで開く', (await home.getAttribute('target')) === '_blank');
  ok('opener を渡さない', (await home.getAttribute('rel') || '').includes('noopener'));

  const href = await home.getAttribute('href');
  ok('Google マップを指している',
    href.startsWith('https://www.google.com/maps/search/'), href);
  ok('服屋を検索する', decodeURIComponent(href).includes('服屋'), decodeURIComponent(href));
  ok('現在地が無ければ中心を指定しない', !href.includes('@'), href);

  // 押した瞬間にマップへ出る。間に画面を挟まない
  ok('ショップ画面が残っていない',
    (await page.locator('#shop-screen').count()) === 0);
  ok('ショップ画面を開くアクションが残っていない',
    (await page.locator('[data-action="open-shop"]').count()) === 0);

  // 実在の店名の隣に在庫を騙る表示を置かない
  const result = await page.textContent('#result-screen');
  ok('サコッシュバッグの作り話が消えている', !result.includes('サコッシュ'));
  ok('根拠のない「取扱中」が消えている', !result.includes('取扱中'));

  await context.close();
}

/* ---------- 現在地が分かったとき ---------- */
{
  const { context, page } = await open(20, {
    geolocation: { latitude: 33.9189, longitude: 133.1818 },
    permissions: ['geolocation'],
  });

  // 天気の「現在地を使う」で位置が分かったら、地図の中心もそこに合わせる
  await page.click('[data-action="refresh-weather"]');
  await page.waitForTimeout(2000);

  const hrefs = await page.locator('[data-find-shops]').evaluateAll(
    (els) => els.map((el) => el.getAttribute('href')));
  ok('両方のリンクに現在地が入る',
    hrefs.length === 2 && hrefs.every((h) => h.includes('@33.9189,133.1818')),
    hrefs.join(' | '));

  await context.close();
}

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
