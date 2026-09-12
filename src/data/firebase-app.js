import { initializeApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  linkWithPopup,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { firebaseConfig, useEmulator } from '../config/env.js';

let services = null;

/** Firebase SDK を初期化する（多重初期化しない） */
export function getFirebase() {
  if (services) return services;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  // オフラインでも読み書きできるようにローカルキャッシュを有効化する。
  // 複数タブで開いても壊れないよう multi-tab manager を使う。
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  const storage = getStorage(app);

  if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }

  services = { app, auth, db, storage };
  return services;
}

/**
 * サインインを保証する。
 *
 * 既定は匿名認証：インストール直後から何も聞かずに使えるようにするため。
 * 端末をまたいで同期したくなった時点で linkGoogleAccount() を呼ぶと、
 * 匿名アカウントのデータを引き継いだまま Google アカウントに昇格できる。
 */
export function ensureSignedIn() {
  const { auth } = getFirebase();

  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        unsubscribe();
        if (user) {
          resolve(user);
          return;
        }
        try {
          const credential = await signInAnonymously(auth);
          resolve(credential.user);
        } catch (err) {
          reject(err);
        }
      },
      reject
    );
  });
}

/** 匿名アカウントを Google アカウントへ昇格させる（データは引き継がれる） */
export async function linkGoogleAccount() {
  const { auth } = getFirebase();
  const provider = new GoogleAuthProvider();
  const user = auth.currentUser;

  if (user && user.isAnonymous) {
    try {
      const credential = await linkWithPopup(user, provider);
      return credential.user;
    } catch (err) {
      // その Google アカウントが既に使われている場合は、通常のサインインに切り替える。
      // （匿名側のデータは引き継がれないため、呼び出し側で警告する）
      if (err.code === 'auth/credential-already-in-use') {
        const credential = await signInWithPopup(auth, provider);
        return credential.user;
      }
      throw err;
    }
  }

  const credential = await signInWithPopup(auth, provider);
  return credential.user;
}

export function watchAuthState(callback) {
  const { auth } = getFirebase();
  return onAuthStateChanged(auth, callback);
}

export function signOutUser() {
  const { auth } = getFirebase();
  return signOut(auth);
}
