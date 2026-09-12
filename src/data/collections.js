/**
 * コレクション名。ローカル保存では IndexedDB のオブジェクトストア名、
 * Firebase では users/{uid}/{name} のサブコレクション名として使う。
 *
 * ドキュメント形状:
 *   closetItems: { id, category, name, imageUrl, imagePath, colorClass,
 *                  warmth, formality, rainSafe, createdAt }
 *   schedules:   { id, date: 'YYYY-MM-DD', time: 'HH:MM'|'終日', title, createdAt }
 *   outfits:     { id, date, topsId, bottomsId, shoesId, decidedAt }
 */
export const CLOSET_ITEMS = 'closetItems';
export const SCHEDULES = 'schedules';
export const OUTFITS = 'outfits';

export const ALL_COLLECTIONS = [CLOSET_ITEMS, SCHEDULES, OUTFITS];
