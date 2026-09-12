export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** Date -> 'YYYY-MM-DD'（ローカルタイム基準。toISOString はUTCずれを起こすので使わない） */
export function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 'YYYY-MM-DD' -> Date */
export function fromDateKey(key) {
  const [year, month, day] = key.split('-').map((part) => parseInt(part, 10));
  return new Date(year, month - 1, day);
}

export function formatDateKeyJa(key) {
  const date = fromDateKey(key);
  return `${date.getMonth() + 1}月${date.getDate()}日 (${WEEKDAYS[date.getDay()]})`;
}

export function formatShortDateJa(key) {
  const date = fromDateKey(key);
  return `${date.getMonth() + 1}/${date.getDate()} (${WEEKDAYS[date.getDay()]})`;
}
