import { getBackend } from './backend.js';

/**
 * アカウントの状態と、Google アカウントへの紐づけ。
 *
 * 既定は匿名認証で、すぐ使い始められる代わりに
 * ブラウザのデータを消すか機種変更すると二度と戻れない。
 * 登録した服の写真を失わないための導線がここ。
 */
/**
 * 退避した理由が「待てば直るもの」か「設定を直さないと直らないもの」か。
 *
 * 一律に「接続が戻ってから開き直してください」と出していたが、
 * 設定が原因のときは待っても永久に直らない。実際、匿名認証が無効なまま
 * だと signInAnonymously が auth/admin-restricted-operation で落ち、
 * ローカル保存に退避したまま Google 連携の導線ごと消えていた。
 */
const NETWORK_CODES = new Set([
  'auth/network-request-failed',
  'auth/timeout',
  'unavailable',
  'deadline-exceeded',
]);

export const degradeKindOf = (code) => (NETWORK_CODES.has(code) ? 'network' : 'config');

export const accountRepo = {
  /**
   * @returns {Promise<{
   *   mode: 'local'|'anonymous'|'linked'|'signed-out',
   *   canLink: boolean, canSignOut?: boolean,
   *   displayName?: string|null, email?: string|null,
   *   degraded?: boolean, degradeCode?: string|null, degradeKind?: 'network'|'config',
   * }>}
   */
  async get() {
    const backend = await getBackend();
    const account = await backend.getAccount();
    // Firebase の設定はあるのに接続できず、ローカルに退避している状態
    const degraded = backend.degradedFrom === 'firebase';
    if (!degraded) return { ...account, degraded: false };

    const code = backend.degradeReason?.code || null;
    return { ...account, degraded: true, degradeCode: code, degradeKind: degradeKindOf(code) };
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
