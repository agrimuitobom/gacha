/**
 * 日付の切り替わりと、バックグラウンドからの復帰を検証する。
 *
 * インストールして使うとアプリは終了せず残り続けるため、
 * 起動時に一度求めた日付や天気を持ち続けると、翌朝には
 * 昨日の情報のまま操作することになる。ここが壊れても
 * 画面上はそれらしく見えてしまうので、自動で確認する。
 *
 *   npm run build && node scripts/serve-and-run.js -- node tests/lifecycle.mjs
 */
import { launchChromium } from './browser.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173/';

const results = [];
const ok = (name, passed, detail = '') =>
  results.push(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

const weather = (temp) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    current_weather: { temperature: temp, weathercode: 0, time: '2026-09-12T12:00' },
    hourly: { time: ['2026-09-12T12:00'], precipitation_probability: [0] },
  }),
});

const browser = await launchChromium();

/* ---------- 1. 日付をまたいでも表示が更新されるか ---------- */
{
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 420, height: 880 } });
  await context.route('**/api.open-meteo.com/**', (r) => r.fulfill(weather(20)));
  const page = await context.newPage();

  // 23:59:30 に起動したことにする
  const start = new Date();
  start.setHours(23, 59, 30, 0);
  await page.clock.install({ time: start });

  await page.goto(BASE_URL);
  await page.waitForTimeout(2500);

  const before = await page.textContent('#home-calendar-date-text');
  const expectedBefore = `${start.getMonth() + 1}/${start.getDate()}`;
  ok('起動時は当日の日付を表示', before.startsWith(expectedBefore), before);

  // 日付をまたぐ
  await page.clock.fastForward('00:01:00');
  await page.waitForTimeout(1500);

  const after = await page.textContent('#home-calendar-date-text');
  const tomorrow = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const expectedAfter = `${tomorrow.getMonth() + 1}/${tomorrow.getDate()}`;
  ok('日付をまたぐとホームの表示が翌日になる', after.startsWith(expectedAfter),
    `${before} → ${after}（期待 ${expectedAfter}）`);

  // 昨日決めたコーデのバッジが残っていないこと
  await context.close();
}

/* ---------- 2. 日付が変わるとガチャが新しい日の予定を見るか ---------- */
{
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 420, height: 880 } });
  await context.route('**/api.open-meteo.com/**', (r) => r.fulfill(weather(20)));
  const page = await context.newPage();

  const start = new Date();
  start.setHours(23, 59, 30, 0);
  await page.clock.install({ time: start });
  await page.goto(BASE_URL);
  await page.waitForTimeout(2500);

  // 今日（＝またぐ前）の予定として会議を入れる
  await page.click('[data-action="open-calendar"]');
  await page.waitForTimeout(1000);
  await page.fill('.schedule-title-input', '取引先と会議');
  await page.click('[data-action="add-schedules"]');
  await page.waitForTimeout(1200);
  await page.click('#calendar-screen [data-action="back"]');
  await page.waitForTimeout(400);

  await page.click('#gacha-btn');
  await page.waitForSelector('#result-screen:not(.hidden)');
  await page.waitForTimeout(300);
  const beforeMessage = await page.textContent('#result-message');
  ok('またぐ前は当日の予定を反映する', beforeMessage.includes('フォーマル'), beforeMessage.trim());
  await page.click('#result-screen [data-action="back"]');
  await page.waitForTimeout(300);

  // 日付をまたぐと、昨日の予定は参照されなくなるはず
  await page.clock.fastForward('00:01:00');
  await page.waitForTimeout(1500);

  await page.click('#gacha-btn');
  await page.waitForSelector('#result-screen:not(.hidden)');
  await page.waitForTimeout(300);
  const afterMessage = await page.textContent('#result-message');
  ok('またいだ後は昨日の予定を引きずらない', !afterMessage.includes('フォーマル'), afterMessage.trim());

  await context.close();
}

/* ---------- 3. 復帰時に古い天気を取り直すか ---------- */
{
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 420, height: 880 } });
  let temp = 20;
  let calls = 0;
  await context.route('**/api.open-meteo.com/**', (r) => { calls += 1; r.fulfill(weather(temp)); });
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForTimeout(2500);

  ok('起動時に天気を取得する', calls === 1 && (await page.textContent('#weather-temp')) === '20°',
    `${calls}回 / ${await page.textContent('#weather-temp')}`);

  // すぐ復帰しても叩き直さない（連打防止）
  const callsBefore = calls;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(600);
  ok('直後の復帰では取り直さない', calls === callsBefore, `${calls}回`);

  // 時間が経ってからの復帰では取り直す
  temp = 31;
  await page.evaluate(() => {
    // 取得時刻を11分前に戻して「古い」状態を作る
    const now = Date.now;
    Date.now = () => now() + 11 * 60 * 1000;
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(1500);
  ok('時間が経った復帰では天気を取り直す',
    calls > callsBefore && (await page.textContent('#weather-temp')) === '31°',
    `${calls}回 / ${await page.textContent('#weather-temp')}`);

  await context.close();
}

/* ---------- 4. サンプルを全部消しても復活しないか ---------- */
{
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 420, height: 880 } });
  await context.route('**/api.open-meteo.com/**', (r) => r.fulfill(weather(20)));
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForTimeout(2500);

  await page.click('[data-action="open-closet"]');
  await page.waitForTimeout(1200);

  // 3タブぶんのアイテムを全部消す
  for (const tab of ['tops', 'bottoms', 'shoes']) {
    await page.click(`#tab-${tab}`);
    await page.waitForTimeout(300);
    for (;;) {
      const buttons = page.locator(`#content-${tab} [data-action="delete-item"]`);
      if ((await buttons.count()) === 0) break;
      await buttons.first().click();
      await page.waitForTimeout(500);
    }
  }
  const emptied = await page.evaluate(() =>
    ['tops', 'bottoms', 'shoes'].every((t) =>
      document.querySelectorAll(`#content-${t} [data-item-card]`).length === 0));
  ok('すべてのアイテムを削除できる', emptied);

  await page.reload();
  await page.waitForTimeout(3000);
  await page.click('[data-action="open-closet"]');
  await page.waitForTimeout(1500);
  const afterReload = await page.evaluate(() =>
    ['tops', 'bottoms', 'shoes'].reduce((sum, t) =>
      sum + document.querySelectorAll(`#content-${t} [data-item-card]`).length, 0));
  ok('リロードしてもサンプルが復活しない', afterReload === 0, `${afterReload}件`);

  // 空でもガチャは落ちず、案内が出ること
  await page.click('#closet-screen [data-action="back"]');
  await page.waitForTimeout(300);
  await page.click('#gacha-btn');
  await page.waitForSelector('#result-screen:not(.hidden)');
  await page.waitForTimeout(300);
  ok('空のクローゼットでも案内を出して落ちない',
    (await page.textContent('#result-message')).includes('登録されていません'));

  await context.close();
}

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
