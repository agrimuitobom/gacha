/**
 * Firestore / Storage セキュリティルールの検証。
 * 事前に `npm run emulators` で firestore と storage のエミュレータを起動しておくこと。
 */
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const results = [];
const record = (name, passed, detail = '') =>
  results.push(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

async function check(name, promise) {
  try {
    await promise;
    record(name, true);
  } catch (err) {
    record(name, false, err.message?.slice(0, 120));
  }
}

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-gacha',
  firestore: {
    host: '127.0.0.1',
    port: 8080,
    rules: readFileSync('firestore.rules', 'utf8'),
  },
  storage: {
    host: '127.0.0.1',
    port: 9199,
    rules: readFileSync('storage.rules', 'utf8'),
  },
});
await testEnv.clearFirestore();

const ALICE = 'alice';
const BOB = 'bob';
const alice = testEnv.authenticatedContext(ALICE).firestore();
const bob = testEnv.authenticatedContext(BOB).firestore();
const anon = testEnv.unauthenticatedContext().firestore();

const validItem = {
  category: 'tops',
  name: '白のオーバーサイズT',
  imageUrl: 'https://example.com/a.jpg',
  imagePath: `users/${ALICE}/closet/item1.jpg`,
  colorClass: 'bg-slate-100',
  warmth: 1,
  formality: 1,
  rainSafe: true,
  available: true,
  createdAt: 1757600000000,
};

const itemRef = (db, uid = ALICE, id = 'item1') => doc(db, 'users', uid, 'closetItems', id);

/* ---- 正常系 ---- */
await check('本人は自分のアイテムを作成できる', assertSucceeds(setDoc(itemRef(alice), validItem)));
await check('本人は自分のアイテムを読める', assertSucceeds(getDoc(itemRef(alice))));
await check('本人は自分のアイテムを削除できる',
  assertSucceeds(deleteDoc(doc(alice, 'users', ALICE, 'closetItems', 'tmp'))));

await check('本人は予定を作成できる', assertSucceeds(setDoc(
  doc(alice, 'users', ALICE, 'schedules', 's1'),
  { date: '2026-09-12', time: '19:00', title: '友人とお出かけ', createdAt: 1757600000000 }
)));

await check('本人はコーデ記録を作成できる', assertSucceeds(setDoc(
  doc(alice, 'users', ALICE, 'outfits', 'o1'),
  { date: '2026-09-12', outerId: 'coat1', topsId: 'item1', bottomsId: null, shoesId: null,
    decidedAt: 1757600000000, createdAt: 1757600000000 }
)));

await check('本人はサンプル投入済みフラグを書ける', assertSucceeds(setDoc(
  doc(alice, 'users', ALICE, 'meta', 'seed'), { seededAt: 1757600000000 }
)));
await check('meta に未知のフィールドは書けない', assertFails(setDoc(
  doc(alice, 'users', ALICE, 'meta', 'seed'), { seededAt: 1757600000000, isAdmin: true }
)));
await check('他人の meta は読めない',
  assertFails(getDoc(doc(bob, 'users', ALICE, 'meta', 'seed'))));

/* ---- 他人・未認証の遮断 ---- */
await check('他人は読めない', assertFails(getDoc(itemRef(bob))));
await check('他人は書き込めない', assertFails(setDoc(itemRef(bob), validItem)));
await check('未認証は読めない', assertFails(getDoc(itemRef(anon))));
await check('未認証は書き込めない', assertFails(setDoc(itemRef(anon), validItem)));
await check('users/ 配下以外は書き込めない',
  assertFails(setDoc(doc(alice, 'anything', 'x'), { a: 1 })));

/* ---- バリデーション ---- */
await check('不正なカテゴリは拒否',
  assertFails(setDoc(itemRef(alice, ALICE, 'bad1'), { ...validItem, category: 'hat' })));
await check('厚みが範囲外なら拒否',
  assertFails(setDoc(itemRef(alice, ALICE, 'bad2'), { ...validItem, warmth: 9 })));
await check('きれいめ度が範囲外なら拒否',
  assertFails(setDoc(itemRef(alice, ALICE, 'bad3'), { ...validItem, formality: 0 })));
await check('名前が空なら拒否',
  assertFails(setDoc(itemRef(alice, ALICE, 'bad4'), { ...validItem, name: '' })));
await check('名前が長すぎれば拒否',
  assertFails(setDoc(itemRef(alice, ALICE, 'bad5'), { ...validItem, name: 'あ'.repeat(41) })));
await check('未知のフィールドが混ざれば拒否',
  assertFails(setDoc(itemRef(alice, ALICE, 'bad6'), { ...validItem, isAdmin: true })));
await check('他人の領域を指す imagePath は拒否',
  assertFails(setDoc(itemRef(alice, ALICE, 'bad7'), { ...validItem, imagePath: `users/${BOB}/closet/x.jpg` })));
await check('available が無い古い形式のアイテムも通る', assertSucceeds(setDoc(
  itemRef(alice, ALICE, 'legacy-item'),
  { category: 'tops', name: '古いアイテム', imageUrl: null, imagePath: null,
    colorClass: 'bg-gray-100', warmth: 3, formality: 1, rainSafe: true,
    createdAt: 1757600000000 }
)));
await check('available が真偽値でなければ拒否',
  assertFails(setDoc(itemRef(alice, ALICE, 'bad9'), { ...validItem, available: 'yes' })));
await check('rainSafe が真偽値でなければ拒否',
  assertFails(setDoc(itemRef(alice, ALICE, 'bad8'), { ...validItem, rainSafe: 'yes' })));
await check('アウターを含まないコーデ記録も許容', assertSucceeds(setDoc(
  doc(alice, 'users', ALICE, 'outfits', 'o2'),
  { date: '2026-09-13', outerId: null, topsId: 'item1', bottomsId: null, shoesId: null,
    decidedAt: 1757600000000, createdAt: 1757600000000 }
)));
await check('outerId が無い古い形式のコーデ記録も通る', assertSucceeds(setDoc(
  doc(alice, 'users', ALICE, 'outfits', 'legacy'),
  { date: '2026-09-11', topsId: 'item1', bottomsId: null, shoesId: null,
    decidedAt: 1757600000000, createdAt: 1757600000000 }
)));
await check('コーデ記録に未知のフィールドは書けない', assertFails(setDoc(
  doc(alice, 'users', ALICE, 'outfits', 'o3'),
  { date: '2026-09-13', outerId: null, topsId: null, bottomsId: null, shoesId: null,
    decidedAt: 1757600000000, createdAt: 1757600000000, hatId: 'x' }
)));

/* ---- アクセサリー ---- */
await check('アクセサリーを登録できる',
  assertSucceeds(setDoc(itemRef(alice, ALICE, 'acc1'), { ...validItem, category: 'accessory' })));
await check('アクセサリーを含むコーデ記録を保存できる', assertSucceeds(setDoc(
  doc(alice, 'users', ALICE, 'outfits', 'o4'),
  { date: '2026-09-14', outerId: null, topsId: 'item1', bottomsId: null, shoesId: null,
    accessoryId: 'acc1', decidedAt: 1757600000000, createdAt: 1757600000000 }
)));

/* ---- 予定の通知先 ---- */
const validPush = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'BPx', auth: 'au',
  leadMinutes: 30, timeZone: 'Asia/Tokyo', createdAt: 1757600000000, updatedAt: 1757600000000,
};
const pushRef = (db, uid = ALICE, id = 'p1') => doc(db, 'users', uid, 'pushSubscriptions', id);
await check('本人は通知先を登録できる', assertSucceeds(setDoc(pushRef(alice), validPush)));
await check('他人の通知先は読めない', assertFails(getDoc(pushRef(bob))));
await check('通知先の endpoint は https のみ',
  assertFails(setDoc(pushRef(alice, ALICE, 'p2'), { ...validPush, endpoint: 'http://evil.example/x' })));
await check('通知のタイミングは選択肢の中だけ',
  assertFails(setDoc(pushRef(alice, ALICE, 'p3'), { ...validPush, leadMinutes: 1 })));
await check('通知先に未知のフィールドは書けない',
  assertFails(setDoc(pushRef(alice, ALICE, 'p4'), { ...validPush, uid: BOB })));
await check('送信記録は利用者から書けない', assertFails(setDoc(
  doc(alice, 'users', ALICE, 'reminderLog', 's1'), { key: 'x' })));

await check('日付形式が不正な予定は拒否', assertFails(setDoc(
  doc(alice, 'users', ALICE, 'schedules', 'bad'),
  { date: '2026/9/12', time: '19:00', title: 'x', createdAt: 1757600000000 }
)));
await check('タイトルが長すぎる予定は拒否', assertFails(setDoc(
  doc(alice, 'users', ALICE, 'schedules', 'bad2'),
  { date: '2026-09-12', time: '19:00', title: 'あ'.repeat(61), createdAt: 1757600000000 }
)));

/* ---- Storage ---- */
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const aliceStorage = testEnv.authenticatedContext(ALICE).storage();
const bobStorage = testEnv.authenticatedContext(BOB).storage();

await check('本人は自分の領域に JPEG を保存できる', assertSucceeds(
  uploadBytes(ref(aliceStorage, `users/${ALICE}/closet/a.jpg`), jpeg, { contentType: 'image/jpeg' })
));
await check('他人の領域には保存できない', assertFails(
  uploadBytes(ref(bobStorage, `users/${ALICE}/closet/b.jpg`), jpeg, { contentType: 'image/jpeg' })
));
await check('他人の画像は読めない', assertFails(
  getBytes(ref(bobStorage, `users/${ALICE}/closet/a.jpg`))
));
await check('本人は WebP も保存できる', assertSucceeds(
  uploadBytes(ref(aliceStorage, `users/${ALICE}/closet/a.webp`), jpeg, { contentType: 'image/webp' })
));
await check('JPEG / WebP 以外は拒否', assertFails(
  uploadBytes(ref(aliceStorage, `users/${ALICE}/closet/c.png`), jpeg, { contentType: 'image/png' })
));
await check('1MB を超えるファイルは拒否', assertFails(
  uploadBytes(ref(aliceStorage, `users/${ALICE}/closet/big.jpg`), new Uint8Array(1 * 1024 * 1024 + 10), {
    contentType: 'image/jpeg',
  })
));
await check('クローゼット以外のパスは拒否', assertFails(
  uploadBytes(ref(aliceStorage, `users/${ALICE}/secret/x.jpg`), jpeg, { contentType: 'image/jpeg' })
));

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await testEnv.cleanup();
process.exit(failed === 0 ? 0 : 1);
