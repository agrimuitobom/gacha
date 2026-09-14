/**
 * 撮影した写真が、保存前にきちんと縮小・圧縮されているかを検証する。
 *
 * 無料枠で運用するうえで容量が効くうえ、ここは退行しても
 * 画面上は何も変わらないため気づきにくい。実際にカメラから
 * 保存まで通して、保存されたバイト数を測る。
 *
 *   npm run build && node scripts/serve-and-run.js -- node tests/image-size.mjs
 */
import { launchChromium } from './browser.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173/';

/** 長辺の上限。src/ui/camera.js の MAX_IMAGE_SIZE と揃えること */
const MAX_EDGE = 640;
/** 上限バイト数。実測の最悪ケース（柄物 ≒ 100KB）に余裕を持たせた値 */
const MAX_BYTES = 400 * 1024;

const results = [];
const ok = (name, passed, detail = '') =>
  results.push(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

const browser = await launchChromium({ fakeCamera: true });
const context = await browser.newContext({
  reducedMotion: 'reduce',
  viewport: { width: 420, height: 880 },
  permissions: ['camera'],
});
await context.route('**/api.open-meteo.com/**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
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
await page.waitForTimeout(2500);

await page.click('[data-action="open-closet"]');
await page.waitForTimeout(1000);
await page.click('[data-action="open-camera"]');
await page.waitForTimeout(2500);

const cameraFailed = await page.evaluate(() =>
  !document.getElementById('camera-error').classList.contains('hidden'));
ok('疑似カメラが起動する', !cameraFailed,
  cameraFailed ? await page.textContent('#camera-error-text') : '');

if (!cameraFailed) {
  await page.click('[data-action="take-photo"]');
  await page.waitForTimeout(800);

  // 撮影直後、保存前の状態を確認する
  const pending = await page.evaluate(() => {
    const src = document.getElementById('capture-preview').src;
    const [header, payload] = src.split(',');
    const bytes = Math.floor(payload.length * 3 / 4)
      - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
    return { type: header.match(/data:([^;]+)/)[1], bytes };
  });

  ok('保存形式が WebP か JPEG（PNG に化けていない）',
    ['image/webp', 'image/jpeg'].includes(pending.type), pending.type);
  ok(`保存サイズが ${Math.round(MAX_BYTES / 1024)}KB 以下`,
    pending.bytes <= MAX_BYTES, `${(pending.bytes / 1024).toFixed(1)} KB`);

  // 実際の画素数が上限に収まっているか
  const dimensions = await page.evaluate(() => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = document.getElementById('capture-preview').src;
  }));
  ok(`長辺が ${MAX_EDGE}px 以下に縮小されている`,
    Math.max(dimensions.w, dimensions.h) <= MAX_EDGE,
    `${dimensions.w}x${dimensions.h}`);

  // 保存してクローゼットに反映されるか
  await page.fill('#capture-name', '容量テスト用アイテム');
  await page.click('[data-action="save-item-form"]');
  await page.waitForTimeout(2500);

  const saved = await page.evaluate(() => {
    const img = document.querySelector('#content-tops li img');
    return img ? img.src.slice(0, 40) : null;
  });
  ok('保存したアイテムがクローゼットに表示される', Boolean(saved), saved || '(画像なし)');

  await page.reload();
  await page.waitForTimeout(2500);
  await page.click('[data-action="open-closet"]');
  await page.waitForTimeout(1500);
  const names = await page.textContent('#content-tops');
  ok('リロード後も保存した写真が残る', names.includes('容量テスト用アイテム'));
}

ok('JSエラーが発生していない', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
