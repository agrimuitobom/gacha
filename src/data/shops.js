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
 */

const PLACEHOLDER = 'https://placehold.co/200x200/e2e8f0/475569?text=';

const SHOPS = [
  {
    id: 'minami',
    name: 'minami',
    // TODO: 店舗の座標が分かったら { lat: ..., lon: ... } を入れる
    location: null,
    hours: { open: '10:00', close: '19:00' },
    url: 'https://saijo.mypl.net/shop/00000379236/',
    items: [
      { name: 'ルーズシャツ', price: 4900, imageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=200&q=80', fallback: `${PLACEHOLDER}Shirt` },
      { name: 'ニットベスト', price: 5500, imageUrl: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=200&q=80', fallback: `${PLACEHOLDER}Knit` },
      { name: 'デニムスカート', price: 6800, imageUrl: 'https://images.unsplash.com/photo-1582552938357-32b906df40cb?auto=format&fit=crop&w=200&q=80', fallback: `${PLACEHOLDER}Skirt` },
    ],
  },
  {
    id: 'camarade',
    name: 'キャマラド',
    // TODO: 店舗の座標が分かったら { lat: ..., lon: ... } を入れる
    location: null,
    hours: { open: '11:00', close: '18:00' },
    url: 'https://instagram.com/0125camarade/',
    items: [
      { name: 'ワンピース', price: 8900, imageUrl: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=200&q=80', fallback: `${PLACEHOLDER}Dress` },
      { name: 'ブラウス', price: 6000, imageUrl: 'https://images.unsplash.com/photo-1564257631407-4deb1f99d992?auto=format&fit=crop&w=200&q=80', fallback: `${PLACEHOLDER}Blouse` },
      { name: 'カーディガン', price: 7200, imageUrl: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=200&q=80', fallback: `${PLACEHOLDER}Cardigan` },
    ],
  },
];

export const shopRepo = {
  async list() {
    return SHOPS;
  },
};

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
