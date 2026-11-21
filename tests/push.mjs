/**
 * 予定のプッシュ通知を、端から端まで検証する（Firebase エミュレータ前提）。
 *
 *   1. 設定画面で通知をオンにすると、送り先が Firestore に保存される
 *   2. 送信スクリプト（reminders/send.mjs）が、近づいた予定だけを送る
 *   3. 二度目の実行では同じ通知を送らない
 *   4. 送り先が消えていたら（410）、記録を削除する
 *   5. Service Worker が受け取ったプッシュを通知として表示する
 *   6. 通知をオフにすると、送り先が Firestore から消える
 *
 * ブラウザの本物の送り先（FCM など）には外へ出ないと届かないので、
 * PushManager.subscribe を差し替え、送り先をこのテストの HTTPS サーバにしている。
 *
 *   npm run test:push   （エミュレータの起動・停止まで自動）
 */
import { createServer } from 'node:https';
import { createECDH, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { launchChromium } from './browser.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const PROJECT_ID = 'demo-gacha';
const FIRESTORE = '127.0.0.1:8080';
// .env.emulator の VITE_VAPID_PUBLIC_KEY と対になるテスト専用の鍵
const TEST_VAPID = {
  publicKey: 'BF1I_EzCse0NFy_YJNIz9kLfgpOceVf4u_r1u3BMUE7W7KBpca6C9mRzkBueRZ3_KoqZr2saH5ygzT99O5Av5NU',
  privateKey: 'QBKxFlBkMCHVgx33piNrYfZbZixTFXHUdA5vXIVISoM',
};

const results = [];
const ok = (name, passed, detail = '') =>
  results.push(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

/* ---------- 偽のプッシュサービス（HTTPS） ---------- */

const run = promisify(execFile);
const keyFile = join(tmpdir(), `push-test-key-${process.pid}.pem`);
const certFile = join(tmpdir(), `push-test-cert-${process.pid}.pem`);
await run('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
  '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=127.0.0.1']);

let pushStatus = 201;
const received = [];
const pushServer = createServer(
  { key: await readFile(keyFile), cert: await readFile(certFile) },
  (req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      received.push({ headers: req.headers, size: Buffer.concat(chunks).length });
      res.writeHead(pushStatus).end();
    });
  }
);
await new Promise((resolve) => pushServer.listen(0, '127.0.0.1', resolve));
const ENDPOINT = `https://127.0.0.1:${pushServer.address().port}/push/test-device`;

// 暗号化に使う、端末側の鍵（本物の P-256 でないと送信側が暗号化できない）
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const fakeKeys = {
  p256dh: ecdh.getPublicKey().toString('base64url'),
  auth: randomBytes(16).toString('base64url'),
};

/* ---------- ブラウザ ---------- */

const browser = await launchChromium();
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 420, height: 880 } });
await context.grantPermissions(['notifications'], { origin: new URL(BASE_URL).origin });
await context.route('**/api.open-meteo.com/**', (r) => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({
    current_weather: { temperature: 20, weathercode: 0, time: '2026-09-12T12:00' },
    hourly: { time: ['2026-09-12T12:00'], precipitation_probability: [0] },
  }),
}));

// 送り先をこのテストのサーバに向ける
await context.addInitScript(({ endpoint, keys }) => {
  let current = null;
  const make = () => ({
    endpoint,
    toJSON: () => ({ endpoint, keys }),
    unsubscribe: async () => { current = null; return true; },
  });
  PushManager.prototype.subscribe = async function subscribe(options) {
    window.__subscribeOptions = { userVisibleOnly: options.userVisibleOnly, keyLength: options.applicationServerKey?.byteLength };
    current = make();
    return current;
  };
  PushManager.prototype.getSubscription = async function getSubscription() { return current; };
}, { endpoint: ENDPOINT, keys: fakeKeys });

const page = await context.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

await page.goto(BASE_URL);
await page.waitForFunction(() => navigator.serviceWorker?.controller || null, null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2500);

const consoleLines = [];
page.on('console', (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));

await page.click('[data-action="open-settings"]');
const appeared = await page.waitForSelector('#notify-body [data-action="enable-push"]', { timeout: 10000 })
  .then(() => true).catch(() => false);
if (!appeared) {
  // 何が表示されたかを出さないと、CI でだけ落ちたときに原因が分からない
  const env = await page.evaluate(() => ({
    text: document.getElementById('notify-body')?.textContent.trim(),
    push: 'PushManager' in window,
    notification: 'Notification' in window ? Notification.permission : 'none',
    secure: window.isSecureContext,
    ua: navigator.userAgent,
  }));
  console.error('通知欄の表示:', JSON.stringify(env, null, 2));
  console.error(consoleLines.slice(-20).join('\n'));
  process.exit(1);
}
ok('設定画面に「通知をオンにする」が出る', true);

await page.selectOption('#notify-lead', '30');
await page.click('[data-action="enable-push"]');
await page.waitForSelector('#notify-body [data-action="disable-push"]', { timeout: 10000 });
ok('オンにすると「この端末に通知します」に変わる',
  (await page.textContent('#notify-body')).includes('この端末に通知します'));

const options = await page.evaluate(() => window.__subscribeOptions);
ok('VAPID 公開鍵（65 バイト）で購読している', options?.keyLength === 65 && options?.userVisibleOnly === true,
  JSON.stringify(options));

// アプリ自身の Firestore 接続を通して、保存された内容を確かめる
const uid = await page.evaluate(async () => {
  for (const key of Object.keys(localStorage)) if (key.startsWith('firebase:authUser')) return JSON.parse(localStorage[key]).uid;
  const db = await new Promise((resolve) => {
    const req = indexedDB.open('firebaseLocalStorageDb');
    req.onsuccess = () => resolve(req.result);
  });
  const rows = await new Promise((resolve) => {
    const req = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
    req.onsuccess = () => resolve(req.result);
  });
  return rows.find((row) => row.fbase_key.startsWith('firebase:authUser'))?.value.uid;
});
ok('匿名ユーザーでサインインしている', Boolean(uid), uid);

/* ---------- Admin SDK でエミュレータを直接見る ---------- */

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
// firebase-admin は送信側（reminders/）の依存なので、そこから読み込む
const requireFromReminders = createRequire(new URL('../reminders/package.json', import.meta.url));
const { initializeApp } = requireFromReminders('firebase-admin/app');
const { getFirestore } = requireFromReminders('firebase-admin/firestore');
const db = getFirestore(initializeApp({ projectId: PROJECT_ID }, 'push-test'));
const userRef = db.collection('users').doc(uid);

const subs = (await userRef.collection('pushSubscriptions').get()).docs.map((d) => d.data());
ok('送り先が Firestore に保存される', subs.length === 1 && subs[0].endpoint === ENDPOINT,
  `${subs.length}件`);
ok('タイミングとタイムゾーンも保存される',
  subs[0]?.leadMinutes === 30 && typeof subs[0]?.timeZone === 'string', `${subs[0]?.leadMinutes} / ${subs[0]?.timeZone}`);

// 20分後に始まる予定（30分前を過ぎている）と、3時間後の予定（まだ早い）
const tz = subs[0].timeZone;
const wall = (offsetMin) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(Date.now() + offsetMin * 60000)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};
const soon = wall(20);
const later = wall(180);
await userRef.collection('schedules').doc('soon').set({ ...soon, title: 'ランチ', createdAt: Date.now() });
await userRef.collection('schedules').doc('later').set({ ...later, title: '映画', createdAt: Date.now() });

async function sendOnce() {
  try {
    const { stdout } = await run('node', ['reminders/send.mjs'], {
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: FIRESTORE,
        FIREBASE_PROJECT_ID: PROJECT_ID,
        VAPID_PUBLIC_KEY: TEST_VAPID.publicKey,
        VAPID_PRIVATE_KEY: TEST_VAPID.privateKey,
        VAPID_SUBJECT: 'https://example.com',
        // 偽のプッシュサービスは自己署名証明書なので、この子プロセスに限って検証を外す
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
      },
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.code, stdout: `${err.stdout}${err.stderr}` };
  }
}

const first = await sendOnce();
ok('送信スクリプトが正常終了する', first.code === 0, first.code === 0 ? first.stdout.trim().split('\n').pop() : first.stdout.slice(0, 600));
ok('近づいた予定だけを1件送る', received.length === 1, `${received.length}件`);
ok('VAPID 署名と暗号化つきで送る',
  /^vapid t=.+, k=.+/.test(received[0]?.headers.authorization || '') && received[0]?.headers['content-encoding'] === 'aes128gcm',
  `${received[0]?.headers['content-encoding']}`);
const log = await userRef.collection('reminderLog').get();
ok('送ったことが記録される', log.size === 1);

const second = await sendOnce();
ok('二度目の実行では同じ通知を送らない', second.code === 0 && received.length === 1, `${received.length}件`);

// 予定の時刻を変えたら、もう一度知らせる
const moved = wall(25);
await userRef.collection('schedules').doc('soon').set({ ...moved, title: 'ランチ', createdAt: Date.now() });
pushStatus = 410;
const third = await sendOnce();
ok('送り先が消えていたら（410）記録を削除する',
  third.code === 0 && (await userRef.collection('pushSubscriptions').get()).size === 0, third.stdout.trim().split('\n').pop());

/* ---------- Service Worker が通知を表示するか ---------- */

const cdp = await context.newCDPSession(page);
const registrations = [];
cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations: list }) => registrations.push(...list));
await cdp.send('ServiceWorker.enable');
await page.waitForTimeout(500);
const registration = registrations.find((r) => !r.isDeleted);
if (registration) {
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: new URL(BASE_URL).origin,
    registrationId: registration.registrationId,
    data: JSON.stringify({ title: '12:00 ランチ', body: '30分後に始まります', tag: 'schedule-x' }),
  });
  // waitForFunction は async の判定関数を待たないので、自前で繰り返す
  let shown = null;
  for (let attempt = 0; attempt < 20 && !shown; attempt += 1) {
    shown = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const list = await reg.getNotifications();
      return list.length ? { title: list[0].title, body: list[0].body, url: list[0].data?.url } : null;
    });
    if (!shown) await page.waitForTimeout(250);
  }
  ok('受け取ったプッシュを通知として表示する', shown?.title === '12:00 ランチ', JSON.stringify(shown));
  ok('通知を開くとカレンダーへ', shown?.url === '/?screen=calendar');
} else {
  ok('Service Worker が登録されている', false);
}

/* ---------- オフにする ---------- */

// 410 で消えたので入れ直してから、オフにする
pushStatus = 201;
await page.reload();
await page.waitForTimeout(2500);
await page.click('[data-action="open-settings"]');
await page.waitForSelector('#notify-body [data-action="enable-push"]', { timeout: 10000 });
ok('読み込み直しても、もう一度オンにできる', true);
await page.click('[data-action="enable-push"]');
await page.waitForSelector('#notify-body [data-action="disable-push"]', { timeout: 10000 });
await page.click('[data-action="disable-push"]');
await page.waitForSelector('#notify-body [data-action="enable-push"]', { timeout: 10000 });
ok('オフにすると送り先が Firestore から消える',
  (await userRef.collection('pushSubscriptions').get()).size === 0);

ok('JSエラーが発生していない', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
pushServer.close();
await rm(keyFile, { force: true });
await rm(certFile, { force: true });

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed > 0) process.exitCode = 1;
process.exit();
