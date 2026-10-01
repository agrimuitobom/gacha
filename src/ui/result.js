import { h, $ } from './dom.js';
import { state } from '../state.js';
import { itemThumbnail } from './closet.js';
import { CATEGORIES, CATEGORY_LABELS } from '../domain/gacha.js';

/**
 * 空欄の見せ方。理由ごとに言い分ける。
 *
 * 以前はどの理由でも「未登録 / クローゼットに登録がありません」だった。
 * アウターは気温次第で出さないので、暑い日に登録済みのアウターがあっても
 * 「登録がありません」と表示され、事実と違っていた。
 */
const EMPTY_SLOT = {
  'not-needed': { badge: '不要', text: '今日の気温なら無くても大丈夫です' },
  resting: { badge: 'お休み', text: 'お休み中のものしかありません' },
  none: { badge: '未登録', text: 'クローゼットに登録がありません' },
};

function resultRow(category, item, slotState) {
  const label = CATEGORY_LABELS[category];

  if (!item) {
    const empty = EMPTY_SLOT[slotState] || EMPTY_SLOT.none;
    return h('li', { class: 'flex items-center gap-4 bg-gray-50 p-3 rounded-2xl border border-dashed border-gray-300' },
      h('div', { class: 'w-20 h-20 shrink-0 rounded-xl bg-gray-100 flex items-center justify-center text-xs text-gray-600 font-bold border border-gray-200', text: empty.badge }),
      h('div', { class: 'flex-1 min-w-0' },
        h('p', { class: 'text-xs text-gray-600 mb-1', text: label }),
        h('p', { class: 'font-bold text-gray-600', text: empty.text })
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
    ...CATEGORIES.map((category) =>
      resultRow(category, outfit[category], outfit.slotStates?.[category]))
  );
  state.currentOutfit = outfit;
}
