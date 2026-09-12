import { h, $ } from './dom.js';
import { icon } from './icons.js';
import { state } from '../state.js';
import { scheduleRepo } from '../data/repositories.js';
import { fromDateKey, formatDateKeyJa, WEEKDAYS } from '../domain/dates.js';
import { newId } from '../data/ids.js';

export async function renderCalendar() {
  const grid = $('calendar-days-grid');
  $('calendar-month-label').textContent = `${state.calYear}年 ${state.calMonth + 1}月`;
  grid.replaceChildren();

  const firstWeekday = new Date(state.calYear, state.calMonth, 1).getDay();
  const daysInMonth = new Date(state.calYear, state.calMonth + 1, 0).getDate();

  // 表示している月のぶんだけ問い合わせる
  const monthPrefix = `${state.calYear}-${String(state.calMonth + 1).padStart(2, '0')}`;
  const scheduledDates = await scheduleRepo.datesWithSchedule(
    `${monthPrefix}-01`,
    `${monthPrefix}-${String(daysInMonth).padStart(2, '0')}`
  );

  for (let i = 0; i < firstWeekday; i += 1) {
    grid.appendChild(h('div', { class: 'h-11', 'aria-hidden': 'true' }));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const month = String(state.calMonth + 1).padStart(2, '0');
    const dateKey = `${state.calYear}-${month}-${String(day).padStart(2, '0')}`;
    const isSelected = dateKey === state.selectedDateKey;
    const isToday = dateKey === state.todayKey;
    const hasSchedule = scheduledDates.has(dateKey);

    let className = 'h-11 rounded-xl flex flex-col items-center justify-center relative transition-all active:scale-90 ';
    if (isSelected) className += 'bg-rose-600 text-white font-bold shadow-md';
    else if (isToday) className += 'bg-rose-50 text-rose-700 font-bold ring-1 ring-rose-300';
    else className += 'hover:bg-gray-100 text-gray-800 font-medium';

    const scheduleNote = hasSchedule ? '・予定あり' : '';
    const button = h('button', {
      type: 'button',
      class: className,
      'aria-label': `${formatDateKeyJa(dateKey)}${scheduleNote}`,
      'aria-pressed': String(isSelected),
      'aria-current': isToday ? 'date' : null,
      dataset: { action: 'select-date', date: dateKey },
    }, h('span', { class: 'pointer-events-none', text: String(day) }));

    if (hasSchedule) {
      button.appendChild(
        h('span', {
          'aria-hidden': 'true',
          class: `w-1.5 h-1.5 rounded-full absolute bottom-1 pointer-events-none ${isSelected ? 'bg-white' : 'bg-rose-600'}`,
        })
      );
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
      h('li', { class: 'flex items-center justify-between bg-rose-50/60 p-2 rounded-xl border border-rose-100 text-xs gap-2' },
        h('div', { class: 'flex items-center gap-2 min-w-0' },
          h('span', { class: 'font-bold text-rose-700 shrink-0', text: item.time }),
          // textContent で入れるので、タイトルに HTML を書かれても実行されない
          h('span', { class: 'text-gray-800 font-medium truncate', text: item.title })
        ),
        h('button', {
          type: 'button',
          class: 'w-11 h-11 shrink-0 flex items-center justify-center text-gray-600 hover:text-rose-600 rounded-lg transition-colors',
          'aria-label': `${item.title} を削除`,
          dataset: { action: 'delete-schedule', id: item.id },
        }, icon('trash-2', 'w-4 h-4'))
      )
    );
  }
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
