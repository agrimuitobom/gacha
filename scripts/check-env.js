/**
 * デプロイ用ビルドの前に、Firebase の設定が揃っていて、かつ
 * 値の形式が妥当かを確認する。
 *
 * 設定が欠けたままビルドすると、アプリは「エラーも出さずに
 * ブラウザ内保存だけで動く」状態で公開されてしまう。
 * さらに厄介なのは、値が入っていても形式が壊れている場合で、
 * ビルドは通るのに実行時に Firebase へ接続できないアプリができる。
 * どちらもここで止める。
 */

const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_APP_ID',
];

const RECOMMENDED = ['VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_SITE_URL'];

/**
 * 値ごとの形式チェック。
 * Firebase コンソールの設定スニペット（projectId: "xxx",）から
 * コピーするとクォートやカンマが混ざりやすいので、そこを重点的に見る。
 */
const FORMAT_RULES = {
  VITE_FIREBASE_AUTH_DOMAIN: {
    test: (value) => /^[a-z0-9-]+\.(firebaseapp\.com|web\.app)$/i.test(value),
    hint: '例: your-project.firebaseapp.com',
  },
  VITE_FIREBASE_PROJECT_ID: {
    test: (value) => /^[a-z0-9-]{4,30}$/.test(value),
    hint: '英小文字・数字・ハイフンのみ。例: your-project',
  },
  VITE_FIREBASE_STORAGE_BUCKET: {
    test: (value) => /^[a-z0-9.-]+\.(appspot\.com|firebasestorage\.app)$/i.test(value),
    hint: '例: your-project.firebasestorage.app',
  },
  VITE_FIREBASE_APP_ID: {
    test: (value) => /^\d+:\d+:web:[a-z0-9]+$/i.test(value),
    hint: '例: 1:123456789012:web:abcdef0123456789',
  },
  VITE_FIREBASE_MESSAGING_SENDER_ID: {
    test: (value) => /^\d+$/.test(value),
    hint: '数字のみ。例: 123456789012',
  },
  VITE_SITE_URL: {
    test: (value) => /^https?:\/\/[^\s"']+$/.test(value),
    hint: '例: https://your-project.web.app',
  },
};

const problems = [];
const warnings = [];

/** コピペで混入しやすい余計な文字を検出する */
function findDecoration(value) {
  if (/^["'].*["']$/s.test(value)) return 'クォート（" または \'）で囲まれています';
  if (value !== value.trim()) return '前後に空白が含まれています';
  if (value.endsWith(',')) return '末尾にカンマが付いています';
  if (/^[a-zA-Z]+\s*:\s*/.test(value) && value.includes(':') && !value.startsWith('http')) {
    return 'キー名（例: projectId:）ごとコピーされている可能性があります';
  }
  return null;
}

for (const key of [...REQUIRED, ...RECOMMENDED]) {
  const raw = process.env[key];
  const isRequired = REQUIRED.includes(key);

  if (!raw) {
    if (isRequired) problems.push({ key, reason: '未設定です' });
    else warnings.push(`${key} が未設定です（任意）`);
    continue;
  }

  const decoration = findDecoration(raw);
  if (decoration) {
    problems.push({ key, reason: decoration, value: raw, fix: raw.trim().replace(/^["']|["']$/g, '').replace(/,$/, '') });
    continue;
  }

  const rule = FORMAT_RULES[key];
  if (rule && !rule.test(raw)) {
    problems.push({ key, reason: `形式が正しくありません（${rule.hint}）`, value: raw });
  }
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);

if (problems.length > 0) {
  console.error('\n✗ Firebase の設定に問題があるため、デプロイ用ビルドを中止します。\n');
  for (const { key, reason, value, fix } of problems) {
    console.error(`  ${key}`);
    console.error(`    ${reason}`);
    if (value !== undefined) console.error(`    現在: ${value}`);
    if (fix !== undefined) console.error(`    正しくは: ${fix}`);
    console.error('');
  }
  console.error('GitHub の Settings > Secrets and variables > Actions > Variables で');
  console.error('該当の値を修正してください。');
  console.error('（Firebase コンソールの設定スニペットからコピーする際、');
  console.error('  クォートやカンマを含めないよう注意してください）');
  process.exit(1);
}

console.log('✓ Firebase の設定が揃っています');
