import { getBackend } from './backend.js';
import { newId } from './ids.js';
import { CLOSET_ITEMS, SCHEDULES, OUTFITS } from './collections.js';

/**
 * アプリが触るのはこの層だけ。
 * バックエンド（ローカル / Firebase）の違いはここより下に隠蔽されている。
 */

export const closetRepo = {
  async list() {
    const backend = await getBackend();
    const items = await backend.list(CLOSET_ITEMS);
    return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  async add(input) {
    const backend = await getBackend();
    const id = newId();

    let image = { url: null, path: null };
    if (input.image?.dataUrl) {
      image = await backend.uploadImage(id, input.image);
    }

    const item = {
      id,
      category: input.category,
      name: input.name,
      imageUrl: image.url,
      imagePath: image.path,
      colorClass: input.colorClass || 'bg-gray-100',
      warmth: input.warmth,
      formality: input.formality,
      rainSafe: input.rainSafe !== false,
      createdAt: Date.now(),
    };
    return backend.put(CLOSET_ITEMS, item);
  },

  async remove(id) {
    const backend = await getBackend();
    const items = await backend.list(CLOSET_ITEMS);
    const target = items.find((item) => item.id === id);

    // 画像を先に消す。ドキュメントを先に消すと、失敗時に孤児ファイルが残る。
    if (target?.imagePath) {
      await backend.deleteImage(target.imagePath);
    }
    return backend.remove(CLOSET_ITEMS, id);
  },
};

export const scheduleRepo = {
  async listByDate(dateKey) {
    const backend = await getBackend();
    const all = await backend.list(SCHEDULES);
    return all.filter((item) => item.date === dateKey).sort(compareSchedules);
  },

  /** カレンダーの点表示用：予定が1件以上ある日付キーの Set */
  async datesWithSchedule() {
    const backend = await getBackend();
    const all = await backend.list(SCHEDULES);
    return new Set(all.map((item) => item.date));
  },

  async add(dateKey, { time, title }) {
    const backend = await getBackend();
    return backend.put(SCHEDULES, {
      id: newId(),
      date: dateKey,
      time: time || '終日',
      title,
      createdAt: Date.now(),
    });
  },

  async remove(id) {
    const backend = await getBackend();
    return backend.remove(SCHEDULES, id);
  },
};

function compareSchedules(a, b) {
  if (a.time === b.time) return (a.createdAt || 0) - (b.createdAt || 0);
  if (a.time === '終日') return -1;
  if (b.time === '終日') return 1;
  return a.time.localeCompare(b.time);
}

export const outfitRepo = {
  async findByDate(dateKey) {
    const backend = await getBackend();
    const all = await backend.list(OUTFITS);
    return all.find((item) => item.date === dateKey) || null;
  },

  async save(dateKey, outfit) {
    const backend = await getBackend();
    const existing = await this.findByDate(dateKey);
    return backend.put(OUTFITS, {
      id: existing ? existing.id : newId(),
      date: dateKey,
      topsId: outfit.tops?.id || null,
      bottomsId: outfit.bottoms?.id || null,
      shoesId: outfit.shoes?.id || null,
      decidedAt: Date.now(),
      createdAt: existing?.createdAt || Date.now(),
    });
  },
};

/** 初回起動時のサンプルデータ */
const SEED_ITEMS = [
  { category: 'tops', name: '白のオーバーサイズT', colorClass: 'bg-slate-100', warmth: 1, formality: 1, rainSafe: true },
  { category: 'tops', name: 'ストライプシャツ', colorClass: 'bg-blue-100', warmth: 2, formality: 2, rainSafe: true },
  { category: 'tops', name: '黒ニット', colorClass: 'bg-stone-800', warmth: 4, formality: 2, rainSafe: true },
  { category: 'bottoms', name: 'インディゴデニム', colorClass: 'bg-blue-800', warmth: 3, formality: 1, rainSafe: true },
  { category: 'bottoms', name: '黒テーパードスラックス', colorClass: 'bg-zinc-800', warmth: 3, formality: 3, rainSafe: true },
  { category: 'shoes', name: '白レザースニーカー', colorClass: 'bg-gray-50', warmth: 2, formality: 2, rainSafe: true },
  { category: 'shoes', name: '黒レザーブーツ', colorClass: 'bg-stone-900', warmth: 4, formality: 3, rainSafe: true },
  { category: 'shoes', name: 'キャンバススニーカー', colorClass: 'bg-amber-100', warmth: 2, formality: 1, rainSafe: false },
];

export async function seedIfEmpty() {
  const existing = await closetRepo.list();
  if (existing.length > 0) return false;
  for (const item of SEED_ITEMS) {
    await closetRepo.add(item);
  }
  return true;
}
