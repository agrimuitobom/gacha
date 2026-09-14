/**
 * 店舗の商品写真を検証する。
 *
 * ここは実在する店名・リンクの隣に並ぶ場所なので、
 *  - 宣言した写真が実際に存在すること（タイポのまま公開されない）
 *  - 表示に必要な以上に大きくないこと（無料枠と通信量）
 *  - 架空の商品やストックフォトが混ざっていないこと
 * を確かめる。写真がまだ1枚も無い状態でも通る（それが正しい初期状態）。
 *
 *   npm run test:shop
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { shopsForTest, photoUrlFor } from '../src/data/shops.js';

/** 一辺の上限。scripts/shop-photos.js の EDGE と揃えること */
const MAX_EDGE = 320;
/** 1枚あたりの上限バイト数。320px/WebP なら実測 11KB 程度（ノイズ画像の最悪ケース） */
const MAX_BYTES = 60 * 1024;

const PUBLIC_SHOPS = resolve('public/shops');

const results = [];
/** detail は事実、hint は落ちたときだけ出す直し方 */
const ok = (name, passed, detail = '', hint = '') =>
  results.push(
    `${passed ? '✅' : '❌'} ${name}` +
    (detail ? ` — ${detail}` : '') +
    (!passed && hint ? ` — ${hint}` : '')
  );

/* ---------- 宣言そのものの検証 ---------- */

const declared = new Map(); // 店舗ID -> Set<ファイル名>

for (const shop of shopsForTest) {
  const names = new Set();
  for (const item of shop.items) {
    ok(`${shop.id}: photo が指定されている`, typeof item.photo === 'string' && item.photo.length > 0);
    ok(`${shop.id}/${item.photo}: 商品名が入っている`,
      typeof item.name === 'string' && item.name.trim().length > 0,
      '', '実物の商品名を入れること（空欄のまま公開しない）');
    ok(`${shop.id}/${item.photo}: 価格が正しい形`,
      item.price === null || (typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0),
      String(item.price), '分からない価格は null にする（0 や推測値を入れない）');
    ok(`${shop.id}: ${item.photo} の宣言が重複していない`, !names.has(item.photo));
    names.add(item.photo);
  }
  declared.set(shop.id, names);
}

/* ---------- 実ファイルの検証 ---------- */

/** public/shops/<店舗ID>/ にあるファイル一覧。無ければ空 */
async function filesIn(shopId) {
  try {
    return await readdir(resolve(PUBLIC_SHOPS, shopId));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

for (const shop of shopsForTest) {
  const present = new Set(await filesIn(shop.id));

  for (const photo of declared.get(shop.id)) {
    if (!present.has(photo)) {
      ok(`${shop.id}: ${photo} が public/shops/${shop.id}/ にある`, false,
        `実際にあるファイル: ${[...present].join(', ') || '(なし)'}`,
        'npm run shop:photos で変換したファイル名と合っているか確認すること');
      continue;
    }

    const path = resolve(PUBLIC_SHOPS, shop.id, photo);
    const bytes = (await stat(path)).size;
    const meta = await sharp(path).metadata();

    ok(`${shop.id}/${photo}: 形式が WebP`, meta.format === 'webp', meta.format);
    ok(`${shop.id}/${photo}: ${MAX_EDGE}px 以内`,
      meta.width <= MAX_EDGE && meta.height <= MAX_EDGE, `${meta.width}x${meta.height}`);
    ok(`${shop.id}/${photo}: ${MAX_BYTES / 1024}KB 以内`,
      bytes <= MAX_BYTES, `${(bytes / 1024).toFixed(1)}KB`);
  }

  // 宣言されていないファイルが残っていると、使われないまま配信・プリキャッシュされる
  for (const file of present) {
    if (file.startsWith('.')) continue;
    ok(`${shop.id}: ${file} が shops.js から参照されている`,
      declared.get(shop.id).has(file),
      '', 'items に追加するか、使わないならファイルを削除すること');
  }
}

/* ---------- 架空データの退行防止 ---------- */

// 以前は imageUrl / fallback に外部のストックフォト（Unsplash・placehold.co）を
// 入れていた。ホスト名で検査すると別のサービスに替えられたときに素通りするので、
// 「外部URLを持つ項目が1つも無い」ことを構造として確かめる。
const externalRefs = shopsForTest.flatMap((shop) =>
  shop.items.flatMap((item) =>
    Object.entries(item)
      .filter(([, value]) => typeof value === 'string' && /^https?:/i.test(value))
      .map(([key, value]) => `${shop.id}.${key}=${value}`)
  )
);
ok('商品に外部URLを持たせていない', externalRefs.length === 0, externalRefs.slice(0, 2).join(' | '));

ok('商品写真は public/shops 配下だけを指している',
  shopsForTest.every((shop) =>
    shop.items.every((item) => photoUrlFor(shop.id, item.photo).startsWith('/shops/'))));

// 配信先そのものの退行も見る（CSP から外部の画像ホストを外したので、
// ここが戻ると画像が CSP に止められて無言で消える）
const csp = JSON.parse(await readFile('firebase.json', 'utf8'))
  .hosting.headers.flatMap((rule) => rule.headers)
  .find((header) => header.key === 'Content-Security-Policy')?.value || '';
const imgSrc = csp.match(/img-src ([^;]*)/)?.[1] || '';
ok('CSP の img-src に外部の画像ホストが戻っていない',
  !/unsplash|placehold|pexels|pixabay/i.test(imgSrc), imgSrc.trim());

const total = shopsForTest.reduce((sum, shop) => sum + shop.items.length, 0);
if (total === 0) {
  console.log('ℹ️  商品写真はまだ登録されていません（画面には「準備中」と表示されます）。');
  console.log('   追加: npm run shop:photos -- <店舗ID> <画像ファイル...>\n');
}

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed（商品 ${total} 件）`);
process.exit(failed === 0 ? 0 : 1);
