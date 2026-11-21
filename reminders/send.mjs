/**
 * 予定のリマインド通知を送る。GitHub Actions の定期実行（.github/workflows/reminders.yml）から呼ぶ。
 *
 * Cloud Functions の定期実行は Blaze プラン（従量課金・カード登録）が要るので、
 * Spark プランのまま運用するために GitHub Actions から動かしている。
 *
 *   1. 全員の通知先（users/{uid}/pushSubscriptions）を読む
 *   2. 人ごとに、今日・明日の予定を読む
 *   3. 送る時刻を過ぎていて、まだ送っていないものを Web Push で送る
 *   4. 送ったことを users/{uid}/reminderLog/{scheduleId}_{subscriptionId} に記録する
 *
 * 環境変数:
 *   GOOGLE_APPLICATION_CREDENTIALS … サービスアカウントの JSON（デプロイと同じもの）
 *   FIREBASE_PROJECT_ID
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY … `npm run vapid` で作る鍵の組
 *   VAPID_SUBJECT  … 連絡先（https://… か mailto:…）。省略時はサイトURL
 *   DRY_RUN=true   … 送らずに、送る予定のものだけ表示する
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as webpush from 'web-push';
import {
  dueReminders, dateKeyInZone, isValidTimeZone,
} from '../src/domain/reminders.js';

const env = process.env;
const DRY_RUN = env.DRY_RUN === 'true';

for (const name of ['FIREBASE_PROJECT_ID', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) {
  if (!env[name]) {
    console.error(`::error::${name} が設定されていません`);
    process.exit(1);
  }
}

webpush.setVapidDetails(
  env.VAPID_SUBJECT || env.SITE_URL || `https://${env.FIREBASE_PROJECT_ID}.web.app`,
  env.VAPID_PUBLIC_KEY,
  env.VAPID_PRIVATE_KEY
);

// エミュレータ相手のテストでは認証情報が要らない
initializeApp(env.FIRESTORE_EMULATOR_HOST
  ? { projectId: env.FIREBASE_PROJECT_ID }
  : { credential: applicationDefault(), projectId: env.FIREBASE_PROJECT_ID });
const db = getFirestore();

const now = Date.now();
const DAY_MS = 86_400_000;

/** 通知先を持ち主ごとにまとめる */
async function subscriptionsByUser() {
  const snapshot = await db.collectionGroup('pushSubscriptions').get();
  const byUser = new Map();
  for (const doc of snapshot.docs) {
    const uid = doc.ref.parent.parent.id;
    const data = { id: doc.id, ref: doc.ref, ...doc.data() };
    if (!isValidTimeZone(data.timeZone)) data.timeZone = 'Asia/Tokyo';
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(data);
  }
  return byUser;
}

/**
 * その人の、今日と明日の予定。
 * 「明日 0:30 の予定を 2 時間前に」のように、日付をまたいで知らせる場合があるので明日も読む。
 */
async function upcomingSchedules(uid, timeZones) {
  const dateKeys = new Set();
  for (const tz of timeZones) {
    dateKeys.add(dateKeyInZone(now, tz));
    dateKeys.add(dateKeyInZone(now + DAY_MS, tz));
  }
  const snapshot = await db.collection('users').doc(uid).collection('schedules')
    .where('date', 'in', [...dateKeys])
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/** 送信済みの記録。logId → 送ったときの鍵 */
async function sentLog(uid, logIds) {
  if (logIds.length === 0) return new Map();
  const logs = db.collection('users').doc(uid).collection('reminderLog');
  const refs = logIds.map((id) => logs.doc(id));
  const docs = await db.getAll(...refs);
  return new Map(docs.filter((doc) => doc.exists).map((doc) => [doc.id, doc.get('key')]));
}

const logIdFor = (scheduleId, subscriptionId) => `${scheduleId}_${subscriptionId}`;

let sent = 0;
let failed = 0;
let removed = 0;

const byUser = await subscriptionsByUser();

for (const [uid, subscriptions] of byUser) {
  const schedules = await upcomingSchedules(uid, new Set(subscriptions.map((s) => s.timeZone)));
  if (schedules.length === 0) continue;

  const log = await sentLog(uid, subscriptions.flatMap((subscription) =>
    schedules.map((schedule) => logIdFor(schedule.id, subscription.id))));

  for (const subscription of subscriptions) {
    // dueReminders は「予定ID → 送った鍵」を受け取るので、この端末のぶんだけ取り出す
    const sentKeys = new Map(schedules.map((schedule) =>
      [schedule.id, log.get(logIdFor(schedule.id, subscription.id))]));

    const due = dueReminders({ schedules, subscription, sentKeys, now });

    for (const { schedule, key, message } of due) {
      const label = `${uid.slice(0, 6)}… ${schedule.date} ${schedule.time}`;
      if (DRY_RUN) {
        console.log(`[dry-run] ${label} → ${message.title}`);
        continue;
      }

      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify({ ...message, url: '/?screen=calendar', tag: `schedule-${schedule.id}` }),
          // 届けられないまま時間が経った通知は、予定が始まった後に出ても困る
          { TTL: 60 * 60, urgency: 'high' }
        );
        await db.collection('users').doc(uid).collection('reminderLog')
          .doc(logIdFor(schedule.id, subscription.id))
          .set({ key, date: schedule.date, sentAt: now });
        sent += 1;
        console.log(`送信: ${label}`);
      } catch (err) {
        // 404 / 410 は「もうこの送り先は無い」（アプリを消した、通知を切った等）。
        // 残しておくと毎回失敗し続けるので消す
        if (err.statusCode === 404 || err.statusCode === 410) {
          await subscription.ref.delete();
          removed += 1;
          console.log(`期限切れの送り先を削除: ${uid.slice(0, 6)}…`);
          break;
        }
        failed += 1;
        console.error(`送信失敗: ${label} (${err.statusCode ?? ''} ${err.body || err.message})`);
      }
    }
  }
}

console.log(`通知先 ${[...byUser.values()].flat().length} 件 / 送信 ${sent} 件 / 失敗 ${failed} 件 / 削除 ${removed} 件${DRY_RUN ? '（dry-run）' : ''}`);
if (failed > 0) process.exitCode = 1;
