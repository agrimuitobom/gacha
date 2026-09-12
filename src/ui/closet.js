import { h, $ } from './dom.js';
import { icon } from './icons.js';
import { state } from '../state.js';
import { closetRepo } from '../data/repositories.js';
import { CATEGORIES } from '../domain/gacha.js';

export function itemThumbnail(item, sizeClass) {
  if (item.imageUrl) {
    return h('div', { class: `${sizeClass} rounded-xl overflow-hidden inset-shadow-sm border border-gray-200` },
      h('img', {
        src: item.imageUrl,
        alt: item.name,
        loading: 'lazy',
        decoding: 'async',
        class: 'w-full h-full object-cover',
      })
    );
  }
  return h('div', {
    class: `${sizeClass} rounded-xl inset-shadow-sm border border-gray-200 ${item.colorClass || 'bg-gray-100'}`,
  });
}

function warmthLabel(item) {
  return `厚み ${item.warmth}/5 ・ きれいめ ${item.formality}/3${item.rainSafe === false ? ' ・ 雨に弱い' : ''}`;
}

function closetCard(item) {
  return h('li', { class: 'bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center relative animate-fade-in', dataset: { itemCard: item.id } },
    h('button', {
      type: 'button',
      class: 'absolute top-1 right-1 z-10 w-11 h-11 flex items-center justify-center text-white transition-colors',
      'aria-label': `${item.name} を削除`,
      dataset: { action: 'delete-item', id: item.id },
    },
      h('span', { class: 'w-6 h-6 bg-gray-900/70 hover:bg-rose-600 active:bg-rose-700 rounded-full flex items-center justify-center shadow-sm transition-colors' },
        icon('trash-2', 'w-3.5 h-3.5')
      )
    ),
    itemThumbnail(item, 'w-full aspect-square mb-2'),
    h('p', { class: 'text-xs font-bold text-gray-800 text-center', text: item.name }),
    h('p', { class: 'text-[11px] text-gray-600 mt-0.5 text-center', text: warmthLabel(item) })
  );
}

export async function renderCloset() {
  const items = await closetRepo.list();

  for (const category of CATEGORIES) {
    const container = $(`content-${category}`);
    const filtered = items.filter((item) => item.category === category);
    container.replaceChildren();

    if (filtered.length === 0) {
      container.appendChild(
        h('li', {
          class: 'col-span-2 text-xs text-gray-600 text-center py-10',
          text: 'まだ登録がありません。右上の「＋」から追加してください。',
        })
      );
      continue;
    }
    for (const item of filtered) container.appendChild(closetCard(item));
  }
}

export function switchTab(tabId) {
  state.activeTab = tabId;

  for (const category of CATEGORIES) {
    const tab = $(`tab-${category}`);
    const panel = $(`content-${category}`);
    const active = category === tabId;

    tab.classList.toggle('border-gray-900', active);
    tab.classList.toggle('text-gray-900', active);
    tab.classList.toggle('border-transparent', !active);
    tab.classList.toggle('text-gray-600', !active);
    tab.setAttribute('aria-selected', String(active));
    // 選択中のタブだけをタブ順に含める（WAI-ARIA の tabs パターン）
    tab.tabIndex = active ? 0 : -1;
    panel.classList.toggle('hidden', !active);
  }
}

/** ← → Home End でタブを移動する（WAI-ARIA の tabs パターン） */
export function handleTabKeydown(event) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(event.key)) return;

  const index = CATEGORIES.indexOf(state.activeTab);
  let next = index;
  if (event.key === 'ArrowLeft') next = (index - 1 + CATEGORIES.length) % CATEGORIES.length;
  if (event.key === 'ArrowRight') next = (index + 1) % CATEGORIES.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = CATEGORIES.length - 1;

  event.preventDefault();
  switchTab(CATEGORIES[next]);
  $(`tab-${CATEGORIES[next]}`).focus();
}
