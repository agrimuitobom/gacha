/**
 * アウターの出し分けと、アイテム・予定の編集を検証する。
 *
 *   npm run build && node scripts/serve-and-run.js -- node tests/editing.mjs
 */
import { launchChromium } from './browser.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173/';

const results = [];
const ok = (name, passed, detail = '') =>
  results.push(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

const weather = (temp) => ({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({
    current_weather: { temperature: temp, weathercode: 0, time: '2026-09-13T12:00' },
    hourly: { time: ['2026-09-13T12:00'], precipitation_probability: [0] },
  }),
});

const browser = await launchChromium();

async function open(temp) {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 420, height: 880 } });
  await context.route('**/api.open-meteo.com/**', (r) => r.fulfill(weather(temp)));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE_URL);
  await page.waitForTimeout(2800);
  return { context, page, errors };
}

const draw = async (page) => {
  await page.click('#gacha-btn');
  await page.waitForSelector('#result-screen:not(.hidden)');
  await page.waitForTimeout(250);
};

/* ---------- アウター ---------- */
{
  const { context, page } = await open(5);

  await page.click('[data-action="open-closet"]');
  await page.waitForTimeout(1200);
  ok('クローゼットにアウタータブがある',
    (await page.locator('#tab-outer').count()) === 1);
  await page.click('#tab-outer');
  await page.waitForTimeout(400);
  const outerCount = await page.locator('#content-outer [data-item-card]').count();
  ok('初期データにアウターがある', outerCount === 2, `${outerCount}着`);
  await page.click('#closet-screen [data-action="back"]');
  await page.waitForTimeout(300);

  await draw(page);
  const cold = await page.textContent('#result-items');
  ok('寒い日はアウターが提案に含まれる', cold.includes('アウター'), cold.replace(/\s+/g, ' ').slice(0, 60));
  ok('提案理由でアウターに触れる',
    (await page.textContent('#result-message')).includes('アウター'));
  await context.close();
}

{
  const { context, page } = await open(30);
  await draw(page);
  // 猛暑では毎回外れるはず。念のため複数回引いて確認する
  let withOuter = 0;
  for (let i = 0; i < 10; i += 1) {
    await page.click('[data-action="regacha"]');
    await page.waitForTimeout(450);
    const text = await page.textContent('#result-items');
    if (!text.includes('未登録') && text.includes('アウター')) withOuter += 1;
  }
  ok('猛暑の日はアウターを出さない', withOuter === 0, `10回中 ${withOuter}回`);
  await context.close();
}

/* ---------- アイテムの編集 ---------- */
{
  const { context, page, errors } = await open(20);

  await page.click('[data-action="open-closet"]');
  await page.waitForTimeout(1200);
  const before = await page.textContent('#content-tops');

  await page.click('#content-tops [data-action="edit-item"]');
  await page.waitForTimeout(900);
  ok('編集画面が開く',
    !(await page.locator('#item-form-screen').getAttribute('class')).includes('hidden'));
  ok('見出しが「編集」になる',
    (await page.textContent('#item-form-title')) === 'アイテムを編集');

  const prefilled = await page.inputValue('#capture-name');
  ok('既存の値が入っている', prefilled.length > 0, prefilled);

  await page.fill('#capture-name', '名前を変えたトップス');
  await page.selectOption('#capture-warmth', '5');
  await page.click('[data-action="save-item-form"]');
  await page.waitForTimeout(1800);

  const after = await page.textContent('#content-tops');
  ok('編集内容がクローゼットに反映される',
    after.includes('名前を変えたトップス') && !before.includes('名前を変えたトップス'));
  ok('厚みの変更も反映される', after.includes('厚み 5/5'));

  await page.reload();
  await page.waitForTimeout(2800);
  await page.click('[data-action="open-closet"]');
  await page.waitForTimeout(1200);
  ok('リロード後も編集が残る',
    (await page.textContent('#content-tops')).includes('名前を変えたトップス'));

  // 編集では写真や作成日時を壊していないこと（件数が増えていない）
  const count = await page.locator('#content-tops [data-item-card]').count();
  ok('編集でアイテムが増えていない', count === 3, `${count}着`);

  ok('JSエラーが発生していない', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

/* ---------- 予定の編集 ---------- */
{
  const { context, page } = await open(20);

  await page.click('[data-action="open-calendar"]');
  await page.waitForTimeout(1200);
  await page.fill('.schedule-title-input', '打ち合わせ');
  await page.click('[data-action="add-schedules"]');
  await page.waitForTimeout(1500);

  await page.click('[data-action="edit-schedule"]');
  await page.waitForTimeout(600);
  ok('予定がその場で編集できる状態になる',
    (await page.locator('.schedule-edit-title').count()) === 1);
  ok('既存の内容が入っている',
    (await page.inputValue('.schedule-edit-title')) === '打ち合わせ');

  await page.fill('.schedule-edit-title', '病院');
  await page.fill('.schedule-edit-time', '15:30');
  await page.click('[data-action="save-edit-schedule"]');
  await page.waitForTimeout(1500);

  const list = await page.textContent('#schedule-list');
  ok('予定の編集が反映される', list.includes('病院') && list.includes('15:30'), list.replace(/\s+/g, ' ').slice(0, 50));
  ok('編集前の内容が残っていない', !list.includes('打ち合わせ'));

  // ホームの表示にも反映されること
  await page.click('#calendar-screen [data-action="back"]');
  await page.waitForTimeout(800);
  ok('ホームの予定表示にも反映される',
    (await page.textContent('#home-schedule-text')).includes('病院'));

  // やめるで元に戻ること
  await page.click('[data-action="open-calendar"]');
  await page.waitForTimeout(1000);
  await page.click('[data-action="edit-schedule"]');
  await page.waitForTimeout(500);
  await page.fill('.schedule-edit-title', '書きかけ');
  await page.click('[data-action="cancel-edit-schedule"]');
  await page.waitForTimeout(800);
  ok('「やめる」で編集が破棄される',
    (await page.textContent('#schedule-list')).includes('病院'));

  await context.close();
}

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
