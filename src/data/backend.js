import { isFirebaseConfigured } from '../config/env.js';
import { createLocalBackend } from './backend-local.js';

/**
 * 使用するバックエンドを決める。
 * Firebase の設定が揃っていれば Firebase、無ければローカル保存。
 *
 * Firebase SDK は動的 import なので、未設定の環境ではバンドルの
 * ダウンロード自体が発生しない。
 */

let backendPromise = null;
let activeBackend = null;

async function selectBackend() {
  if (isFirebaseConfigured) {
    try {
      const { createFirebaseBackend } = await import('./backend-firebase.js');
      const backend = createFirebaseBackend();
      await backend.init();
      return backend;
    } catch (err) {
      // 認証や通信に失敗してもアプリを使えなくしない。
      // ローカル保存に退避し、呼び出し側が利用者に伝えられるようフラグを立てる。
      console.error('Firebase に接続できないためローカル保存に切り替えます:', err);
      const backend = createLocalBackend();
      await backend.init();
      backend.degradedFrom = 'firebase';
      backend.degradeReason = err;
      return backend;
    }
  }

  const backend = createLocalBackend();
  await backend.init();
  return backend;
}

export function getBackend() {
  if (!backendPromise) {
    backendPromise = selectBackend().then((backend) => {
      activeBackend = backend;
      return backend;
    });
  }
  return backendPromise;
}

/** 初期化済みバックエンドを同期的に参照する（init 完了後のみ有効） */
export function peekBackend() {
  return activeBackend;
}
