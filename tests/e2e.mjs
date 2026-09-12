/**
 * E2E テスト。
 *   node tests/e2e.mjs            # dist を検証（既定 http://127.0.0.1:4173）
 *   BASE_URL=... node tests/e2e.mjs
 *
 * Firebase エミュレータ向けにビルドした dist を対象にすると、
 * Firestore / Cloud Storage を含む実際の保存経路を通しで検証できる。
 */
import { launchChromium } from './browser.mjs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173/';

const results = [];
const ok = (name, passed, detail = '') =>
  results.push(`${passed ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);

const weatherResponse = (temp, code, pop) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    current_weather: { temperature: temp, weathercode: code, time: '2026-09-12T12:00' },
    hourly: { time: ['2026-09-12T12:00'], precipitation_probability: [pop] },
  }),
});

const browser = await launchChromium();

async function newPage(weatherRoute) {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 420, height: 880 },
  });
  await context.route('**/api.open-meteo.com/**', weatherRoute);
  // 外部の商品画像はテストに無関係なので遮断してノイズを減らす
  await context.route('**/images.unsplash.com/**', (route) => route.abort());
  await context.route('**/placehold.co/**', (route) => route.abort());

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) {
      errors.push('console: ' + msg.text());
    }
  });
  return { context, page, errors };
}

const gacha = async (page) => {
  await page.click('#gacha-btn');
  await page.waitForSelector('#result-screen:not(.hidden)');
  await page.waitForTimeout(150);
};

/* ============ 1. 保存経路（Firebase or ローカル） ============ */
{
  const { context, page, errors } = await newPage((r) => r.fulfill(weatherResponse(8.4, 61, 90)));
  await page.goto(BASE_URL);
  await page.waitForFunction(() => document.querySelectorAll('#content-tops li').length > 0 ||
                                   document.querySelector('#home-schedule-text')?.textContent !== '読み込み中...',
                             null, { timeout: 20000 });
  await page.waitForTimeout(1500);

  const temp = await page.textContent('#weather-temp');
  const desc = await page.textContent('#weather-desc');
  ok('天気を実データで表示（0%が握り潰されない実装）', temp === '8°' && desc.includes('90%'), `${temp} / ${desc}`);

  const todayJa = (() => { const d = new Date(); return `${d.getMonth() + 1}/${d.getDate()}`; })();
  ok('日付が「今日」', (await page.textContent('#home-calendar-date-text')).startsWith(todayJa));

  await page.click('[data-action="open-closet"]');
  await page.waitForTimeout(1200);
  const seeded = await page.locator('#content-tops li[data-item-card]').count();
  ok('初期データが保存され読み戻せる', seeded === 3, `tops ${seeded}件`);
  await page.click('#closet-screen [data-action="back"]');
  await page.waitForTimeout(200);

  /* ホームからの往復が成立するか（画面遷移の確認） */
  await gacha(page);
  await page.click('#result-screen [data-action="back"]');
  await page.waitForTimeout(200);
  await gacha(page);

  const message = await page.textContent('#result-message');
  ok('提案理由に気温と雨が反映', message.includes('8°') && message.includes('雨に強い'), message.trim());

  /*
   * ガチャの分布を確認する。
   * 最頻の組み合わせでも出現率は5割程度なので、少ない試行で
   * 「全部同じ」を判定すると偶然で落ちる。まとめて多めに引く。
   */
  const DRAWS = 24;
  const outcomes = new Set();
  const shoes = {};
  for (let i = 0; i < DRAWS; i += 1) {
    await page.click('[data-action="regacha"]');
    await page.waitForTimeout(450);
    const rendered = await page.textContent('#result-items');
    outcomes.add(rendered);
    const match = rendered.match(/(白レザースニーカー|黒レザーブーツ|キャンバススニーカー)/);
    if (match) shoes[match[1]] = (shoes[match[1]] || 0) + 1;
  }
  ok('ガチャが毎回同じ結果ではない', outcomes.size > 1, `${DRAWS}回で ${outcomes.size} 通り`);
  ok('雨天時に雨に弱い靴が選ばれにくい',
    (shoes['キャンバススニーカー'] || 0) < (shoes['黒レザーブーツ'] || 0), JSON.stringify(shoes));

  /* 画面スタック */
  const before = await page.textContent('#result-items');
  await page.click('#result-screen [data-action="open-shop"]');
  await page.waitForSelector('#shop-screen:not(.hidden)');
  await page.click('#shop-screen [data-action="back"]');
  await page.waitForTimeout(250);
  const stillOnResult = !(await page.locator('#result-screen').getAttribute('class')).includes('hidden');
  ok('結果→ショップ→戻るで結果が保持される',
    stillOnResult && (await page.textContent('#result-items')) === before);

  /* コーデ決定 */
  await page.click('[data-action="decide-outfit"]');
  await page.waitForTimeout(1200);
  ok('コーデ決定バッジが表示される',
    !(await page.locator('#home-decided-badge').getAttribute('class')).includes('hidden'));

  /* XSS */
  await page.click('[data-action="open-calendar"]');
  await page.waitForTimeout(700);
  const payload = '<img src=x onerror="window.__pwned=1">ランチ';
  await page.fill('.schedule-title-input', payload);
  await page.click('[data-action="add-schedules"]');
  await page.waitForTimeout(1200);
  const pwned = await page.evaluate(() => window.__pwned === 1);
  const injectedImgs = await page.evaluate(() => document.querySelectorAll('#schedule-list img').length);
  const shown = await page.textContent('#schedule-list');
  ok('予定タイトルのXSSが実行されない', !pwned && injectedImgs === 0 && shown.includes(payload));

  /* 永続化（リロード後） */
  await page.reload();
  await page.waitForTimeout(2500);
  await page.click('[data-action="open-calendar"]');
  await page.waitForTimeout(1200);
  ok('リロード後も予定が残る', (await page.textContent('#schedule-list')).includes('ランチ'));

  ok('JSエラーが発生していない', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

/* ============ 2. 天気APIが失敗したとき ============ */
{
  const { context, page } = await newPage((r) => r.fulfill({ status: 503, body: 'boom' }));
  await page.goto(BASE_URL);
  await page.waitForTimeout(2500);

  const temp = await page.textContent('#weather-temp');
  const desc = await page.textContent('#weather-desc');
  ok('API失敗時に架空の気温を表示しない', temp === '--°' && !desc.includes('晴れ'), `${temp} / ${desc}`);

  await gacha(page);
  ok('天気不明を明示しつつガチャは継続',
    (await page.textContent('#result-message')).includes('天気を取得できなかった'));
  await context.close();
}

/* ============ 3. 猛暑・フォーマルな予定への追従 ============ */
{
  const { context, page } = await newPage((r) => r.fulfill(weatherResponse(30.2, 0, 0)));
  await page.goto(BASE_URL);
  await page.waitForTimeout(2500);
  ok('降水確率0%が0%のまま表示される',
    (await page.textContent('#weather-desc')).includes('降水 0%'));

  const tops = {};
  await gacha(page);
  for (let i = 0; i < 24; i += 1) {
    await page.click('[data-action="regacha"]');
    await page.waitForTimeout(450);
    const match = (await page.textContent('#result-items')).match(/(白のオーバーサイズT|ストライプシャツ|黒ニット)/);
    if (match) tops[match[1]] = (tops[match[1]] || 0) + 1;
  }
  ok('猛暑時に厚手より薄手が選ばれる',
    (tops['白のオーバーサイズT'] || 0) > (tops['黒ニット'] || 0), JSON.stringify(tops));
  await context.close();
}

/* ============ 4. アクセシビリティ ============ */
{
  const { context, page } = await newPage((r) => r.fulfill(weatherResponse(20, 0, 0)));
  await page.goto(BASE_URL);
  await page.waitForTimeout(2500);

  // 非表示画面が支援技術から隠れているか
  const hiddenInert = await page.evaluate(() =>
    ['result-screen', 'closet-screen', 'shop-screen', 'calendar-screen', 'camera-screen']
      .every((id) => document.getElementById(id).hasAttribute('inert')));
  ok('非表示画面が inert になっている', hiddenInert);

  // 画面遷移でフォーカスが見出しへ移るか
  await page.click('[data-action="open-closet"]');
  await page.waitForTimeout(600);
  ok('画面を開くと見出しにフォーカスが移る',
    (await page.evaluate(() => document.activeElement?.id)) === 'closet-title');

  // タブのキーボード操作（WAI-ARIA tabs パターン）
  await page.keyboard.press('Tab'); // 見出し -> 次の操作対象
  await page.focus('#tab-tops');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const tabState = await page.evaluate(() => ({
    active: document.activeElement?.id,
    selected: document.getElementById('tab-bottoms').getAttribute('aria-selected'),
    panelShown: !document.getElementById('content-bottoms').classList.contains('hidden'),
  }));
  ok('→キーでタブを切り替えられる',
    tabState.active === 'tab-bottoms' && tabState.selected === 'true' && tabState.panelShown,
    JSON.stringify(tabState));

  // 戻ると、開いたボタンへフォーカスが返るか
  await page.click('#closet-screen [data-action="back"]');
  await page.waitForTimeout(400);
  ok('戻ると元のボタンへフォーカスが返る',
    (await page.evaluate(() => document.activeElement?.dataset?.action)) === 'open-closet');

  // Escape で戻れるか
  await page.click('[data-action="open-shop"]');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  ok('Escape で前の画面に戻れる',
    (await page.locator('#shop-screen').getAttribute('class')).includes('hidden'));

  // タップ対象の大きさ（44px 以上）
  await page.click('[data-action="open-calendar"]');
  await page.waitForTimeout(900);
  const smallTargets = await page.evaluate(() => {
    const seen = [];
    for (const el of document.querySelectorAll('#calendar-screen button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.width < 44 || r.height < 44) seen.push(`${el.dataset.action || el.id}:${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return seen;
  });
  ok('カレンダー画面のタップ対象が44px以上', smallTargets.length === 0, smallTargets.join(', '));

  // 入力欄が16px以上（iOSのフォーカス時ズーム対策）
  const inputFontSizes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#calendar-screen input'))
      .map((el) => parseFloat(getComputedStyle(el).fontSize)));
  ok('入力欄のフォントが16px以上', inputFontSizes.every((size) => size >= 16), inputFontSizes.join(','));

  await context.close();
}

/* ============ 5. PWA ============ */
{
  const { context, page } = await newPage((r) => r.fulfill(weatherResponse(20, 0, 0)));
  await page.goto(BASE_URL);
  await page.waitForTimeout(1500);

  const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
  ok('manifest が読み込まれている', Boolean(manifestHref), manifestHref || '');

  const manifest = await page.evaluate(async (href) => (await fetch(href)).json(), manifestHref);
  ok('manifest に必須項目が揃っている',
    manifest.name && manifest.start_url && manifest.display === 'standalone' && manifest.icons.length >= 3,
    `${manifest.name} / icons:${manifest.icons.length}`);

  const maskable = manifest.icons.some((i) => i.purpose === 'maskable');
  ok('maskable アイコンがある', maskable);

  const iconStatuses = await page.evaluate(async (icons) =>
    Promise.all(icons.map(async (i) => (await fetch('/' + i.src.replace(/^\//, ''))).status)), manifest.icons);
  ok('アイコンが実際に配信されている', iconStatuses.every((s) => s === 200), iconStatuses.join(','));

  const swRegistered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(reg);
  });
  ok('Service Worker が登録される', swRegistered);

  ok('manifest に id と display_override がある',
    manifest.id === '/' && Array.isArray(manifest.display_override),
    `id:${manifest.id}`);

  // Android のリッチなインストールダイアログに使われる
  const shots = manifest.screenshots || [];
  ok('screenshots が3枚あり narrow 指定されている',
    shots.length === 3 && shots.every((s) => s.form_factor === 'narrow'),
    `${shots.length}枚`);
  const shotStatuses = await page.evaluate(async (list) =>
    Promise.all(list.map(async (s) => (await fetch('/' + s.src.replace(/^\//, ''))).status)), shots);
  ok('screenshots が実際に配信されている', shotStatuses.every((s) => s === 200), shotStatuses.join(','));

  const shortcuts = manifest.shortcuts || [];
  ok('shortcuts が3件ある', shortcuts.length === 3,
    shortcuts.map((s) => s.short_name).join(' / '));

  await context.close();
}

/* ============ 6. PWA のショートカットとインストール導線 ============ */
{
  const { context, page } = await newPage((r) => r.fulfill(weatherResponse(20, 0, 0)));

  // /?screen=closet でクローゼットが開くか
  await page.goto(`${BASE_URL}?screen=closet`);
  await page.waitForTimeout(2500);
  const closetOpen = !(await page.locator('#closet-screen').getAttribute('class')).includes('hidden');
  ok('ショートカット ?screen=closet でクローゼットが開く', closetOpen);
  ok('ショートカットのクエリが URL から取り除かれる',
    !(await page.evaluate(() => location.search)), await page.evaluate(() => location.search));

  // /?action=gacha でそのまま結果画面まで進むか
  await page.goto(`${BASE_URL}?action=gacha`);
  await page.waitForTimeout(5000);
  const resultOpen = !(await page.locator('#result-screen').getAttribute('class')).includes('hidden');
  ok('ショートカット ?action=gacha で結果画面まで進む', resultOpen);

  // インストール案内の置き場があり、既定では空であること
  await page.goto(BASE_URL);
  await page.waitForTimeout(2000);
  const slot = await page.locator('#install-slot').count();
  ok('インストール案内の置き場がある', slot === 1);

  // beforeinstallprompt を模擬して案内が出るか（Chromium は自動発火しない）
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    event.prompt = () => { window.__installPrompted = true; };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  await page.waitForTimeout(300);
  ok('インストール案内バナーが表示される',
    (await page.locator('#install-banner').count()) === 1);

  await page.click('[data-action="install-app"]');
  await page.waitForTimeout(300);
  ok('「追加」でブラウザのインストール処理が呼ばれる',
    await page.evaluate(() => window.__installPrompted === true));

  // 閉じたら再表示されないこと
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    event.prompt = () => {};
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  await page.waitForTimeout(200);
  if (await page.locator('[data-action="dismiss-install"]').count()) {
    await page.click('[data-action="dismiss-install"]');
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    event.prompt = () => {};
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  await page.waitForTimeout(300);
  ok('一度閉じたら再表示されない',
    (await page.locator('#install-banner').count()) === 0);

  await context.close();
}

/* ============ 7. Firebase 経路の実地確認（エミュレータ使用時のみ） ============ */
if (process.env.CHECK_FIREBASE === 'true') {
  const { context, page } = await newPage((r) => r.fulfill(weatherResponse(20, 0, 0)));
  await page.goto(BASE_URL);
  await page.waitForTimeout(4000);

  // アプリがサインインした匿名ユーザーの uid を取り出す
  // Firebase v9+ の認証状態は IndexedDB (firebaseLocalStorageDb) に保存される
  const uid = await page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('firebaseLocalStorageDb');
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve(null);
      const getAll = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
      getAll.onerror = () => resolve(null);
      getAll.onsuccess = () => {
        const record = getAll.result.find((entry) => String(entry.fbase_key).startsWith('firebase:authUser:'));
        resolve(record?.value?.uid || null);
      };
    };
  }));
  ok('Firebase の匿名認証でサインインしている', Boolean(uid), uid || '(uid取得できず)');

  if (uid) {
    const base = 'http://127.0.0.1:8080/v1/projects/demo-gacha/databases/(default)/documents';
    const read = async (col) => {
      const res = await fetch(`${base}/users/${uid}/${col}`, {
        headers: { Authorization: 'Bearer owner' },
      });
      return (await res.json()).documents || [];
    };

    const items = await read('closetItems');
    ok('初期データが Firestore に書き込まれている', items.length === 8, `${items.length}件`);

    // 予定を追加して Firestore に届くか
    await page.click('[data-action="open-calendar"]');
    await page.waitForTimeout(900);
    await page.fill('.schedule-title-input', 'Firestore 疎通確認');
    await page.click('[data-action="add-schedules"]');
    await page.waitForTimeout(1800);

    const schedules = await read('schedules');
    ok('予定が Firestore に保存される',
      schedules.some((d) => d.fields.title.stringValue === 'Firestore 疎通確認'),
      `${schedules.length}件`);

    // 他ユーザーの領域は読めない（ルールが効いている）
    const forbidden = await fetch(`${base}/users/someone-else/closetItems`);
    ok('ルールにより他ユーザーの領域は読めない', forbidden.status === 403, `HTTP ${forbidden.status}`);
  }
  await context.close();
}

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('❌')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
