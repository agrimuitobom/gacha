import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where as whereClause,
  orderBy,
  limit as limitClause,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadString,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { getFirebase, ensureSignedIn, linkGoogleAccount, signOutUser } from './firebase-app.js';

/**
 * Firebase バックエンド。
 *
 * データは users/{uid}/{collection}/{docId} のサブコレクションに置く。
 * トップレベルに置いて userId で絞る方式に比べ、
 *   - セキュリティルールが1行で書ける
 *   - 複合インデックスが要らない
 *   - 他ユーザーのドキュメントを取得する経路がそもそも存在しない
 * という利点がある。
 *
 * 画像は Cloud Storage の users/{uid}/closet/{itemId}.jpg に置き、
 * ドキュメントには downloadURL を保持する。
 */
export function createFirebaseBackend() {
  let uid = null;

  function userCollection(name) {
    const { db } = getFirebase();
    return collection(db, 'users', uid, name);
  }

  return {
    kind: 'firebase',

    async init() {
      const user = await ensureSignedIn();
      uid = user.uid;
      return user;
    },

    async list(name) {
      const snapshot = await getDocs(query(userCollection(name), orderBy('createdAt', 'desc')));
      return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    },

    async get(name, id) {
      const { db } = getFirebase();
      const snapshot = await getDoc(doc(db, 'users', uid, name, id));
      return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    },

    /**
     * 条件に合うものだけを読む。
     *
     * Firestore は読み取ったドキュメント数で課金されるので、
     * 全件取ってから絞ると、データが増えるほど費用と待ち時間が増える。
     *
     * orderBy は付けない。等価条件と別フィールドの並べ替えを混ぜると
     * 複合インデックスが要るが、絞り込んだ後の件数は少ないので
     * 呼び出し側で並べ替えれば足りる。
     */
    async query(name, { where = [], limit } = {}) {
      const constraints = where.map(([field, op, value]) => whereClause(field, op, value));
      if (typeof limit === 'number') constraints.push(limitClause(limit));
      const snapshot = await getDocs(query(userCollection(name), ...constraints));
      return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    },

    async put(name, document) {
      const { db } = getFirebase();
      const { id, ...fields } = document;
      await setDoc(doc(db, 'users', uid, name, id), fields, { merge: false });
      return document;
    },

    async remove(name, id) {
      const { db } = getFirebase();
      await deleteDoc(doc(db, 'users', uid, name, id));
    },

    /**
     * 現在のアカウントの状態。
     *   anonymous … 匿名のまま。この端末のブラウザを消すとデータに戻れない
     *   linked    … Google アカウントに紐づいていて、他の端末からも開ける
     */
    async getAccount() {
      const { auth } = getFirebase();
      const user = auth.currentUser;
      if (!user) return { mode: 'signed-out', canLink: true };

      const google = user.providerData.find((p) => p.providerId === 'google.com');
      return {
        mode: user.isAnonymous ? 'anonymous' : 'linked',
        canLink: true,
        canSignOut: !user.isAnonymous,
        displayName: google?.displayName || user.displayName || null,
        email: google?.email || user.email || null,
        uid: user.uid,
      };
    },

    /**
     * Google アカウントに紐づける。
     * @returns {{ carriedOver: boolean }} 匿名時のデータを引き継げたか
     */
    async linkAccount() {
      const { auth } = getFirebase();
      const wasAnonymous = auth.currentUser?.isAnonymous === true;
      const previousUid = auth.currentUser?.uid;

      const user = await linkGoogleAccount();
      uid = user.uid;

      // uid が変わった場合は別アカウントへのサインインなので、
      // 匿名で貯めたデータは引き継がれていない
      return { carriedOver: wasAnonymous && user.uid === previousUid };
    },

    async signOut() {
      await signOutUser();
      uid = null;
    },

    async uploadImage(itemId, image) {
      const { storage } = getFirebase();
      // 拡張子は実際の形式に合わせる（端末により WebP か JPEG）
      const path = `users/${uid}/closet/${itemId}.${image.extension}`;
      const fileRef = storageRef(storage, path);
      // data_url 指定なので base64 は復号されて保存される（33%の水増しは乗らない）
      await uploadString(fileRef, image.dataUrl, 'data_url', { contentType: image.contentType });
      return { url: await getDownloadURL(fileRef), path };
    },

    async deleteImage(path) {
      if (!path) return;
      const { storage } = getFirebase();
      try {
        await deleteObject(storageRef(storage, path));
      } catch (err) {
        // 既に消えている場合は無視する（ドキュメント削除は続行させたい）
        if (err.code !== 'storage/object-not-found') throw err;
      }
    },
  };
}
