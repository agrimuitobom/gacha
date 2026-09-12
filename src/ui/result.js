import { h, $ } from './dom.js';
import { state } from '../state.js';
import { itemThumbnail } from './closet.js';
import { CATEGORIES, CATEGORY_LABELS } from '../domain/gacha.js';

function resultRow(category, item) {
  const label = CATEGORY_LABELS[category];

  if (!item) {
    return h('li', { class: 'flex items-center gap-4 bg-gray-50 p-3 rounded-2xl border border-dashed border-gray-300' },
      h('div', { class: 'w-20 h-20 shrink-0 rounded-xl bg-gray-100 flex items-center justify-center text-xs text-gray-600 font-bold border border-gray-200', text: '未登録' }),
      h('div', { class: 'flex-1 min-w-0' },
        h('p', { class: 'text-xs text-gray-600 mb-1', text: label }),
        h('p', { class: 'font-bold text-gray-600', text: 'クローゼットに登録がありません' })
      )
    );
  }

  return h('li', { class: 'flex items-center gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-100' },
    itemThumbnail(item, 'w-20 h-20 shrink-0'),
    h('div', { class: 'flex-1 min-w-0' },
      h('p', { class: 'text-xs text-gray-600 mb-1', text: label }),
      h('p', { class: 'font-bold text-gray-800', text: item.name })
    )
  );
}

export function renderResult(outfit) {
  $('result-message').textContent = outfit.message;
  $('result-items').replaceChildren(
    ...CATEGORIES.map((category) => resultRow(category, outfit[category]))
  );
  state.currentOutfit = outfit;
}
