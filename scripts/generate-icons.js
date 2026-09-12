/**
 * PWA 用アイコンを SVG から生成する。
 * 生成物は public/ 配下に出力され、そのままリポジトリにコミットされる
 * （ビルド時に sharp を必須にしないため）。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');

/** ハンガーのグリフ。glyphScale で安全領域（マスカブル用）を調整する */
function buildSvg({ size, glyphScale = 0.62, rounded = true }) {
  const radius = rounded ? size * 0.22 : 0;
  const c = size / 2;
  const s = size * glyphScale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ec4899"/>
      <stop offset="55%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#6366f1"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <g transform="translate(${c} ${c}) scale(${s / 100}) translate(-50 -50)"
     fill="none" stroke="#ffffff" stroke-width="7"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="M50 34 v8"/>
    <path d="M50 34 a8 8 0 1 1 8 -8"/>
    <path d="M50 42 L14 66 a3 3 0 0 0 2 5 h68 a3 3 0 0 0 2 -5 Z"/>
  </g>
</svg>`;
}

const TARGETS = [
  { file: 'icons/icon-192.png', size: 192, glyphScale: 0.62, rounded: true },
  { file: 'icons/icon-512.png', size: 512, glyphScale: 0.62, rounded: true },
  // maskable は端末側で最大 20% 削られるため、グリフを小さめにして中央に寄せる
  { file: 'icons/maskable-512.png', size: 512, glyphScale: 0.45, rounded: false },
  { file: 'icons/apple-touch-icon.png', size: 180, glyphScale: 0.62, rounded: false },
];

for (const target of TARGETS) {
  const svg = buildSvg(target);
  const outPath = resolve(publicDir, target.file);
  await mkdir(dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log(`generated ${target.file} (${target.size}x${target.size})`);
}

await writeFile(resolve(publicDir, 'favicon.svg'), buildSvg({ size: 64, glyphScale: 0.66 }), 'utf8');
console.log('generated favicon.svg');
