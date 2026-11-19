/**
 * コレクション名。ローカル保存では IndexedDB のオブジェクトストア名、
 * Firebase では users/{uid}/{name} のサブコレクション名として使う。
 *
 * ドキュメント形状:
 *   closetItems: { id, category, name, imageUrl, imagePath, colorClass,
 *                  warmth, formality, rainSafe, createdAt }
 *   schedules:   { id, date: 'YYYY-MM-DD', time: 'HH:MM'|'終日', title, createdAt }
 *   outfits:     { id, date, outerId, topsId, bottomsId, shoesId, accessoryId, decidedAt }
 *   pushSubscriptions: { id, endpoint, keys, leadMinutes, timeZone, ... } 予定の通知先（端末ごと）
 *   meta:        { id, ... } アプリ自身の状態（サンプル投入済みフラグなど）
 */
export const CLOSET_ITEMS = 'closetItems';
export const SCHEDULES = 'schedules';
export const OUTFITS = 'outfits';
export const META = 'meta';
// 予定の通知先。Firebase で同期しているときだけ使うので、ローカル保存の一覧には含めない
export const PUSH_SUBSCRIPTIONS = 'pushSubscriptions';

export const ALL_COLLECTIONS = [CLOSET_ITEMS, SCHEDULES, OUTFITS, META];
