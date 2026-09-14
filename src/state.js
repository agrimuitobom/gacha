import { toDateKey } from './domain/dates.js';

const today = new Date();

export const state = {
  todayKey: toDateKey(today),
  selectedDateKey: toDateKey(today),
  calYear: today.getFullYear(),
  calMonth: today.getMonth(),
  activeTab: 'tops',
  weather: null,
  weatherError: null,
  weatherFetchedAt: 0,
  // 天気の取得で現在地が分かったら残しておき、店舗までの距離に使う
  lastPosition: null,
  currentOutfit: null,
};
