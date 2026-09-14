import { h, $ } from './dom.js';
import { icon } from './icons.js';
import { state } from '../state.js';
import { scheduleRepo, outfitRepo, closetRepo } from '../data/repositories.js';
import { fromDateKey, formatDateKeyJa, WEEKDAYS } from '../domain/dates.js';
import { CATEGORIES, CATEGORY_LABELS } from '../domain/gacha.js';
import { newId } from '../data/ids.js';

export async function renderCalendar() {
  const grid = $('calendar-days-grid');
  $('calendar-month-label').textContent = `${state.calYear}年 ${state.calMonth + 1}月`;
  grid.replaceChildren();

  const firstWeekday = new Date(state.calYear, state.calMonth, 1).getDay();
  const daysInMonth = new Date(state.calYear, state.calMonth + 1, 0).getDate();

  // 表示している月のぶんだけ問い合わせる
  const monthPrefix = `${state.calYear}-${String(state.calMonth + 1).padStart(2, '0')}`;
  const from = `${monthPrefix}-01`;
  const to = `${monthPrefix}-${String(daysInMonth).padStart(2, '0')}`;
  const [scheduledDates, outfitDates] = await Promise.all([
    scheduleRepo.datesWithSchedule(from, to),
    outfitRepo.datesWithOutfit(from, to),
  ]);

  for (let i = 0; i < firstWeekday; i += 1) {
    grid.appendChild(h('div', { class: 'h-11', 'aria-hidden': 'true' }));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const month = String(state.calMonth + 1).padStart(2, '0');
    const dateKey = `${state.calYear}-${month}-${String(day).padStart(2, '0')}`;
    const isSelected = dateKey === state.selectedDateKey;
    const isToday = dateKey === state.todayKey;
    const hasSchedule = scheduledDates.has(dateKey);
    const hasOutfit = outfitDates.has(dateKey);

    let className = 'h-11 rounded-xl flex flex-col items-center justify-center relative transition-all active:scale-90 ';
    if (isSelected) className += 'bg-rose-600 text-white font-bold shadow-md';
    else if (isToday) className += 'bg-rose-50 text-rose-700 font-bold ring-1 ring-rose-300';
    else className += 'hover:bg-gray-100 text-gray-800 font-medium';

    const scheduleNote = (hasSchedule ? '・予定あり' : '') + (hasOutfit ? '・コーデ記録あり' : '');
    const button = h('button', {
      type: 'button',
      class: className,
      'aria-label': `${formatDateKeyJa(dateKey)}${scheduleNote}`,
      'aria-pressed': String(isSelected),
      'aria-current': isToday ? 'date' : null,
      dataset: { action: 'select-date', date: dateKey },
    }, h('span', { class: 'pointer-events-none', text: String(day) }));

    if (hasSchedule || hasOutfit) {
      const marks = h('span', { 'aria-hidden': 'true', class: 'absolute bottom-1 flex gap-0.5 pointer-events-none' });
      if (hasSchedule) {
        marks.appendChild(h('span', {
          class: `w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-rose-600'}`,
        }));
      }
      if (hasOutfit) {
        marks.appendChild(h('span', {
          class: `w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/70' : 'bg-indigo-600'}`,
        }));
      }
      button.appendChild(marks);
    }
    grid.appendChild(button);
  }
}

export async function renderSchedules() {
  const list = $('schedule-list');

  $('selected-date-title').replaceChildren(
    icon('calendar', 'w-4 h-4 text-rose-600'),
    document.createTextNode(` ${formatDateKeyJa(state.selectedDateKey)} の予定`)
  );

  const schedules = await scheduleRepo.listByDate(state.selectedDateKey);
  $('schedule-count-badge').textContent = `${schedules.length}件`;
  list.replaceChildren();

  if (schedules.length === 0) {
    list.appendChild(
      h('li', { class: 'text-xs text-gray-600 text-center py-3', text: 'この日の予定はありません' })
    );
    return;
  }

  for (const item of schedules) {
    list.appendChild(
      item.id === editingScheduleId ? scheduleEditRow(item) : scheduleRow(item)
    );
  }
}

/** 編集中の予定。null なら通常表示 */
let editingScheduleId = null;

export function setEditingSchedule(id) {
  editingScheduleId = id;
}

function scheduleRow(item) {
  return h('li', { class: 'flex items-center justify-between bg-rose-50/60 p-2 rounded-xl border border-rose-100 text-xs gap-1' },
    h('div', { class: 'flex items-center gap-2 min-w-0' },
      h('span', { class: 'font-bold text-rose-700 shrink-0', text: item.time }),
      // textContent で入れるので、タイトルに HTML を書かれても実行されない
      h('span', { class: 'text-gray-800 font-medium truncate', text: item.title })
    ),
    h('div', { class: 'flex shrink-0' },
      h('button', {
        type: 'button',
        class: 'w-11 h-11 flex items-center justify-center text-gray-600 hover:text-blue-700 rounded-lg transition-colors',
        'aria-label': `${item.title} を編集`,
        dataset: { action: 'edit-schedule', id: item.id },
      }, icon('pencil', 'w-4 h-4')),
      h('button', {
        type: 'button',
        class: 'w-11 h-11 flex items-center justify-center text-gray-600 hover:text-rose-600 rounded-lg transition-colors',
        'aria-label': `${item.title} を削除`,
        dataset: { action: 'delete-schedule', id: item.id },
      }, icon('trash-2', 'w-4 h-4'))
    )
  );
}

/** その場で書き換えられるようにする。別画面へ飛ばすほどの内容ではない */
function scheduleEditRow(item) {
  const timeId = `edit-time-${item.id}`;
  const titleId = `edit-title-${item.id}`;

  return h('li', { class: 'flex flex-col gap-2 bg-white p-2.5 rounded-xl border border-blue-200 shadow-sm' },
    h('div', { class: 'flex gap-2 items-center' },
      h('label', { class: 'sr-only', for: timeId, text: '開始時刻' }),
      h('input', {
        id: timeId, type: 'time', value: item.time === '終日' ? '' : item.time,
        class: 'schedule-edit-time border border-gray-300 rounded-xl px-2 py-2 text-base text-gray-900 bg-gray-50 font-medium shrink-0',
      }),
      h('label', { class: 'sr-only', for: titleId, text: '予定の内容' }),
      h('input', {
        id: titleId, type: 'text', maxlength: '60', value: item.title,
        class: 'schedule-edit-title flex-1 min-w-0 border border-gray-300 rounded-xl px-3 py-2 text-base text-gray-900 bg-gray-50',
      })
    ),
    h('div', { class: 'flex gap-2' },
      h('button', {
        type: 'button',
        class: 'flex-1 min-h-[44px] bg-gray-100 text-gray-800 font-bold text-xs rounded-xl active:bg-gray-200 transition-colors',
        dataset: { action: 'cancel-edit-schedule' },
        text: 'やめる',
      }),
      h('button', {
        type: 'button',
        class: 'flex-1 min-h-[44px] bg-gray-900 text-white font-bold text-xs rounded-xl active:bg-gray-700 transition-colors',
        dataset: { action: 'save-edit-schedule', id: item.id },
        text: '保存',
      })
    )
  );
}

/** 編集中の行から値を読む */
export function readScheduleEditRow() {
  const time = document.querySelector('.schedule-edit-time');
  const title = document.querySelector('.schedule-edit-title');
  if (!title) return null;
  return { time: time?.value.trim() || '終日', title: title.value.trim() };
}

/**
 * 選択中の日に着たコーデを表示する。
 * 決めた記録は貯めているのに見返せなかったので、日付から辿れるようにする。
 */
export async function renderOutfitHistory() {
  const container = $('outfit-history');
  const outfit = await outfitRepo.findByDate(state.selectedDateKey);

  if (!outfit) {
    container.replaceChildren(
      h('p', { class: 'text-xs text-gray-600 text-center py-3', text: 'この日はまだ決めていません' })
    );
    return;
  }

  const items = await closetRepo.list();
  const byId = new Map(items.map((item) => [item.id, item]));

  const rows = CATEGORIES.map((category) => {
    const id = outfit[`${category}Id`];
    if (!id) return null;
    const item = byId.get(id);
    return h('li', { class: 'flex items-center gap-2 text-xs' },
      h('span', { class: 'w-14 shrink-0 text-gray-600', text: CATEGORY_LABELS[category] }),
      item
        ? h('span', { class: 'font-medium text-gray-900 truncate', text: item.name })
        // 記録した後で削除された服。名前は残っていないので、その旨を出す
        : h('span', { class: 'text-gray-500 italic', text: '削除されたアイテム' })
    );
  }).filter(Boolean);

  container.replaceChildren(
    h('ul', { class: 'flex flex-col gap-1.5 list-none' }, ...rows),
    h('p', {
      class: 'text-[11px] text-gray-500 mt-1',
      text: `決定: ${new Date(outfit.decidedAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}`,
    })
  );
}

export function addScheduleInputRow({ focus = false } = {}) {
  const container = $('schedule-inputs-container');
  const rowId = newId();
  const timeId = `time-${rowId}`;
  const titleId = `title-${rowId}`;

  const row = h('div', { class: 'schedule-input-row flex gap-2 items-center animate-fade-in', dataset: { rowId } },
    h('label', { class: 'sr-only', for: timeId, text: '開始時刻' }),
    h('input', {
      id: timeId, type: 'time', value: '12:00',
      class: 'schedule-time-input border border-gray-300 rounded-xl px-2 py-2.5 text-base text-gray-900 bg-gray-50 font-medium shrink-0',
    }),
    h('label', { class: 'sr-only', for: titleId, text: '予定の内容' }),
    h('input', {
      id: titleId, type: 'text', maxlength: '60', placeholder: '例: ランチ、ショッピング',
      class: 'schedule-title-input flex-1 min-w-0 border border-gray-300 rounded-xl px-3 py-2.5 text-base text-gray-900 bg-gray-50',
    }),
    h('button', {
      type: 'button',
      class: 'w-11 h-11 shrink-0 flex items-center justify-center text-gray-500 hover:text-rose-600 rounded-lg transition-colors',
      'aria-label': '入力欄を削除',
      dataset: { action: 'remove-input-row', rowId },
    }, icon('minus-circle', 'w-4 h-4'))
  );

  container.appendChild(row);
  if (focus) row.querySelector('.schedule-title-input').focus();
}

export function resetScheduleInputRows() {
  $('schedule-inputs-container').replaceChildren();
  addScheduleInputRow();
}

export function removeScheduleInputRow(rowId) {
  const container = $('schedule-inputs-container');
  const rows = container.querySelectorAll('.schedule-input-row');
  const row = container.querySelector(`[data-row-id="${CSS.escape(rowId)}"]`);
  if (!row) return;

  if (rows.length > 1) {
    row.remove();
    // 削除したボタンにフォーカスが残らないようにする
    const last = container.querySelector('.schedule-input-row:last-child .schedule-title-input');
    last?.focus();
  } else {
    const titleInput = row.querySelector('.schedule-title-input');
    if (titleInput) {
      titleInput.value = '';
      titleInput.focus();
    }
  }
}

export function readScheduleInputRows() {
  const rows = $('schedule-inputs-container').querySelectorAll('.schedule-input-row');
  return Array.from(rows)
    .map((row) => ({
      title: row.querySelector('.schedule-title-input').value.trim(),
      time: row.querySelector('.schedule-time-input').value.trim(),
    }))
    .filter((entry) => entry.title.length > 0);
}

export function moveCalendarMonth(delta) {
  const date = new Date(state.calYear, state.calMonth + delta, 1);
  state.calYear = date.getFullYear();
  state.calMonth = date.getMonth();
}

export function resetCalendarToToday() {
  const today = fromDateKey(state.todayKey);
  state.selectedDateKey = state.todayKey;
  state.calYear = today.getFullYear();
  state.calMonth = today.getMonth();
}

export { WEEKDAYS };
