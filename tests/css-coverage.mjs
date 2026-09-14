/**
 * Tailwind v4 へ移行したことで、使っているユーティリティクラスが
 * 静かに消えていないかを検証する。
 *
 * v3 で使えたが v4 で名前が変わった（shadow-inner → inset-shadow-*,
 * bg-gradient-to-* → bg-linear-to-* など）クラスを見落とすと、
 * エラーも出ないまま見た目だけ壊れるため、ビルド済み CSS に
 * 実際にセレクタが存在するかを突き合わせる。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const distAssets = resolve('dist/assets');
const cssFile = readdirSync(distAssets).find((file) => file.endsWith('.css'));
if (!cssFile) {
  console.error('dist にCSSがありません。先に `npm run build` を実行してください。');
  process.exit(1);
}
const css = readFileSync(resolve(distAssets, cssFile), 'utf8');

/** 妥当なクラス名の形をしているか（JS式の断片を弾く） */
const CLASS_NAME = /^-?[a-zA-Z][-a-zA-Z0-9_:/.[\]()%!#,]*$/;

function collectClassNames() {
  const names = new Set();
  const sources = [
    'index.html',
    ...readdirSync('src', { recursive: true })
      .filter((file) => typeof file === 'string' && file.endsWith('.js'))
      .map((file) => `src/${file}`),
  ];

  for (const path of sources) {
    const source = readFileSync(path, 'utf8');
    const patterns = [
      /class="([^"]*)"/g,          // HTML
      /class:\s*`([^`]*)`/g,       // h() のテンプレートリテラル
      /class:\s*'([^']*)'/g,       // h() の文字列
      /className\s*\+?=\s*['"`]([^'"`]*)['"`]/g,
      /classList\.(?:add|remove|toggle|replace)\(\s*((?:['"][^'"]*['"]\s*,?\s*)+)/g,
    ];

    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        // テンプレートリテラルの ${...} の中には、
        //   `... ${available ? 'border-gray-100' : 'border-dashed'}`
        // のように条件で切り替わるクラス名が入る。式ごと捨てると
        // それらが検査されなくなるので、中の文字列リテラルだけ拾う。
        const literals = match[1].replace(/\$\{[\s\S]*?\}/g, ' ');
        const inExpressions = [...match[1].matchAll(/\$\{([\s\S]*?)\}/g)]
          .flatMap(([, expr]) => [...expr.matchAll(/'([^']*)'|"([^"]*)"/g)])
          .map(([, single, double]) => single ?? double)
          .join(' ');
        const chunk = `${literals} ${inExpressions}`.replace(/['"]/g, ' ');
        for (const raw of chunk.split(/\s+/)) {
          const name = raw.trim();
          if (!name || name.includes('${')) continue;
          if (!CLASS_NAME.test(name)) continue;
          names.add(name);
        }
      }
    }
  }
  return names;
}

/** アプリ独自のクラス（Tailwind のユーティリティではない） */
const NON_UTILITY = new Set([
  'schedule-input-row', 'schedule-time-input', 'schedule-title-input',
  'schedule-edit-time', 'schedule-edit-title', 'group',
]);

/** Tailwind はセレクタ内の記号を \ でエスケープして出力する */
function cssSelectorFor(name) {
  return '.' + name.replace(/([.:/[\]()%!#,])/g, '\\$1');
}

const all = collectClassNames();
const missing = [];

for (const name of all) {
  if (NON_UTILITY.has(name)) continue;
  if (!css.includes(cssSelectorFor(name))) missing.push(name);
}

if (missing.length === 0) {
  console.log(`✅ 使用中の ${all.size} クラスすべてが CSS に生成されています (${cssFile})`);
  process.exit(0);
}

console.log(`❌ CSS に生成されていないクラス ${missing.length}件 / 全${all.size}件:`);
for (const name of missing.sort()) console.log('  -', name);
process.exit(1);
