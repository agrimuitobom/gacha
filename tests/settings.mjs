/**
 * 設定画面と、データの保存先の表示を検証する。
 *
 * 既定の匿名認証は、ブラウザのデータを消すと二度と戻れない。
 * その状態がはっきり見えているか、連携への導線があるかを確認する。
 *
 *   npm run build && node scripts/serve-and-run.js -- node tests/settings.mjs
 *
 * BACKEND=firebase を付けると、エミュレータの匿名アカウント前提で判定する。
 */
import { launchChromium } from './browser.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const IS_FIREBASE = process.env.BACKEND === 'firebase';

const results = [];
const ok = (name, passed, detail = '') =>
  results.push(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

const browser = await launchChromium();
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 420, height: 880 } });
await context.route('**/api.open-meteo.com/**', (r) =>
  r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      current_weather: { temperature: 20, weathercode: 0, time: '2026-09-12T12:00' },
      hourly: { time: ['2026-09-12T12:00'], precipitation_probability: [0] },
    }),
  })
);

const page = await context.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

await page.goto(BASE_URL);
await page.waitForTimeout(3000);

ok('ホームに設定への入口がある',
  (await page.locator('[data-action="open-settings"]').count()) === 1);

await page.click('[data-action="open-settings"]');
await page.waitForTimeout(1500);

const visible = !(await page.locator('#settings-screen').getAttribute('class')).includes('hidden');
ok('設定画面が開く', visible);
ok('見出しにフォーカスが移る',
  (await page.evaluate(() => document.activeElement?.id)) === 'settings-title');

const body = await page.textContent('#account-body');
ok('保存先の状態が表示される', body.length > 0 && !body.includes('確認中'), body.trim().slice(0, 60));

if (IS_FIREBASE) {
  // 匿名アカウントなので、失う可能性を明示して連携へ誘導しているはず
  ok('匿名であることが示される', body.includes('紐づいていません'), body.trim().slice(0, 40));
  ok('データを失う可能性が警告される',
    body.includes('復元できません'), body.includes('復元できません') ? '' : body.trim().slice(0, 80));
  ok('Google 連携ボタンがある',
    (await page.locator('[data-action="link-account"]').count()) === 1);
  ok('匿名のうちはログアウトを出さない',
    (await page.locator('[data-action="sign-out-account"]').count()) === 0);
} else {
  ok('この端末にのみ保存であることが示される',
    body.includes('この端末にだけ保存'), body.trim().slice(0, 40));
  ok('連携できない構成では連携ボタンを出さない',
    (await page.locator('[data-action="link-account"]').count()) === 0);
}

// 戻ると元のボタンにフォーカスが返る
await page.click('#settings-screen [data-action="back"]');
await page.waitForTimeout(500);
ok('戻ると設定ボタンにフォーカスが返る',
  (await page.evaluate(() => document.activeElement?.dataset?.action)) === 'open-settings');

ok('JSエラーが発生していない', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
