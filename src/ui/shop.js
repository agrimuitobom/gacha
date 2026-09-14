import { h, $ } from './dom.js';
import { icon } from './icons.js';
import { shopRepo, isOpenNow, formatPrice } from '../data/shops.js';
import { distanceKm, formatDistance, mapsSearchUrl } from '../domain/geo.js';
import { state } from '../state.js';
import { getCurrentPosition } from '../domain/weather.js';
import { showToast } from './toast.js';

function shopItem(item) {
  return h('li', { class: 'shrink-0 w-20 flex flex-col items-center gap-1' },
    h('div', { class: 'w-20 h-20 rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-100' },
      h('img', {
        src: item.photoUrl,
        alt: item.name,
        // 表示は 80x80 固定なので、端末に幅を推測させない
        width: '80',
        height: '80',
        loading: 'lazy',
        decoding: 'async',
        class: 'w-full h-full object-cover hover:scale-105 transition-transform duration-300',
      })
    ),
    h('span', { class: 'text-xs font-bold text-gray-800 truncate w-full text-center', text: item.name }),
    // 価格が分からない商品は、値段を書かない（0円や「〜円台」と書くと誤解される）
    ...(typeof item.price === 'number'
      ? [h('span', { class: 'text-xs text-pink-700 font-bold', text: formatPrice(item.price) })]
      : [])
  );
}

/**
 * 商品がまだ登録されていない店舗の表示。
 *
 * ここに「それらしい商品」を並べると、実在の店名とリンクの隣にあるぶん、
 * 利用者には本物の品揃えと区別がつかない。無いものは無いと書く。
 */
function itemsPlaceholder() {
  return h('p', { class: 'text-xs text-gray-600 bg-gray-50 rounded-xl px-3 py-2' },
    '商品の写真は準備中です。品揃えは店舗ページをご覧ください。'
  );
}

/**
 * 現在地からの距離。
 * 店舗の座標か現在地のどちらかが分からなければ、距離は出さない。
 * 根拠なく「2.7 km 先」と書くと、事実と違っていても気づけない。
 */
function distanceLabel(shop) {
  if (!shop.location || !state.lastPosition) return null;
  const km = distanceKm(state.lastPosition, shop.location);
  return h('p', { class: 'text-xs text-gray-600 mt-1 flex items-center gap-1' },
    icon('map-pin', 'w-3 h-3'),
    `直線距離 約${formatDistance(km)}`
  );
}

function shopCard(shop) {
  const open = isOpenNow(shop.hours);

  return h('li', { class: 'bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col gap-3' },
    h('div', { class: 'flex justify-between items-start gap-2' },
      h('div', { class: 'min-w-0' },
        h('h3', { class: 'font-bold text-gray-900 text-base', text: shop.name }),
        distanceLabel(shop)
      ),
      h('span', {
        class: open
          ? 'px-2 py-1 bg-green-100 text-green-800 text-[11px] font-bold rounded-full shrink-0'
          : 'px-2 py-1 bg-gray-100 text-gray-700 text-[11px] font-bold rounded-full shrink-0',
        text: open ? '営業中' : '営業時間外',
      })
    ),

    shop.items.length
      ? h('ul', { class: 'flex gap-3 overflow-x-auto no-scrollbar py-1 list-none' },
          ...shop.items.map(shopItem)
        )
      : itemsPlaceholder(),

    h('div', { class: 'flex justify-between items-center mt-1 pt-3 border-t border-gray-100 gap-2' },
      h('p', { class: 'text-xs text-gray-600 flex items-center gap-1' },
        icon('clock', 'w-3 h-3'),
        `${shop.hours.open}〜${shop.hours.close}`
      ),
      h('a', {
        href: shop.url,
        target: '_blank',
        rel: 'noopener noreferrer',
        class: 'px-3 min-h-[44px] bg-gray-900 text-white text-xs font-bold rounded-xl active:bg-gray-700 flex items-center gap-1 shrink-0',
      },
        '詳細',
        h('span', { class: 'sr-only', text: `（${shop.name}、新しいタブで開く）` }),
        icon('external-link', 'w-3 h-3')
      )
    )
  );
}

/**
 * Google マップで周辺の服屋を探す導線。
 *
 * 載せている店舗は手で登録した数軒だけなので、それ以外を探す道を用意する。
 * Places API ではなくリンクにしているのは、APIキーの露出も請求先アカウントも
 * 避けられて、取得データを保存できないという ToS の制約にも触れないため。
 *
 * ボタンではなく <a> にしてある。位置情報の取得を挟んでから window.open すると、
 * 操作との紐づきが切れてポップアップブロックに当たることがある。
 */
function mapsSearchCard() {
  return h('li', { class: 'bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-3' },
    h('span', { class: 'w-9 h-9 shrink-0 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center' },
      icon('map-pin', 'w-5 h-5')
    ),
    h('div', { class: 'min-w-0 flex-1' },
      h('p', { class: 'text-sm font-bold text-gray-900', text: 'ほかのお店を探す' }),
      h('p', { class: 'text-xs text-gray-700 mt-0.5',
        text: state.lastPosition ? '現在地のまわりをマップで検索します' : 'マップで周辺の服屋を検索します' })
    ),
    h('a', {
      href: mapsSearchUrl(state.lastPosition),
      target: '_blank',
      rel: 'noopener noreferrer',
      class: 'shrink-0 px-3 min-h-[44px] bg-gray-900 text-white text-xs font-bold rounded-xl active:bg-gray-700 flex items-center gap-1',
      dataset: { action: 'search-shops-on-maps' },
    },
      'マップで探す',
      h('span', { class: 'sr-only', text: '（Google マップ、新しいタブで開く）' }),
      icon('external-link', 'w-3 h-3')
    )
  );
}

export async function renderShops() {
  const shops = await shopRepo.list();
  const children = shops.map(shopCard);

  children.push(mapsSearchCard());

  // 現在地が分かると、距離の表示（座標のある店舗）とマップ検索の中心が精確になる
  if (!state.lastPosition) {
    children.unshift(
      h('li', { class: 'bg-white p-3 rounded-2xl border border-gray-200 flex items-center gap-2' },
        icon('map-pin', 'w-4 h-4 text-gray-600'),
        h('p', { class: 'flex-1 text-xs text-gray-700', text: '現在地を使うと、近いお店から探せます' }),
        h('button', {
          type: 'button',
          class: 'shrink-0 px-3 min-h-[44px] bg-gray-900 text-white text-xs font-bold rounded-xl active:bg-gray-700',
          dataset: { action: 'locate-shops' },
          text: '現在地を使う',
        })
      )
    );
  }

  $('shop-list').replaceChildren(...children);
}

/** 現在地を取得して距離を出し直す */
export async function locateShops() {
  try {
    const position = await getCurrentPosition();
    state.lastPosition = { lat: position.coords.latitude, lon: position.coords.longitude };
    await renderShops();
  } catch (err) {
    console.warn('位置情報を取得できませんでした:', err.message);
    showToast('位置情報を取得できませんでした', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
  }
}
