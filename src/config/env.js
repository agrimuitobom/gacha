/**
 * 環境設定。
 * Firebase の設定値が揃っている場合のみ Firebase バックエンドを使い、
 * 未設定ならブラウザ内 (IndexedDB) 保存で動作する。
 * これにより、Firebase プロジェクトが無くてもアプリ全体を開発・テストできる。
 */

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'appId'];

export const isFirebaseConfigured = REQUIRED_KEYS.every(
  (key) => typeof firebaseConfig[key] === 'string' && firebaseConfig[key].length > 0
);

export const useEmulator = env.VITE_USE_FIREBASE_EMULATOR === 'true';
