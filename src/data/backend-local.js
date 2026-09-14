import { ALL_COLLECTIONS } from './collections.js';

/**
 * IndexedDB バックエンド。
 * Firebase 未設定時、およびオフライン開発時に使用する。
 * IndexedDB が使えない環境（プライベートブラウジング等）では
 * メモリ保存へ自動フォールバックし、アプリを落とさない。
 */

const DB_NAME = 'coordi-gacha';
// オブジェクトストアを増やしたらここを上げる（2 で meta を追加）
const DB_VERSION = 2;

export function createLocalBackend() {
  let dbPromise = null;
  let useMemory = false;
  const memory = new Map(ALL_COLLECTIONS.map((name) => [name, new Map()]));

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in globalThis)) {
        reject(new Error('IndexedDB is unavailable'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of ALL_COLLECTIONS) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
    return dbPromise;
  }

  function runTransaction(name, mode, run) {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const transaction = db.transaction(name, mode);
          const request = run(transaction.objectStore(name));
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        })
    );
  }

  async function guard(name, mode, run, fallback) {
    if (useMemory) return fallback();
    try {
      return await runTransaction(name, mode, run);
    } catch (err) {
      console.warn('IndexedDB が使えないためメモリ保存に切り替えます:', err);
      useMemory = true;
      return fallback();
    }
  }

  return {
    kind: 'local',
    async init() {},

    list(name) {
      return guard(
        name,
        'readonly',
        (store) => store.getAll(),
        () => Array.from(memory.get(name).values())
      );
    },

    get(name, id) {
      return guard(
        name,
        'readonly',
        (store) => store.get(id),
        () => memory.get(name).get(id) ?? null
      ).then((doc) => doc ?? null);
    },

    /**
     * 条件に合うものだけを返す。
     * ローカルは取得コストが無いので、全件読んでから絞る。
     * （Firebase 側は同じ条件を Firestore のクエリに変換する）
     */
    query(name, { where = [], limit } = {}) {
      return guard(
        name,
        'readonly',
        (store) => store.getAll(),
        () => Array.from(memory.get(name).values())
      ).then((docs) => {
        const matched = docs.filter((doc) =>
          where.every(([field, op, value]) => {
            const actual = doc[field];
            if (op === '==') return actual === value;
            if (op === '>=') return actual >= value;
            if (op === '<=') return actual <= value;
            throw new Error(`未対応の演算子: ${op}`);
          })
        );
        return typeof limit === 'number' ? matched.slice(0, limit) : matched;
      });
    },

    put(name, doc) {
      return guard(
        name,
        'readwrite',
        (store) => store.put(doc),
        () => memory.get(name).set(doc.id, doc)
      ).then(() => doc);
    },

    remove(name, id) {
      return guard(
        name,
        'readwrite',
        (store) => store.delete(id),
        () => memory.get(name).delete(id)
      );
    },

    /** この端末のブラウザにしか保存されていない、という状態を返す */
    async getAccount() {
      return { mode: 'local', canLink: false };
    },

    /** ローカルでは data URL をそのまま保持する */
    async uploadImage(itemId, image) {
      return { url: image.dataUrl, path: null };
    },

    async deleteImage() {},
  };
}
