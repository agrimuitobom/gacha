/**
 * 周辺の服屋を Google マップで検索するためのリンク。
 *
 * 以前はここに Haversine 式の距離計算（distanceKm / formatDistance）もあったが、
 * 距離を表示していたショップ画面ごと無くなり、呼び出し元が消えたため削除した。
 */

/** マップで検索する語。ホームのボタン（服屋を探す）に合わせる */
const SHOP_QUERY = '服屋';

/** 地図の縮尺。14z でおおよそ街ひとつぶんが入る */
const MAPS_ZOOM = 14;

/**
 * 周辺の服屋を Google マップで検索する URL。
 *
 * Places API を使わずリンクで済ませているので、APIキーも請求先アカウントも要らず、
 * 取得データを保存できないという ToS の制約にも触れない。営業時間や距離も
 * マップ側の情報をそのまま見てもらう（手入力より正確で、古くならない）。
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
