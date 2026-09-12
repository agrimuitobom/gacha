import { $ } from './dom.js';

/**
 * 画面遷移（スタック管理 + フォーカス管理）。
 *
 * アクセシビリティ上の要点:
 *  - 非表示画面は inert + aria-hidden にして、フォーカスと読み上げの
 *    対象から完全に外す（hidden クラスだけだと支援技術には残る）。
 *  - 画面を開いたら見出しへフォーカスを移す。移さないと、キーボード／
 *    スクリーンリーダー利用者は「何が変わったか」が分からない。
 *  - 戻るときは、その画面を開いたボタンへフォーカスを返す。
 */

const ENTER_HANDLERS = new Map();
const stack = ['home-screen'];
const focusOrigins = [];

export function onScreenEnter(screenId, handler) {
  ENTER_HANDLERS.set(screenId, handler);
}

export function currentScreen() {
  return stack[stack.length - 1];
}

function setVisible(screenId, visible) {
  const element = $(screenId);
  if (!element) return;
  element.classList.toggle('hidden', !visible);
  if (visible) {
    element.removeAttribute('inert');
    element.removeAttribute('aria-hidden');
  } else {
    element.setAttribute('inert', '');
    element.setAttribute('aria-hidden', 'true');
  }
}

function focusScreenHeading(screenId) {
  const element = $(screenId);
  const target = element?.querySelector('[data-screen-title]');
  if (!target) return;
  // tabindex="-1" はマークアップ側で付与済み
  target.focus({ preventScroll: true });
}

export function navigateTo(screenId, { origin = null } = {}) {
  if (currentScreen() === screenId) return;
  setVisible(currentScreen(), false);
  stack.push(screenId);
  focusOrigins.push(origin || document.activeElement);
  setVisible(screenId, true);
  ENTER_HANDLERS.get(screenId)?.();
  focusScreenHeading(screenId);
}

export function navigateBack() {
  if (stack.length <= 1) return;
  const leaving = stack.pop();
  const origin = focusOrigins.pop();
  setVisible(leaving, false);

  const next = currentScreen();
  setVisible(next, true);
  ENTER_HANDLERS.get(next)?.();

  // 開いた側のボタンへフォーカスを返す。消えていれば見出しへ。
  if (origin && document.contains(origin)) {
    origin.focus({ preventScroll: true });
  } else {
    focusScreenHeading(next);
  }
}

export function initScreens(screenIds) {
  for (const screenId of screenIds) {
    if (screenId === currentScreen()) continue;
    setVisible(screenId, false);
  }
}
