import { $ } from './dom.js';
import { setIcon } from './icons.js';

const DURATION_MS = 3000;
let timer = null;

/**
 * 通知トースト。
 * role="status" + aria-live="polite" なのでスクリーンリーダーにも伝わる。
 */
export function showToast(message, { iconName = 'check-circle-2', iconColor = 'text-green-400' } = {}) {
  const toast = $('toast-message');
  const iconHolder = $('toast-icon');

  $('toast-text').textContent = message;
  iconHolder.className = iconColor;
  setIcon(iconHolder, iconName, 'w-5 h-5');

  // 連打時にアニメーションを確実に再生し直す
  clearTimeout(timer);
  toast.classList.remove('animate-toast');
  toast.classList.remove('hidden');
  void toast.offsetWidth; // reflow を強制してアニメーションをリスタート
  toast.classList.add('animate-toast');

  timer = setTimeout(() => {
    toast.classList.remove('animate-toast');
    toast.classList.add('hidden');
    timer = null;
  }, DURATION_MS);
}
