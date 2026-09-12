/**
 * 文字色と背景色のコントラスト比（WCAG 2.1 AA）を検証する。
 *
 * 通常サイズは 4.5:1、大きい文字（24px 以上、または太字18.66px 以上）は 3:1 が基準。
 * 目視では見落とすため自動で全画面を走査する。
 *
 *   npm run build && npm run preview   # 別ターミナル
 *   node tests/contrast.mjs
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 420, height: 880 } });

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
await context.route('**/images.unsplash.com/**', (route) => route.abort());
await context.route('**/placehold.co/**', (route) => route.abort());

const page = await context.newPage();
await page.goto(BASE_URL);
await page.waitForTimeout(2500);

const AUDIT = `(() => {
  // Tailwind v4 は色を oklch() で出力するため、正規表現では解釈できない。
  // canvas に 1px 描いて実際の RGBA を読み出す（あらゆる CSS 色表記に対応する）。
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const toRgb = (cssColor) => {
    if (!cssColor) return null;
    // fillStyle は無効な値を代入すると前の値を保持する。
    // 異なる初期値で2回試し、結果が一致したときだけ有効な色とみなす。
    ctx.fillStyle = '#000000';
    ctx.fillStyle = cssColor;
    const first = ctx.fillStyle;
    ctx.fillStyle = '#ffffff';
    ctx.fillStyle = cssColor;
    if (first !== ctx.fillStyle) return null;

    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };

  const luminance = ({ r, g, b }) => {
    const channel = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  const blend = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });

  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  /** グラデーションから色停止点を抜き出す（最も不利な停止点で判定するため） */
  const gradientStops = (backgroundImage) => {
    if (!backgroundImage || !backgroundImage.includes('gradient')) return [];
    const stops = [];
    // oklch() / oklab() / lab() / color() / rgb() などの関数形と16進数を拾う。
    // 裸の単語（to, bottom, in, oklab …）は色ではないので対象にしない。
    const pattern = /((?:ok)?(?:lch|lab)\\([^)]*\\)|rgba?\\([^)]*\\)|hsla?\\([^)]*\\)|color\\([^)]*\\)|#[0-9a-fA-F]{3,8})/g;
    for (const match of backgroundImage.match(pattern) || []) {
      const color = toRgb(match);
      if (color && color.a > 0) stops.push(color);
    }
    return stops;
  };

  /** 祖先をたどって、実際に見えている背景色の候補を集める */
  const backgroundCandidates = (element) => {
    const layers = [];
    let current = element;
    let opaqueFound = false;

    while (current && current.nodeType === 1 && !opaqueFound) {
      const style = getComputedStyle(current);
      const stops = gradientStops(style.backgroundImage);
      if (stops.length) {
        layers.push(stops);
        if (stops.every((stop) => stop.a === 1)) opaqueFound = true;
      }
      if (!opaqueFound) {
        const color = toRgb(style.backgroundColor);
        if (color && color.a > 0) {
          layers.push([color]);
          if (color.a === 1) opaqueFound = true;
        }
      }
      current = current.parentElement;
    }
    if (!opaqueFound) layers.push([{ r: 255, g: 255, b: 255, a: 1 }]);

    // 上の層から順に合成する。グラデーションは停止点ごとに分岐させる
    let results = [{ r: 255, g: 255, b: 255, a: 1 }];
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const next = [];
      for (const base of results) {
        for (const layer of layers[i]) next.push(blend(layer, base));
      }
      results = next;
    }
    return results;
  };

  const failures = [];
  for (const element of document.querySelectorAll('body *:not(script):not(style):not(svg):not(path)')) {
    const text = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent.trim())
      .join('')
      .trim();
    if (!text) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (element.closest('[inert], .hidden, .sr-only')) continue;
    if (element.classList.contains('sr-only')) continue;

    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;

    const fg = toRgb(style.color);
    if (!fg) continue;

    // 親の opacity も文字の見え方に効く
    let effectiveAlpha = fg.a;
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      effectiveAlpha *= Number(getComputedStyle(node).opacity);
    }
    const textColor = { ...fg, a: effectiveAlpha };

    const size = parseFloat(style.fontSize);
    const weight = parseInt(style.fontWeight, 10) || 400;
    const isLarge = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = isLarge ? 3 : 4.5;

    // グラデーション上では最も不利な地点で判定する
    let worst = Infinity;
    let worstBg = null;
    for (const bg of backgroundCandidates(element)) {
      const value = ratio(blend(textColor, bg), bg);
      if (value < worst) { worst = value; worstBg = bg; }
    }

    if (worst + 0.05 < required) {
      failures.push({
        text: text.slice(0, 24),
        color: style.color,
        background: worstBg ? \`rgb(\${Math.round(worstBg.r)}, \${Math.round(worstBg.g)}, \${Math.round(worstBg.b)})\` : '?',
        size: Math.round(size),
        weight,
        ratio: Number(worst.toFixed(2)),
        required,
      });
    }
  }
  return failures;
})()`;

const screens = [
  { name: 'ホーム', open: null },
  { name: '提案結果', open: '#gacha-btn', wait: '#result-screen:not(.hidden)' },
  { name: 'ショップ', open: '#result-screen [data-action="open-shop"]', wait: '#shop-screen:not(.hidden)' },
  { name: 'クローゼット', open: null, custom: true },
  { name: 'カレンダー', open: null, custom: true },
];

const allFailures = [];

async function audit(label) {
  const failures = await page.evaluate(AUDIT);
  if (failures.length) allFailures.push({ label, failures });
  console.log(`${failures.length ? '❌' : '✅'} ${label}${failures.length ? ` — ${failures.length}件` : ''}`);
  for (const f of failures) {
    console.log(`     "${f.text}" ${f.size}px/${f.weight} ${f.color} → ${f.ratio}:1 (必要 ${f.required}:1)`);
  }
}

await audit('ホーム');

await page.click('#gacha-btn');
await page.waitForSelector('#result-screen:not(.hidden)');
await page.waitForTimeout(400);
await audit('提案結果');

await page.click('#result-screen [data-action="open-shop"]');
await page.waitForTimeout(700);
await audit('ショップ');
await page.click('#shop-screen [data-action="back"]');
await page.waitForTimeout(200);
await page.click('#result-screen [data-action="back"]');
await page.waitForTimeout(200);

await page.click('[data-action="open-closet"]');
await page.waitForTimeout(800);
await audit('クローゼット');
await page.click('#closet-screen [data-action="back"]');
await page.waitForTimeout(200);

await page.click('[data-action="open-calendar"]');
await page.waitForTimeout(800);
await audit('カレンダー');

const total = allFailures.reduce((sum, entry) => sum + entry.failures.length, 0);
console.log(total === 0
  ? '\n✅ 全画面で WCAG AA のコントラスト比を満たしています'
  : `\n❌ 基準を満たさない箇所が ${total}件`);

await browser.close();
process.exit(total === 0 ? 0 : 1);
