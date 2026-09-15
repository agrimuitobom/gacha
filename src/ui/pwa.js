import { h, $ } from './dom.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';

/**
 * PWA まわりの導線。
 *
 *  - インストール案内: ブラウザ既定の導線はメニューの奥にあって気づかれない。
 *    Chrome / Edge / Android は beforeinstallprompt を拾って自前のボタンを出し、
 *    iOS Safari は同イベントに対応していないので手順を案内する。
 *  - 更新通知: 新しい Service Worker を検知したら、リロードするかを利用者に委ねる。
 *    自動リロードだと、撮影フォームの入力中などに巻き込まれてしまう。
 */

const DISMISS_KEY = 'coordi-gacha:install-dismissed-at';
const DISMISS_PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14日は再表示しない

let deferredPrompt = null;

/** localStorage はプライベートモード等で例外を投げるので必ず包む */
function readDismissedAt() {
  try {
    return Number(localStorage.getItem(DISMISS_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeDismissedAt(value) {
  try {
    localStorage.setItem(DISMISS_KEY, String(value));
  } catch {
    // 保存できなくても致命的ではない
  }
}

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    navigator.standalone === true
  );
}

function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS は Mac を名乗るのでタッチ有無で判別する
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function shouldOffer() {
  if (isStandalone()) return false;
  return Date.now() - readDismissedAt() > DISMISS_PERIOD_MS;
}

/* ---------------- インストール案内バナー ---------------- */

function banner({ message, actionLabel, action }) {
  return h('div', {
    id: 'install-banner',
    class: 'w-full mb-2 short:mb-1 bg-white/95 backdrop-blur border border-pink-200 rounded-2xl shadow-lg p-3 short:p-1.5 flex items-center gap-3 short:gap-2 animate-fade-in',
    role: 'region',
    'aria-label': 'ホーム画面への追加',
  },
    h('span', { class: 'w-9 h-9 shrink-0 bg-pink-100 text-pink-700 rounded-full flex items-center justify-center short:hidden' },
      icon('sparkles', 'w-5 h-5')
    ),
    h('p', { class: 'flex-1 min-w-0 text-xs text-gray-800 font-medium leading-relaxed', text: message }),
    actionLabel
      ? h('button', {
          type: 'button',
          class: 'shrink-0 px-3 min-h-[44px] bg-gray-900 text-white text-xs font-bold rounded-xl active:bg-gray-700 transition-colors',
          dataset: { action },
          text: actionLabel,
        })
      : null,
    h('button', {
      type: 'button',
      class: 'shrink-0 w-11 h-11 flex items-center justify-center text-gray-500 hover:text-gray-800 rounded-lg transition-colors',
      'aria-label': '閉じる',
      dataset: { action: 'dismiss-install' },
    }, icon('x', 'w-4 h-4'))
  );
}

function mountBanner(element) {
  const slot = $('install-slot');
  if (!slot) return;
  slot.replaceChildren(element);
}

export function hideInstallBanner() {
  $('install-slot')?.replaceChildren();
}

export function dismissInstall() {
  writeDismissedAt(Date.now());
  hideInstallBanner();
}

/** ブラウザのインストールダイアログを開く */
export async function promptInstall() {
  if (!deferredPrompt) return;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  hideInstallBanner();

  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === 'dismissed') {
    // 断られた直後に出し直すと邪魔なので、しばらく黙る
    writeDismissedAt(Date.now());
  }
}

/** iOS 向けの手順案内 */
export function showIosInstallHelp() {
  showToast('共有ボタン → 「ホーム画面に追加」で入ります', {
    iconName: 'sparkles',
    iconColor: 'text-pink-300',
  });
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    // 既定のミニバーを抑止し、こちらのタイミングで出す
    event.preventDefault();
    deferredPrompt = event;
    if (!shouldOffer()) return;
    mountBanner(banner({
      message: 'ホーム画面に追加すると、アプリとして開けます',
      actionLabel: '追加',
      action: 'install-app',
    }));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallBanner();
    showToast('ホーム画面に追加しました');
  });

  // iOS Safari は beforeinstallprompt を発火しないので、条件を満たせば案内を出す
  if (isIos() && shouldOffer()) {
    mountBanner(banner({
      message: 'ホーム画面に追加できます（共有ボタンから）',
      actionLabel: '手順',
      action: 'show-ios-install',
    }));
  }
}

/* ---------------- 更新通知 ---------------- */

let applyUpdate = null;

export function reloadForUpdate() {
  if (!applyUpdate) return;
  const update = applyUpdate;
  applyUpdate = null;
  update(true); // 新しい Service Worker を有効化してリロードする
}

async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const { registerSW } = await import('virtual:pwa-register');
    applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh() {
        showToast('新しいバージョンがあります', {
          iconName: 'refresh-ccw',
          iconColor: 'text-blue-300',
        });
        mountBanner(banner({
          message: '新しいバージョンが届いています',
          actionLabel: '更新',
          action: 'reload-for-update',
        }));
      },
      onOfflineReady() {
        showToast('オフラインでも使えます', { iconName: 'check-circle-2' });
      },
      onRegisterError(error) {
        console.error('Service Worker の登録に失敗しました:', error);
      },
    });
  } catch (err) {
    console.error('Service Worker を初期化できませんでした:', err);
  }
}

/* ---------------- オフライン表示 ---------------- */

function setupConnectivityNotice() {
  window.addEventListener('offline', () => {
    showToast('オフラインです。保存した内容は接続時に同期されます', {
      iconName: 'wifi-off',
      iconColor: 'text-amber-400',
    });
  });

  window.addEventListener('online', () => {
    showToast('オンラインに戻りました', { iconName: 'check-circle-2' });
  });
}

export function initPwa() {
  setupInstallPrompt();
  setupConnectivityNotice();
  setupServiceWorker();
}
