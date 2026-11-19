import { getBackend } from './backend.js';
import { PUSH_SUBSCRIPTIONS } from './collections.js';
import { vapidPublicKey } from '../config/env.js';
import { DEFAULT_LEAD_MINUTES } from '../domain/reminders.js';

/**
 * 予定のプッシュ通知の購読。
 *
 * ブラウザの PushSubscription（送り先）を users/{uid}/pushSubscriptions に保存し、
 * GitHub Actions の定期実行（reminders/send.mjs）がそれを見て送る。
 * 送り先は端末ごとに違うので、端末ごとに1件ずつ持つ。
 *
 * 送信側がサーバに置かれるので、Firebase で同期しているときだけ使える。
 * ブラウザ内保存だけの構成では、送る側が予定を読めない。
 */

/**
 * いま通知を有効にできるか。できないなら理由を返す。
 *   unsupported   … ブラウザが対応していない
 *   ios-browser   … iOS でホーム画面に追加していない（Safari のタブでは使えない）
 *   no-sync       … Firebase で同期していない
 *   no-key        … VAPID 公開鍵が設定されていない（デプロイ側の設定）
 *   denied        … 利用者が通知をブロックしている
 */
export async function pushAvailability() {
  const backend = await getBackend();
  if (backend.kind !== 'firebase') return 'no-sync';
  if (!vapidPublicKey) return 'no-key';

  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) return isIos() && !isStandalone() ? 'ios-browser' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

/** 送り先 URL から決まる ID。同じ端末で入れ直しても1件にまとまる */
async function idFor(endpoint) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function currentBrowserSubscription() {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * この端末の通知設定。無効なら null。
 * ブラウザ側の購読とサーバ側の記録が両方そろって初めて「有効」とみなす。
 * 片方だけだと、届かないのに「オン」と表示してしまう。
 */
export async function getPushSettings() {
  if (await pushAvailability() !== 'ok') return null;
  const subscription = await currentBrowserSubscription();
  if (!subscription) return null;
  const backend = await getBackend();
  return backend.get(PUSH_SUBSCRIPTIONS, await idFor(subscription.endpoint));
}

/** 通知を有効にする（許可ダイアログはここで出る。必ずタップから呼ぶこと） */
export async function enablePush({ leadMinutes = DEFAULT_LEAD_MINUTES } = {}) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    const error = new Error('通知が許可されませんでした');
    error.code = permission === 'denied' ? 'denied' : 'dismissed';
    throw error;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

  return saveSubscription(subscription, { leadMinutes });
}

async function saveSubscription(subscription, { leadMinutes }) {
  const json = subscription.toJSON();
  const backend = await getBackend();
  const id = await idFor(json.endpoint);
  const existing = await backend.get(PUSH_SUBSCRIPTIONS, id);
  const now = Date.now();

  return backend.put(PUSH_SUBSCRIPTIONS, {
    id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    leadMinutes,
    // 送信側は UTC で動くので、利用者の「14:00」がいつなのかを知るために要る
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
}

/** 何分前に知らせるかを変える */
export async function updateLeadMinutes(leadMinutes) {
  const subscription = await currentBrowserSubscription();
  if (!subscription) throw new Error('通知が有効になっていません');
  return saveSubscription(subscription, { leadMinutes });
}

/**
 * 通知を止める。サーバ側の記録を先に消す。
 * ブラウザ側だけ外すと、送信側が送り続けて失敗を重ねることになる。
 */
export async function disablePush() {
  const subscription = await currentBrowserSubscription();
  if (!subscription) return;
  const backend = await getBackend();
  if (backend.kind === 'firebase') {
    await backend.remove(PUSH_SUBSCRIPTIONS, await idFor(subscription.endpoint));
  }
  await subscription.unsubscribe();
}
