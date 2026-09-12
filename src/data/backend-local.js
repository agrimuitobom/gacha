import { ALL_COLLECTIONS } from './collections.js';

/**
 * IndexedDB バックエンド。
 * Firebase 未設定時、およびオフライン開発時に使用する。
 * IndexedDB が使えない環境（プライベートブラウジング等）では
 * メモリ保存へ自動フォールバックし、アプリを落とさない。
 */

const DB_NAME = 'coordi-gacha';
const DB_VERSION = 1;

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

    /** ローカルでは data URL をそのまま保持する */
    async uploadImage(itemId, image) {
      return { url: image.dataUrl, path: null };
    },

    async deleteImage() {},
  };
}
