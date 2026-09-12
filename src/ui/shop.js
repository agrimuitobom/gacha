import { h, $ } from './dom.js';
import { icon } from './icons.js';
import { shopRepo, isOpenNow, formatPrice } from '../data/shops.js';

function shopItem(item) {
  return h('li', { class: 'shrink-0 w-20 flex flex-col items-center gap-1' },
    h('div', { class: 'w-20 h-20 rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-100' },
      h('img', {
        src: item.imageUrl,
        alt: item.name,
        loading: 'lazy',
        decoding: 'async',
        dataset: { fallback: item.fallback },
        class: 'w-full h-full object-cover hover:scale-105 transition-transform duration-300',
      })
    ),
    h('span', { class: 'text-xs font-bold text-gray-800 truncate w-full text-center', text: item.name }),
    h('span', { class: 'text-xs text-pink-700 font-bold', text: formatPrice(item.price) })
  );
}

function shopCard(shop) {
  const open = isOpenNow(shop.hours);

  return h('li', { class: 'bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col gap-3' },
    h('div', { class: 'flex justify-between items-start gap-2' },
      h('div', { class: 'min-w-0' },
        h('h3', { class: 'font-bold text-gray-900 text-base', text: shop.name }),
        h('p', { class: 'text-xs text-gray-600 mt-1 flex items-center gap-1' },
          icon('map-pin', 'w-3 h-3'),
          `${shop.distanceKm.toFixed(1)} km 先`
        )
      ),
      h('span', {
        class: open
          ? 'px-2 py-1 bg-green-100 text-green-800 text-[11px] font-bold rounded-full shrink-0'
          : 'px-2 py-1 bg-gray-100 text-gray-700 text-[11px] font-bold rounded-full shrink-0',
        text: open ? '営業中' : '営業時間外',
      })
    ),

    h('ul', { class: 'flex gap-3 overflow-x-auto no-scrollbar py-1 list-none' },
      ...shop.items.map(shopItem)
    ),

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

export async function renderShops() {
  const shops = await shopRepo.list();
  $('shop-list').replaceChildren(...shops.map(shopCard));
}
