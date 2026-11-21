/**
 * 予定の通知を「いつ送るか」の判定を検証する（ブラウザ・サーバ不要）。
 *
 *   node tests/reminders.mjs
 */
import assert from 'node:assert/strict';
import {
  zonedTimeToEpoch, dateKeyInZone, reminderWindow, dueReminders, reminderKey, reminderMessage,
} from '../src/domain/reminders.js';

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}

const TOKYO = 'Asia/Tokyo';
const sub = { leadMinutes: 30, timeZone: TOKYO };
const lunch = { id: 's1', date: '2026-11-20', time: '12:00', title: 'ランチ' };
const allDay = { id: 's2', date: '2026-11-20', time: '終日', title: '旅行' };
const at = (iso) => Date.parse(iso);

check('東京の 12:00 は UTC の 03:00', () => {
  assert.equal(zonedTimeToEpoch('2026-11-20', 12, 0, TOKYO), at('2026-11-20T03:00:00Z'));
});

check('夏時間のある地域でも壁時計どおりに変換する', () => {
  // ニューヨーク: 7月は UTC-4、12月は UTC-5
  assert.equal(zonedTimeToEpoch('2026-07-01', 9, 0, 'America/New_York'), at('2026-07-01T13:00:00Z'));
  assert.equal(zonedTimeToEpoch('2026-12-01', 9, 0, 'America/New_York'), at('2026-12-01T14:00:00Z'));
});

check('UTC で前日でも、東京ではもう翌日', () => {
  assert.equal(dateKeyInZone(at('2026-11-19T16:00:00Z'), TOKYO), '2026-11-20');
});

check('30分前を過ぎたら送る', () => {
  const due = dueReminders({ schedules: [lunch], subscription: sub, sentKeys: new Map(), now: at('2026-11-20T02:31:00Z') });
  assert.equal(due.length, 1);
  assert.equal(due[0].message.title, '12:00 ランチ');
  assert.equal(due[0].message.body, '30分後に始まります');
});

check('30分前より早ければまだ送らない', () => {
  const due = dueReminders({ schedules: [lunch], subscription: sub, sentKeys: new Map(), now: at('2026-11-20T02:29:00Z') });
  assert.equal(due.length, 0);
});

check('定期実行が遅れても、始まる前なら送る', () => {
  const due = dueReminders({ schedules: [lunch], subscription: sub, sentKeys: new Map(), now: at('2026-11-20T02:58:00Z') });
  assert.equal(due.length, 1);
});

check('始まった後には送らない', () => {
  const due = dueReminders({ schedules: [lunch], subscription: sub, sentKeys: new Map(), now: at('2026-11-20T03:00:00Z') });
  assert.equal(due.length, 0);
});

check('送信済みなら二度送らない', () => {
  const sentKeys = new Map([['s1', reminderKey(lunch, 30)]]);
  const due = dueReminders({ schedules: [lunch], subscription: sub, sentKeys, now: at('2026-11-20T02:40:00Z') });
  assert.equal(due.length, 0);
});

check('時刻を変えた予定にはもう一度送る', () => {
  const sentKeys = new Map([['s1', reminderKey({ ...lunch, time: '11:00' }, 30)]]);
  const due = dueReminders({ schedules: [lunch], subscription: sub, sentKeys, now: at('2026-11-20T02:40:00Z') });
  assert.equal(due.length, 1);
});

check('終日の予定は当日の朝7時に送る', () => {
  const window = reminderWindow(allDay, sub);
  assert.equal(window.fireAt, at('2026-11-19T22:00:00Z'));
  assert.equal(dueReminders({ schedules: [allDay], subscription: sub, sentKeys: new Map(), now: at('2026-11-19T21:59:00Z') }).length, 0);
  const due = dueReminders({ schedules: [allDay], subscription: sub, sentKeys: new Map(), now: at('2026-11-19T22:05:00Z') });
  assert.equal(due[0].message.title, '今日の予定: 旅行');
});

check('終日の予定は昼を過ぎたら送らない', () => {
  assert.equal(dueReminders({ schedules: [allDay], subscription: sub, sentKeys: new Map(), now: at('2026-11-20T03:01:00Z') }).length, 0);
});

check('日付をまたぐ通知（0:30 の予定を 2 時間前に）', () => {
  const late = { id: 's3', date: '2026-11-21', time: '00:30', title: '夜行バス' };
  const due = dueReminders({
    schedules: [late], subscription: { leadMinutes: 120, timeZone: TOKYO },
    sentKeys: new Map(), now: at('2026-11-20T13:35:00Z'), // 東京 11/20 22:35
  });
  assert.equal(due.length, 1);
  assert.equal(due[0].message.body, '2時間後に始まります');
});

check('時刻の形式が壊れている予定は無視する', () => {
  const broken = { id: 's4', date: '2026-11-20', time: 'ひる', title: 'x' };
  assert.equal(dueReminders({ schedules: [broken], subscription: sub, sentKeys: new Map(), now: at('2026-11-20T02:40:00Z') }).length, 0);
});

check('1時間前の文面', () => {
  assert.equal(reminderMessage(lunch, { leadMinutes: 60, allDay: false }).body, '1時間後に始まります');
});

console.log(`\n${passed} 件成功`);
