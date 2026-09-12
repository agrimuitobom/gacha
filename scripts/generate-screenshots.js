/**
 * manifest の screenshots 用画像を生成する。
 * Android Chrome のリッチなインストールダイアログに表示される。
 *
 * 生成物は public/screenshots/ に出力してコミットする
 * （CI でブラウザを立ち上げ直さなくて済むように）。
 *
 *   npm run build
 *   node scripts/serve-and-run.js -- node scripts/generate-screenshots.js
 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from '../tests/browser.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const OUT_DIR = resolve('public/screenshots');

// manifest の sizes と一致させること
const VIEWPORT = { width: 390, height: 844 };

await mkdir(OUT_DIR, { recursive: true });

const browser = await launchChromium();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
});

// 実在の天気に左右されないよう固定した値を返す
await context.route('**/api.open-meteo.com/**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      current_weather: { temperature: 18.6, weathercode: 61, time: '2026-09-12T12:00' },
      hourly: { time: ['2026-09-12T12:00'], precipitation_probability: [70] },
    }),
  })
);

const page = await context.newPage();
await page.goto(BASE_URL);
await page.waitForTimeout(3000);

async function capture(name) {
  await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`) });
  console.log(`generated screenshots/${name}.png (${VIEWPORT.width}x${VIEWPORT.height})`);
}

await capture('home');

await page.click('#gacha-btn');
await page.waitForSelector('#result-screen:not(.hidden)');
await page.waitForTimeout(600);
await capture('result');

await page.click('#result-screen [data-action="back"]');
await page.waitForTimeout(300);
await page.click('[data-action="open-closet"]');
await page.waitForTimeout(1200);
await capture('closet');

await browser.close();
