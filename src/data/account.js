import { getBackend } from './backend.js';

/**
 * アカウントの状態と、Google アカウントへの紐づけ。
 *
 * 既定は匿名認証で、すぐ使い始められる代わりに
 * ブラウザのデータを消すか機種変更すると二度と戻れない。
 * 登録した服の写真を失わないための導線がここ。
 */
export const accountRepo = {
  /**
   * @returns {Promise<{
   *   mode: 'local'|'anonymous'|'linked'|'signed-out',
   *   canLink: boolean, canSignOut?: boolean,
   *   displayName?: string|null, email?: string|null,
   *   degraded?: boolean,
   * }>}
   */
  async get() {
    const backend = await getBackend();
    const account = await backend.getAccount();
    // Firebase の設定はあるのに接続できず、ローカルに退避している状態
    return { ...account, degraded: backend.degradedFrom === 'firebase' };
  },

  async link() {
    const backend = await getBackend();
    if (typeof backend.linkAccount !== 'function') {
      throw new Error('この構成ではアカウント連携を使えません');
    }
    return backend.linkAccount();
  },

  async signOut() {
    const backend = await getBackend();
    if (typeof backend.signOut !== 'function') return;
    await backend.signOut();
  },
};
