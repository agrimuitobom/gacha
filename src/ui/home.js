import { $ } from './dom.js';
import { state } from '../state.js';
import { scheduleRepo, outfitRepo } from '../data/repositories.js';
import { formatShortDateJa } from '../domain/dates.js';

export async function refreshHomeWidget() {
  $('home-calendar-date-text').textContent = formatShortDateJa(state.todayKey);

  // ホームは常に「今日」を出す（カレンダーで別の日を選んでも変わらない）
  const schedules = await scheduleRepo.listByDate(state.todayKey);
  const scheduleEl = $('home-schedule-text');

  if (schedules.length === 0) {
    scheduleEl.textContent = '予定なし';
  } else {
    const [first] = schedules;
    const suffix = schedules.length > 1 ? ` 他${schedules.length - 1}件` : '';
    const prefix = first.time === '終日' ? '終日 ' : `${first.time}〜 `;
    scheduleEl.textContent = prefix + first.title + suffix;
  }

  // コーデ決定済みバッジは予定テキストとは別要素にする（上書きして壊さない）
  const decided = await outfitRepo.findByDate(state.todayKey);
  const badge = $('home-decided-badge');
  badge.classList.toggle('hidden', !decided);
  badge.classList.toggle('flex', Boolean(decided));
}
