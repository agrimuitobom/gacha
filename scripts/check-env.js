/**
 * デプロイ用ビルドの前に、Firebase の設定が揃っているかを確認する。
 *
 * 設定が欠けたままビルドすると、アプリは「エラーも出さずに
 * ブラウザ内保存だけで動く」状態で公開されてしまう。
 * 利用者から見ると、データが同期されないことに気づけないので、
 * ここで明示的に失敗させる。
 */
const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_APP_ID',
];

const RECOMMENDED = ['VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_SITE_URL'];

const missing = REQUIRED.filter((key) => !process.env[key]);
const missingOptional = RECOMMENDED.filter((key) => !process.env[key]);

if (missingOptional.length > 0) {
  console.warn(`⚠ 未設定（任意）: ${missingOptional.join(', ')}`);
}

if (missing.length > 0) {
  console.error('✗ Firebase の設定が不足しているため、デプロイ用ビルドを中止します。');
  for (const key of missing) console.error(`   - ${key}`);
  console.error('\nGitHub の Settings > Secrets and variables > Actions で');
  console.error('リポジトリ変数 (Variables) として設定してください。');
  console.error('（これらは公開されるバンドルに埋め込まれる識別子で、秘密鍵ではありません）');
  process.exit(1);
}

console.log('✓ Firebase の設定が揃っています');
