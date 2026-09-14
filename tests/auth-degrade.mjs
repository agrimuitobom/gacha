/**
 * Firebase に繋がらずローカル保存へ退避したときの表示を検証する。
 *
 * 退避には「待てば直るもの（通信）」と「直さないと永久に直らないもの（設定）」が
 * あるが、以前は一律に「接続が戻ってから設定を開き直してください」と出していた。
 *
 * 実際、匿名認証が無効なまま公開すると signInAnonymously が
 * auth/admin-restricted-operation で落ち、ローカル保存に退避したまま
 * Google 連携の導線ごと消える。利用者からは「Google ログインにならない」
 * としか見えず、画面には通信を疑う案内しか出ていなかった。
 *
 *   firebase emulators:exec ... "npm run build:emulator && node scripts/serve-and-run.js -- node tests/auth-degrade.mjs"
 */
import { launchChromium } from './browser.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173/';

const results = [];
const ok = (name, passed, detail = '') =>
  results.push(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

const browser = await launchChromium();

/** 匿名サインインの結果を差し替えて設定画面を開く */
async function openSettingsWith(signUpHandler) {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 420, height: 880 } });
  await context.route('**/api.open-meteo.com/**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        current_weather: { temperature: 20, weathercode: 0, time: '2026-09-14T12:00' },
        hourly: { time: ['2026-09-14T12:00'], precipitation_probability: [0] },
      }),
    })
  );
  await context.route('**/identitytoolkit.googleapis.com/v1/accounts:signUp*', signUpHandler);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(BASE_URL);
  await page.waitForTimeout(3000);
  await page.click('[data-action="open-settings"]');
  await page.waitForTimeout(1500);
  return { context, page, errors, body: await page.textContent('#account-body') };
}

/* ---------- 設定が原因（匿名認証が無効） ---------- */
{
  // Firebase が匿名認証の無効時に返すもの
  const { context, page, errors, body } = await openSettingsWith((route) =>
    route.fulfill({
      status: 400, contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 400, message: 'ADMIN_ONLY_OPERATION', errors: [{ message: 'ADMIN_ONLY_OPERATION' }] },
      }),
    })
  );

  ok('設定が原因だと分かる見出しになる',
    body.includes('オンライン同期を開始できませんでした'), body.trim().slice(0, 50));
  ok('原因コードが画面に出る',
    body.includes('auth/admin-restricted-operation'),
    body.includes('auth/') ? body.match(/auth\/[a-z-]+/)?.[0] : '(コードなし)');
  ok('匿名認証を有効にする案内が出る',
    body.includes('「匿名」を有効に'), body.includes('匿名') ? '' : body.trim().slice(0, 60));
  ok('待てば直るかのような案内を出さない',
    !body.includes('接続が戻ってから'),
    body.includes('接続が戻ってから') ? '通信エラー用の文言が出ている' : '');
  ok('データが残っていることを伝える', body.includes('データは残っています'));
  ok('JSエラーが発生していない', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

/* ---------- 通信が原因 ---------- */
{
  const { context, errors, body } = await openSettingsWith((route) => route.abort('connectionrefused'));

  ok('通信が原因なら接続を待つ案内を出す',
    body.includes('接続が戻ってから'), body.trim().slice(0, 50));
  ok('通信エラーで設定を疑わせない',
    !body.includes('Firebase の設定をご確認ください'),
    body.includes('設定をご確認') ? '設定エラー用の文言が出ている' : '');
  ok('通信エラーでもJSエラーにしない', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

/* ---------- 正常時（退避していない） ---------- */
{
  const { context, body } = await openSettingsWith((route) => route.continue());

  ok('正常時は退避の案内を出さない',
    !body.includes('オンライン同期を開始できませんでした') && !body.includes('接続が戻ってから'),
    body.trim().slice(0, 50));
  ok('正常時は Google 連携の導線が出る', body.includes('紐づいていません'), body.trim().slice(0, 40));
  await context.close();
}

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
