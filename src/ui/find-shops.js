import { mapsSearchUrl } from '../domain/geo.js';
import { state } from '../state.js';

/**
 * 「服屋を探す」のリンク先を現在地に合わせて更新する。
 *
 * HTML には中心を指定しない URL を直接書いてあるので、JS が動かなくても
 * リンクとしては成立する（マップ側が端末の位置情報で検索する）。
 * こちらが現在地を知っていれば、地図の中心をその場所に差し替える。
 *
 * ボタン＋window.open ではなく <a> の href を書き換えているのは、
 * 位置情報の取得を挟んでから開くと操作との紐づきが切れ、
 * ポップアップブロックに当たることがあるため。
 */
export function updateFindShopsLinks() {
  const href = mapsSearchUrl(state.lastPosition);
  for (const link of document.querySelectorAll('[data-find-shops]')) {
    link.href = href;
  }
}
