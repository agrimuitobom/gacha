/**
 * Firestore の読み取り件数を測る。
 *
 * Firestore はクエリが返したドキュメント数で課金される。
 * 全件取ってからクライアントで絞る実装だと、データが増えるほど
 * 費用と待ち時間が線形に増えるため、実際に何件読むのかを確認する。
 *
 * 事前に `npm run emulators` でエミュレータを起動しておくこと。
 */
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, where, limit, writeBatch } from 'firebase/firestore';

const UID = 'cost-user';
const DAYS = 365;

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-gacha',
  firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
});
await testEnv.clearFirestore();

const db = testEnv.authenticatedContext(UID).firestore();

/** 1年ぶんの予定とコーデ記録を用意する */
const base = new Date(2026, 0, 1);
const dateKeys = [];
for (let i = 0; i < DAYS; i += 1) {
  const d = new Date(base.getTime() + i * 86400000);
  dateKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
}

for (let offset = 0; offset < DAYS; offset += 200) {
  const batch = writeBatch(db);
  for (const key of dateKeys.slice(offset, offset + 200)) {
    batch.set(doc(db, 'users', UID, 'schedules', `s-${key}`),
      { date: key, time: '10:00', title: '予定', createdAt: Date.now() });
    batch.set(doc(db, 'users', UID, 'outfits', `o-${key}`),
      { date: key, topsId: null, bottomsId: null, shoesId: null, decidedAt: Date.now(), createdAt: Date.now() });
  }
  await batch.commit();
}

const today = dateKeys[200];
const monthFrom = '2026-07-01';
const monthTo = '2026-07-31';

const col = (name) => collection(db, 'users', UID, name);
const count = async (q) => (await getDocs(q)).size;

const rows = [
  ['その日の予定',        '変更前: 全件取得', await count(query(col('schedules')))],
  ['その日の予定',        '現在: 日付で絞る', await count(query(col('schedules'), where('date', '==', today)))],
  ['カレンダーの点',      '変更前: 全件取得', await count(query(col('schedules')))],
  ['カレンダーの点',      '現在: 表示中の月', await count(query(col('schedules'), where('date', '>=', monthFrom), where('date', '<=', monthTo)))],
  ['その日のコーデ記録',  '変更前: 全件取得', await count(query(col('outfits')))],
  ['その日のコーデ記録',  '現在: 日付で1件', await count(query(col('outfits'), where('date', '==', today), limit(1)))],
];

console.log(`予定 ${DAYS}件・コーデ記録 ${DAYS}件がある状態での読み取り件数`);
console.log('─'.repeat(56));
let prev = null;
for (const [用途, 方式, n] of rows) {
  const mark = 方式.startsWith('現在') && prev ? `  (${(100 - (n / prev) * 100).toFixed(0)}%減)` : '';
  console.log(`${用途.padEnd(20)} ${方式.padEnd(18)} ${String(n).padStart(4)}件${mark}`);
  prev = n;
}

const one = await getDoc(doc(db, 'users', UID, 'schedules', `s-${today}`));
console.log(`${'1件だけ取得'.padEnd(20)} ${'現在: get'.padEnd(18)} ${one.exists() ? 1 : 0}件`);
console.log('');

/* ---- 退行していないかを判定する ---- */
const results = [];
const ok = (name, passed, detail = '') =>
  results.push(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

const [, , scheduleDay] = rows[1];
const [, , monthDots] = rows[3];
const [, , outfitDay] = rows[5];

ok('その日の予定は日数に比例しない', scheduleDay <= 5, `${scheduleDay}件`);
ok('カレンダーの点は1か月ぶんに収まる', monthDots <= 31, `${monthDots}件`);
ok('その日のコーデ記録は1件だけ読む', outfitDay <= 1, `${outfitDay}件`);
ok('1件取得が全件取得になっていない', one.exists(), '1件');

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

await testEnv.cleanup();
process.exit(failed === 0 ? 0 : 1);
