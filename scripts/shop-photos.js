/**
 * 店舗の商品写真を、表示に必要なサイズまで縮めて public/shops/ に置く。
 *
 *   npm run shop:photos -- <店舗ID> <画像ファイル...>
 *   npm run shop:photos -- minami ~/Desktop/shirt.jpg ~/Desktop/knit.jpg
 *
 * 元の写真はそのまま残る（このスクリプトは読むだけ）。
 * 変換後のファイルだけをコミットすること。
 *
 * 載せてよいのは、店舗の許可を得た写真か自分で撮影した写真だけ。
 * 店舗のサイトや SNS の写真を許可なく転載しないこと。
 */
import { mkdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { shopsForTest } from '../src/data/shops.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 書き出す一辺の長さ。
 *
 * 画面に出るのは 80 CSS px の正方形（src/ui/shop.js の w-20 h-20）。
 * DPR 4 の端末でも 320px あれば足りる。これ以上大きくしても見た目は
 * 変わらず、通信量とプリキャッシュの容量だけが増える。
 * 変更したら tests/shop-photos.mjs の MAX_EDGE も揃えること。
 */
const EDGE = 320;
const QUALITY = 80;

const [shopId, ...files] = process.argv.slice(2);

function usage(message) {
  console.error(`${message}

  使い方: npm run shop:photos -- <店舗ID> <画像ファイル...>
  店舗ID: ${shopsForTest.map((shop) => shop.id).join(', ')}`);
  process.exit(1);
}

if (!shopId) usage('店舗IDを指定してください。');
if (!shopsForTest.some((shop) => shop.id === shopId)) {
  usage(`店舗ID "${shopId}" は src/data/shops.js にありません。`);
}
if (files.length === 0) usage('変換する画像ファイルを1つ以上指定してください。');

const outDir = resolve(root, 'public/shops', shopId);
await mkdir(outDir, { recursive: true });

const written = [];

for (const file of files) {
  const inputPath = resolve(process.cwd(), file);
  // 拡張子を除いたファイル名をそのまま使う（shops.js に書く photo の値になる）
  const name = basename(inputPath, extname(inputPath))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!name) {
    console.error(`✗ ${file} — 英数字を含むファイル名にしてください`);
    process.exitCode = 1;
    continue;
  }

  const outPath = resolve(outDir, `${name}.webp`);

  try {
    const before = (await stat(inputPath)).size;
    await sharp(inputPath)
      // スマホの写真は EXIF に回転情報が入る。無視すると横倒しで保存される
      .rotate()
      // 画面側が object-cover で正方形に切るので、ここで同じように切っておく
      .resize(EDGE, EDGE, { fit: 'cover', position: 'attention' })
      .webp({ quality: QUALITY })
      .toFile(outPath);

    const after = (await stat(outPath)).size;
    written.push(`${name}.webp`);
    console.log(
      `✓ ${basename(inputPath)} → public/shops/${shopId}/${name}.webp` +
      `  ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`
    );
  } catch (err) {
    console.error(`✗ ${file} — ${err.message}`);
    process.exitCode = 1;
  }
}

if (written.length === 0) process.exit(process.exitCode || 1);

console.log(`
src/data/shops.js の "${shopId}" の items に貼り、商品名と価格を実物に合わせてください。
（価格が分からない・変動するものは price: null にすると、価格を表示しません）

    items: [
${written.map((photo) => `      { photo: '${photo}', name: '', price: null },`).join('\n')}
    ],

貼り終えたら npm run test:shop で確認できます。`);
