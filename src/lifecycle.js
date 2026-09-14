import { state } from './state.js';
import { toDateKey } from './domain/dates.js';

/**
 * 「アプリの復帰」と「日付の切り替わり」を検知する。
 *
 * PWA としてインストールすると、アプリは終了せずバックグラウンドに残る。
 * 起動時に一度だけ求めた日付や天気を持ち続けると、翌朝開いたときに
 * 昨日の日付・昨日の天気のまま操作することになる。
 * （昨日の予定でコーデを選び、昨日の日付でコーデを保存してしまう）
 */

/** 日付が変わった直後に発火させるための余裕 */
const MIDNIGHT_MARGIN_MS = 1000;

let midnightTimer = null;

export function msUntilNextMidnight(now = new Date()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime() + MIDNIGHT_MARGIN_MS;
}

/**
 * 現在時刻に合わせて「今日」を取り直す。
 * @returns {boolean} 日付が変わっていたか
 */
export function syncToday(now = new Date()) {
  const key = toDateKey(now);
  if (key === state.todayKey) return false;
  state.todayKey = key;
  return true;
}

export function stopLifecycle() {
  clearTimeout(midnightTimer);
  midnightTimer = null;
}

/**
 * @param {{ onDateChange: () => void, onResume: () => void }} handlers
 */
export function initLifecycle({ onDateChange, onResume }) {
  function checkDate() {
    if (syncToday()) onDateChange();
  }

  function scheduleMidnight() {
    clearTimeout(midnightTimer);
    midnightTimer = setTimeout(() => {
      checkDate();
      scheduleMidnight();
    }, msUntilNextMidnight());
  }

  function handleResume() {
    // バックグラウンドではタイマーが止められることがあるので張り直す
    scheduleMidnight();
    checkDate();
    onResume();
  }

  scheduleMidnight();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') handleResume();
  });

  // iOS などで bfcache から戻る場合は visibilitychange が来ないことがある。
  // 初回読み込みでも発火するので、復元時だけを拾う。
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) handleResume();
  });
}
