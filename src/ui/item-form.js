import { $ } from './dom.js';

/**
 * アイテムの登録・編集フォーム。
 *
 * 撮影直後の新規登録と、既存アイテムの編集で同じ画面を使う。
 * 入力項目が同じなうえ、片方だけ直すとずれていくため。
 */

let mode = 'create';
let editingId = null;
let pendingImage = null;

export const getMode = () => mode;
export const getEditingId = () => editingId;
export const getPendingImage = () => pendingImage;
export const clearPendingImage = () => { pendingImage = null; };

function fill({ name, category, warmth, formality, rainSafe }) {
  $('capture-name').value = name ?? '';
  $('capture-category').value = category ?? 'tops';
  $('capture-warmth').value = String(warmth ?? 3);
  $('capture-formality').value = String(formality ?? 1);
  $('capture-rainsafe').checked = rainSafe !== false;
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
  };
}

export function focusName() {
  $('capture-name').focus();
}
