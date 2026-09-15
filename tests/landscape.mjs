/**
 * 横向き（高さの足りない画面）でレイアウトが破綻していないかを検証する。
 *
 * このアプリは縦向き前提で作られていて、横画面では枠の高さが 344〜374px まで
 * 潰れる。それでも中身は縦向きのままだったため、ホームで 163〜193px はみ出し、
 * クローゼットと服屋を探すのボタンが画面の外にあった。
 *
 * 皮肉なことに、横画面ではガチャボタンが 192px → 208px と大きくなっていた。
 * sm: が幅 640px 以上で効くためで、制約が高さなのにサイズを幅で決めていた。
 * いまは styles.css の short:（max-height: 600px）で分岐している。
 *
 *   npm run build && node scripts/serve-and-run.js -- node tests/landscape.mjs
 */
import { launchChromium } from './browser.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173/';

/** 横画面で最も厳しいあたり。iPhone の横と、それより小さい端末 */
const SIZES = [
  { name: 'iPhone横', w: 844, h: 390 },
  { name: '小型機横', w: 740, h: 360 },
];

/** 画面ごとの「押せないと詰む操作」。一覧は伸びてよいが、これらは枠内に居ること */
const SCREENS = [
  { id: 'home-screen', name: 'ホーム', open: null,
    must: ['#gacha-btn', '[data-action="open-closet"]', '[data-find-shops]', '[data-action="open-settings"]'] },
  { id: 'result-screen', name: '提案結果', open: '#gacha-btn',
    must: ['[data-action="regacha"]', '[data-action="decide-outfit"]', '#result-screen [data-action="back"]'] },
  { id: 'closet-screen', name: 'クローゼット', open: '[data-action="open-closet"]',
    must: ['#closet-screen [data-action="back"]', '[data-action="open-camera"]', '#tab-tops'] },
  { id: 'calendar-screen', name: 'カレンダー', open: '[data-action="open-calendar"]',
    must: ['#calendar-screen [data-action="back"]'] },
  { id: 'settings-screen', name: '設定', open: '[data-action="open-settings"]',
    must: ['#settings-screen [data-action="back"]'] },
];

const results = [];
const ok = (name, passed, detail = '') =>
  results.push(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

const browser = await launchChromium();

for (const size of SIZES) {
  const context = await browser.newContext({
    viewport: { width: size.w, height: size.h }, reducedMotion: 'reduce',
  });
  await context.route('**/api.open-meteo.com/**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        current_weather: { temperature: 24, weathercode: 61, time: '2026-09-15T12:00' },
        hourly: { time: ['2026-09-15T12:00'], precipitation_probability: [90] },
      }),
    })
  );
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForTimeout(2500);

  /** 枠からはみ出している操作を返す */
  const outside = (selectors) => page.evaluate((list) => {
    const frame = document.getElementById('app-frame').getBoundingClientRect();
    return list.filter((sel) => {
      const el = document.querySelector(sel);
      if (!el) return true;
      const box = el.getBoundingClientRect();
      return box.width === 0 || box.height === 0
        || box.bottom > frame.bottom + 1 || box.top < frame.top - 1;
    });
  }, selectors);

  for (const screen of SCREENS) {
    if (screen.open) {
      await page.click(screen.open);
      await page.waitForTimeout(1200);
    }
    const hidden = await outside(screen.must);
    ok(`${size.name} ${screen.name}: 主要な操作が枠内にある`,
      hidden.length === 0, hidden.join(', '));
    if (screen.open) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(700);
    }
  }

  /* ホームは縦にスクロールさせずに収まりきること（一覧が無いので伸びる理由が無い） */
  const homeOverflow = await page.evaluate(() => {
    const home = document.getElementById('home-screen');
    return home.scrollHeight - home.clientHeight;
  });
  ok(`${size.name} ホーム: スクロールせずに収まる`, homeOverflow <= 0, `${homeOverflow}px はみ出し`);

  /* インストール案内が出ても収まること（beforeinstallprompt を模擬する） */
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    event.prompt = () => {};
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  await page.waitForTimeout(500);
  const withBanner = await outside(['#gacha-btn', '[data-action="open-closet"]', '[data-find-shops]']);
  ok(`${size.name} ホーム: インストール案内が出ても操作が隠れない`,
    withBanner.length === 0, withBanner.join(', '));

  /* 縮めた結果、指で押せない大きさになっていないか（44px 以上） */
  const small = await page.evaluate(() => {
    const seen = [];
    for (const el of document.querySelectorAll('#home-screen button, #home-screen a[data-find-shops], #install-banner button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 44 || r.height < 44) seen.push(`${el.dataset.action || el.id || el.tagName}:${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return seen;
  });
  ok(`${size.name} ホーム: タップ対象が44px以上`, small.length === 0, small.join(', '));

  /* 幅で分岐していたせいで横画面のほうが大きくなる、が直っているか */
  const gacha = await page.evaluate(() => document.getElementById('gacha-btn').clientWidth);
  ok(`${size.name}: ガチャボタンが縦向き(192px)より小さい`, gacha < 192, `${gacha}px`);

  await context.close();
}

/* 縦向きでは従来どおりであること（short: が効きすぎていないか） */
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.route('**/api.open-meteo.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({
        current_weather: { temperature: 24, weathercode: 0, time: '2026-09-15T12:00' },
        hourly: { time: ['2026-09-15T12:00'], precipitation_probability: [0] } }) })
  );
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForTimeout(2500);

  const state = await page.evaluate(() => ({
    gacha: document.getElementById('gacha-btn').clientWidth,
    // 説明文は横画面でだけ畳む
    lead: document.querySelector('#home-screen p.leading-relaxed')?.offsetParent !== null,
    overflow: document.getElementById('home-screen').scrollHeight
      - document.getElementById('home-screen').clientHeight,
  }));
  ok('縦向き: ガチャボタンは 192px のまま', state.gacha === 192, `${state.gacha}px`);
  ok('縦向き: 説明文は表示されたまま', state.lead === true);
  ok('縦向き: はみ出していない', state.overflow <= 0, `${state.overflow}px`);
  await context.close();
}

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
