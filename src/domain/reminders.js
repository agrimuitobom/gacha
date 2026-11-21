/**
 * 予定のリマインド通知を「いつ・何を」送るかの判定。
 *
 * 送信は GitHub Actions の定期実行（reminders/send.mjs）が行い、
 * 画面の設定（src/ui/notifications.js）も同じ定数を使う。
 * 純粋な関数だけを置き、Node でもブラウザでも読めるようにしている。
 */

/** 何分前に知らせるかの選択肢。GitHub Actions の定期実行は数分〜十数分遅れることがあるので、短すぎる選択肢は置かない */
export const LEAD_OPTIONS = [
  { minutes: 15, label: '15分前' },
  { minutes: 30, label: '30分前' },
  { minutes: 60, label: '1時間前' },
  { minutes: 120, label: '2時間前' },
];

export const DEFAULT_LEAD_MINUTES = 30;

/** 終日の予定は、その日の朝この時刻に知らせる */
export const ALL_DAY_NOTIFY_HOUR = 7;

/** 終日の予定は、この時刻を過ぎたら（送り損ねていても）もう送らない */
const ALL_DAY_GIVE_UP_HOUR = 12;

/** タイムゾーン tz における、その瞬間の UTC からのずれ（ミリ秒） */
function offsetMs(epoch, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(epoch)).map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

/**
 * tz の壁時計で 'YYYY-MM-DD' の hour:minute が、UTC で何時かを求める。
 * 送信側は UTC で動くので、利用者の「14:00」をそのまま比べられない。
 */
export function zonedTimeToEpoch(dateKey, hour, minute, tz) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // 夏時間の切り替わり付近でもずれないよう、求めたずれで一度補正し直す
  const first = guess - offsetMs(guess, tz);
  return guess - offsetMs(first, tz);
}

/** tz における、その瞬間の日付 'YYYY-MM-DD' */
export function dateKeyInZone(epoch, tz) {
  // en-CA は YYYY-MM-DD で出る
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(epoch));
}

export function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * 1件の予定について、通知を送る時刻と、送ってよい期限を求める。
 * @returns {{ fireAt: number, deadline: number, allDay: boolean } | null}
 */
export function reminderWindow(schedule, { leadMinutes, timeZone }) {
  if (schedule.time === '終日') {
    return {
      fireAt: zonedTimeToEpoch(schedule.date, ALL_DAY_NOTIFY_HOUR, 0, timeZone),
      deadline: zonedTimeToEpoch(schedule.date, ALL_DAY_GIVE_UP_HOUR, 0, timeZone),
      allDay: true,
    };
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(schedule.time || '');
  if (!match) return null;
  const start = zonedTimeToEpoch(schedule.date, Number(match[1]), Number(match[2]), timeZone);
  return {
    fireAt: start - leadMinutes * 60_000,
    // 始まってから届いても意味が無い
    deadline: start,
    allDay: false,
  };
}

/**
 * 同じ予定に二重に送らないための鍵。
 * 日付や時刻を変えた予定には、もう一度送りたいので鍵に含める。
 */
export function reminderKey(schedule, leadMinutes) {
  return `${schedule.date} ${schedule.time} ${leadMinutes}`;
}

/** 通知の文面 */
export function reminderMessage(schedule, { leadMinutes, allDay }) {
  if (allDay) {
    return {
      title: `今日の予定: ${schedule.title}`,
      body: '予定に合わせて、今日のコーデを引いてみましょう',
    };
  }
  const label = LEAD_OPTIONS.find((option) => option.minutes === leadMinutes)?.label
    ?? `${leadMinutes}分前`;
  return {
    title: `${schedule.time} ${schedule.title}`,
    body: `${label.replace(/前$/, '後')}に始まります`,
  };
}

/**
 * いま送るべき通知を選ぶ。
 *
 * 定期実行は遅れたり飛んだりするので「ちょうどその時刻」ではなく
 * 「送る時刻を過ぎていて、まだ期限内で、まだ送っていない」もので判定する。
 *
 * @param {{
 *   schedules: {id: string, date: string, time: string, title: string}[],
 *   subscription: { leadMinutes: number, timeZone: string },
 *   sentKeys: Map<string, string>,   … scheduleId → 送信済みの reminderKey
 *   now: number,
 * }} input
 */
export function dueReminders({ schedules, subscription, sentKeys, now }) {
  const due = [];
  for (const schedule of schedules) {
    const window = reminderWindow(schedule, subscription);
    if (!window) continue;
    if (now < window.fireAt || now >= window.deadline) continue;

    const key = reminderKey(schedule, subscription.leadMinutes);
    if (sentKeys.get(schedule.id) === key) continue;

    due.push({
      schedule,
      key,
      message: reminderMessage(schedule, { leadMinutes: subscription.leadMinutes, allDay: window.allDay }),
    });
  }
  return due;
}
