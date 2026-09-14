/**
 * 周辺の服屋。
 *
 * 現在は静的データだが、形状は Firestore のコレクションに合わせてある。
 * 将来サーバ管理へ移す場合は shopRepo.list() の中身を差し替えるだけでよい。
 *   shops/{shopId}
 *     { name, location: { lat, lon } | null, hours: { open, close }, url, items: [...] }
 *
 * location は店舗の座標。入れておくと現在地からの直線距離を表示する。
 * 分からないまま適当な値を入れると、もっともらしく間違った距離が出るので、
 * 不明なうちは null にしておくこと（距離は表示されない）。
 *
 * ---------------------------------------------------------------------------
 * items（店頭の商品）について
 * ---------------------------------------------------------------------------
 * ここは実在する店舗の情報を載せる場所なので、商品名・価格・写真は
 * 実物だけを入れること。以前はストックフォトと架空の商品名・価格が
 * 入っていたが、実在の店名とリンクの隣に並ぶと、利用者には本物の
 * 品揃えと区別がつかない。分からないものは空のままにしておく
 * （items が空なら、画面には「商品の写真は準備中です」と出る）。
 *
 * 写真は店舗の許可を得たもの、または自分で撮影したものに限る。
 * 店舗のサイトや SNS の写真を許可なく転載しないこと。
 *
 * 追加のしかた:
 *   1. 写真を所定のサイズへ変換して public/shops/<店舗ID>/ に置く
 *        npm run shop:photos -- minami ~/Desktop/shirt.jpg
 *      （実行すると、下に貼り付ける items の雛形も出力される）
 *   2. その出力を items に貼り、name と price を実物に合わせて直す
 *
 *   items: [
 *     { photo: 'shirt.webp', name: '（実物の商品名）', price: 4900 },
 *     // 価格が分からない・変動するものは price: null（価格を表示しない）
 *     { photo: 'knit.webp', name: '（実物の商品名）', price: null },
 *   ],
 *
 * 宣言した写真が実在するか、サイズが上限内かは tests/shop-photos.mjs が
 * 検証する（npm run test:shop）。ファイル名を間違えたまま公開されることはない。
 */

/** 写真の置き場所。public/ 配下なので Hosting からそのまま配信される */
const PHOTO_BASE = '/shops';

const SHOPS = [
  {
    id: 'minami',
    name: 'minami',
    // TODO: 店舗の座標が分かったら { lat: ..., lon: ... } を入れる
    location: null,
    hours: { open: '10:00', close: '19:00' },
    url: 'https://saijo.mypl.net/shop/00000379236/',
    // TODO: 実物の写真と商品名・価格が用意できたら追加する
    items: [],
  },
  {
    id: 'camarade',
    name: 'キャマラド',
    // TODO: 店舗の座標が分かったら { lat: ..., lon: ... } を入れる
    location: null,
    hours: { open: '11:00', close: '18:00' },
    url: 'https://instagram.com/0125camarade/',
    // TODO: 実物の写真と商品名・価格が用意できたら追加する
    items: [],
  },
];

/** 店舗IDから写真ディレクトリのURLを組み立てる（テストからも使う） */
export const photoUrlFor = (shopId, photo) => `${PHOTO_BASE}/${shopId}/${photo}`;

export const shopRepo = {
  async list() {
    return SHOPS.map((shop) => ({
      ...shop,
      items: shop.items.map((item) => ({ ...item, photoUrl: photoUrlFor(shop.id, item.photo) })),
    }));
  },
};

/** 検証用。UI を通さずに宣言そのものを見たいとき（tests/shop-photos.mjs） */
export const shopsForTest = SHOPS;

/**
 * 営業中かどうかを現在時刻から判定する。
 * 以前は「営業中」がマークアップに直書きされており、
 * 深夜に開いても営業中と表示されていた。
 */
export function isOpenNow(hours, now = new Date()) {
  const toMinutes = (text) => {
    const [hour, minute] = text.split(':').map((part) => parseInt(part, 10));
    return hour * 60 + minute;
  };
  const current = now.getHours() * 60 + now.getMinutes();
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);

  // 日付をまたぐ営業時間（例 22:00〜02:00）にも対応する
  return close > open ? current >= open && current < close : current >= open || current < close;
}

export const formatPrice = (yen) => `¥${yen.toLocaleString('ja-JP')}`;
