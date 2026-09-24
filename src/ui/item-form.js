import { $ } from './dom.js';

/**
 * アイテムの登録・編集フォーム。
 *
 * 撮影直後の新規登録と、既存アイテムの編集で同じ画面を使う。
 * 入力項目が同じなうえ、片方だけ直すとずれていくため。
 */

/**
 * 「生地の厚み」欄の見せ方。カテゴリごとに言葉を替える。
 *
 * 靴に「生地の厚み」は馴染まないが、値そのものは抽選で使っている
 * （ブーツ 4 / スニーカー 2 の差が、寒い日にブーツを出している）。
 * 欄ごと消すと真冬にサンダル・真夏にブーツが出るようになるので、
 * 消さずに靴の言葉へ言い換える。段階の意味は全カテゴリで共通
 * （1 が薄い・涼しい、5 が厚い・暖かい）。
 */
const WARMTH_PRESETS = {
  shoes: {
    label: '暖かさ',
    help: '気温に合う靴を選ぶために使います',
    options: [
      '1 - サンダル・メッシュ',
      '2 - 薄手のスニーカー',
      '3 - 普通',
      '4 - ブーツ・厚手',
      '5 - 裏ボア・冬用',
    ],
  },
  default: {
    label: '生地の厚み',
    help: '気温に合うコーデを選ぶために使います',
    options: [
      '1 - とても薄手（真夏）',
      '2 - 薄手',
      '3 - 普通',
      '4 - 厚手',
      '5 - とても厚手（真冬）',
    ],
  },
};

/** カテゴリに合わせて厚み欄の文言を差し替える。選択中の値は保つ */
export function applyWarmthPreset(category) {
  const preset = WARMTH_PRESETS[category] || WARMTH_PRESETS.default;
  $('capture-warmth-label').textContent = preset.label;
  $('capture-warmth-help').textContent = preset.help;

  const select = $('capture-warmth');
  const selected = select.value;
  for (const [index, option] of [...select.options].entries()) {
    option.textContent = preset.options[index];
  }
  select.value = selected;
}

let mode = 'create';
let editingId = null;
let pendingImage = null;

export const getMode = () => mode;
export const getEditingId = () => editingId;
export const getPendingImage = () => pendingImage;
export const clearPendingImage = () => { pendingImage = null; };

function fill({ name, category, warmth, formality, rainSafe, available }) {
  $('capture-name').value = name ?? '';
  $('capture-category').value = category ?? 'tops';
  $('capture-warmth').value = String(warmth ?? 3);
  $('capture-formality').value = String(formality ?? 1);
  $('capture-rainsafe').checked = rainSafe !== false;
  $('capture-available').checked = available !== false;
  applyWarmthPreset($('capture-category').value);
}

function showPreview({ imageUrl, colorClass }) {
  const wrap = $('capture-preview-wrap');
  const image = $('capture-preview');
  if (imageUrl) {
    image.src = imageUrl;
    image.classList.remove('hidden');
    wrap.className = 'w-32 h-32 mx-auto rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-gray-100';
  } else {
    // 写真が無いアイテム（初期サンプルなど）は色だけ見せる
    image.removeAttribute('src');
    image.classList.add('hidden');
    wrap.className = `w-32 h-32 mx-auto rounded-2xl border border-gray-200 shadow-sm ${colorClass || 'bg-gray-100'}`;
  }
}

/** 撮影直後の新規登録 */
export function openForCreate(image, { defaultCategory = 'tops' } = {}) {
  mode = 'create';
  editingId = null;
  pendingImage = image;

  $('item-form-title').textContent = 'アイテムを登録';
  $('item-form-cancel').textContent = '撮り直す';
  fill({ category: defaultCategory });
  showPreview({ imageUrl: image?.dataUrl });
}

/** 既存アイテムの編集。写真はそのまま使う */
export function openForEdit(item) {
  mode = 'edit';
  editingId = item.id;
  pendingImage = null;

  $('item-form-title').textContent = 'アイテムを編集';
  $('item-form-cancel').textContent = 'やめる';
  fill(item);
  showPreview({ imageUrl: item.imageUrl, colorClass: item.colorClass });
}

export function readForm() {
  return {
    name: $('capture-name').value.trim(),
    category: $('capture-category').value,
    warmth: parseInt($('capture-warmth').value, 10),
    formality: parseInt($('capture-formality').value, 10),
    rainSafe: $('capture-rainsafe').checked,
    available: $('capture-available').checked,
  };
}

export function focusName() {
  $('capture-name').focus();
}
