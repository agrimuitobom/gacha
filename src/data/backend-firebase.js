import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadString,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { getFirebase, ensureSignedIn } from './firebase-app.js';

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

    async uploadImage(itemId, dataUrl) {
      const { storage } = getFirebase();
      const path = `users/${uid}/closet/${itemId}.jpg`;
      const fileRef = storageRef(storage, path);
      await uploadString(fileRef, dataUrl, 'data_url', { contentType: 'image/jpeg' });
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
