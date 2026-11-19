/**
 * アクセサリーの抽選を検証する（ブラウザ・サーバ不要）。
 *
 *   node tests/accessory.mjs
 */
import assert from 'node:assert/strict';
import { drawOutfit, buildRecentlyWorn } from '../src/domain/gacha.js';

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

const base = [
  { id: 't', category: 'tops', name: 'T', warmth: 2, formality: 1, rainSafe: true },
  { id: 'b', category: 'bottoms', name: 'B', warmth: 3, formality: 1, rainSafe: true },
  { id: 's', category: 'shoes', name: 'S', warmth: 2, formality: 1, rainSafe: true },
];
const scarf = { id: 'scarf', category: 'accessory', name: 'マフラー', warmth: 5, formality: 1, rainSafe: true };
const sunglasses = { id: 'sun', category: 'accessory', name: 'サングラス', warmth: 1, formality: 1, rainSafe: true };
const draw = (items, temp, random = Math.random) =>
  drawOutfit({ items, weather: { temp, pop: 0 }, schedules: [], random });

check('登録があればアクセサリーを1点添える', () => {
  const outfit = draw([...base, scarf], 5);
  assert.equal(outfit.accessory?.id, 'scarf');
  assert.equal(outfit.slotStates.accessory, 'picked');
});

check('アクセサリーが無くても欠品扱いにしない', () => {
  const outfit = draw(base, 20);
  assert.equal(outfit.accessory, null);
  assert.equal(outfit.slotStates.accessory, 'none');
  assert.deepEqual(outfit.missing, []);
  assert.ok(!outfit.message.includes('アクセサリー'));
});

check('お休み中のアクセサリーは選ばない', () => {
  const outfit = draw([...base, { ...scarf, available: false }], 5);
  assert.equal(outfit.accessory, null);
  assert.equal(outfit.slotStates.accessory, 'resting');
  assert.deepEqual(outfit.allResting, []);
});

check('寒い日はマフラー、暑い日はサングラスが出やすい', () => {
  let seed = 1;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let coldScarf = 0;
  let hotSun = 0;
  for (let i = 0; i < 500; i += 1) {
    if (draw([...base, scarf, sunglasses], 3, random).accessory.id === 'scarf') coldScarf += 1;
    if (draw([...base, scarf, sunglasses], 32, random).accessory.id === 'sun') hotSun += 1;
  }
  assert.ok(coldScarf > 400, `寒い日のマフラー ${coldScarf}/500`);
  assert.ok(hotSun > 400, `暑い日のサングラス ${hotSun}/500`);
});

check('最近身に着けたアクセサリーは控えめにする', () => {
  const worn = buildRecentlyWorn([{ date: '2026-11-18', accessoryId: 'scarf' }], '2026-11-19');
  assert.equal(worn.get('scarf'), 1);
});

console.log(`\n${passed} 件成功`);
