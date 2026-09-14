/** 地球の半径（km）。距離計算に使う */
const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * 2地点間の直線距離（km）を Haversine 式で求める。
 * 実際の道のりではなく直線距離なので、表示にもその旨を添えること。
 */
export function distanceKm(from, to) {
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  return `${km.toFixed(1)} km`;
}

/* ---------------------------------------------------------------------------
 * Google マップでの周辺検索
 * ------------------------------------------------------------------------- */

/** マップで検索する語。アプリ内の呼び方（周辺の服屋）に合わせる */
const SHOP_QUERY = '服屋';

/** 地図の縮尺。14z でおおよそ街ひとつぶんが入る */
const MAPS_ZOOM = 14;

/**
 * 周辺の服屋を Google マップで検索する URL。
 *
 * Places API を使わずリンクで済ませているので、APIキーも請求先アカウントも要らず、
 * 取得データを保存できないという ToS の制約にも触れない。そのぶん距離や営業状況は
 * マップ側の表示に委ねる。
 *
 * 現在地が分かっていれば地図の中心に指定する。分からなければ中心を指定せずに開き、
 * マップ側が端末の位置情報を使う（スマホではこれで足りることが多い）。
 *
 * @param {{lat: number, lon: number}|null} position 現在地。不明なら null
 */
export function mapsSearchUrl(position) {
  const query = encodeURIComponent(SHOP_QUERY);

  // 公式の Maps URLs API。中心は指定できない
  if (!position) return `https://www.google.com/maps/search/?api=1&query=${query}`;

  // 中心を指定できるのはこの形式だけ。公式ドキュメントには無いが、
  // マップ自身が出す URL と同じ形で、スマホではアプリが開く。
  return `https://www.google.com/maps/search/${query}/@${position.lat},${position.lon},${MAPS_ZOOM}z`;
}
