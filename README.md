# コーデガチャ

天気と予定に合わせて、手持ちの服から今日のコーデを提案するアプリです。

## できること

- **コーデガチャ** — 気温・降水確率・その日の予定から手持ちの服をスコアリングし、加重ランダムで1組引きます
- **マイクローゼット** — 服を撮影して登録（厚み・きれいめ度・雨への強さを属性として保持）
- **カレンダー＆予定** — 予定を登録すると、その日のコーデ提案に反映されます
- **周辺の服屋** — 近隣ショップの情報
- **PWA** — ホーム画面に追加してオフラインでも起動できます

## セットアップ

```bash
npm install
npm run dev
```

`http://localhost:5173` が開きます。**Firebase の設定が無くても動作します**（データはブラウザ内の IndexedDB に保存されます）。

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバ |
| `npm run build` | 本番ビルド（`dist/`） |
| `npm run preview` | ビルド結果をローカルで確認 |
| `npm run icons` | PWA アイコンを再生成（`public/icons/`） |
| `npm run emulators` | Firebase エミュレータ（auth / firestore / storage）を起動 |
| `npm run build:emulator` | エミュレータ接続用にビルド |
| `npm test` | ビルド + クラス生成チェック + CSP 検証（サーバ不要で完結） |
| `npm run test:css` | Tailwind のクラスが生成されているかの検証 |
| `npm run test:csp` | CSP とセキュリティヘッダの検証 |
| `npm run test:e2e` | E2E テスト（`npm run preview` が前提） |
| `npm run test:contrast` | コントラスト比の検証（`npm run preview` が前提） |
| `npm run test:rules` | セキュリティルールの検証（`npm run emulators` が前提） |

## Firebase

### 保存先の切り替え

`.env` に Firebase の設定値が揃っていれば Firebase を、無ければブラウザ内保存を使います。判定は `src/config/env.js` の一箇所だけです。

```
.env が無い     → IndexedDB（開発・お試し用）
.env がある     → Firebase（Auth + Firestore + Cloud Storage）
接続に失敗した場合 → IndexedDB へ自動退避し、画面に通知
```

### セットアップ手順

1. Firebase コンソールでプロジェクトを作成し、ウェブアプリを追加
2. **Authentication** で「匿名」を有効化（Google 連携も使う場合は「Google」も有効化）
3. **Firestore Database** と **Cloud Storage** を作成
4. `.env.example` を `.env` にコピーし、コンソールの設定値を記入
5. ルールをデプロイ

```bash
npx firebase deploy --only firestore:rules,storage
```

6. アプリをデプロイ

```bash
npm run build
npx firebase deploy --only hosting
```

### 認証について

初回起動時に**匿名認証**でサインインします。アカウント作成を求めずにすぐ使い始められるようにするためです。端末をまたいで同期したくなった時点で `linkGoogleAccount()`（`src/data/firebase-app.js`）を呼ぶと、匿名アカウントのデータを引き継いだまま Google アカウントへ昇格できます。

> UI からこれを呼ぶボタンはまだありません。設定画面を作る際に接続してください。

### データ構造

すべて `users/{uid}` 配下のサブコレクションに置いています。トップレベルに置いて `userId` で絞る方式に比べ、ルールが単純になり、複合インデックスも不要で、他人のドキュメントへ到達する経路がそもそも存在しません。

```
users/{uid}/closetItems/{itemId}
  category: 'tops' | 'bottoms' | 'shoes'
  name: string (1-40)
  imageUrl: string | null      … Cloud Storage の downloadURL
  imagePath: string | null     … users/{uid}/closet/{itemId}.jpg
  colorClass: string           … 画像が無いときの代替色
  warmth: 1-5                  … 生地の厚み
  formality: 1-3               … きれいめ度
  rainSafe: boolean
  createdAt: number

users/{uid}/schedules/{scheduleId}
  date: 'YYYY-MM-DD'
  time: 'HH:MM' | '終日'
  title: string (1-60)
  createdAt: number

users/{uid}/outfits/{outfitId}
  date: 'YYYY-MM-DD'
  topsId / bottomsId / shoesId: string | null
  decidedAt: number
  createdAt: number
```

画像は Cloud Storage の `users/{uid}/closet/{itemId}.jpg` に置きます。撮影時に長辺 800px・JPEG 品質 0.8 へ縮小してから保存します。

### セキュリティルール

`firestore.rules` / `storage.rules` では、所有者チェックに加えてフィールドの型・範囲・`hasOnly()` による未知フィールドの排除まで行っています。`npm run test:rules` でエミュレータ相手に検証できます（26項目）。

> **注意**: Cloud Storage の `getDownloadURL()` が返す URL にはアクセストークンが含まれており、**URL を知っていれば未認証でも画像を取得できます**。公開されて困る画像を扱う場合は、ダウンロード URL を配らず `getBlob()` 経由に切り替えてください。

### オフライン対応

Firestore のローカルキャッシュ（`persistentLocalCache`）を有効にしているため、オフラインでも読み書きでき、復帰時に同期されます。複数タブで開いても壊れないよう `persistentMultipleTabManager` を使っています。

## セキュリティ

### Content Security Policy

`firebase.json` の `hosting.headers` で配信します。ビルド後の HTML にインラインの `<script>` / `<style>` / `onclick` が1つも無いため、**`'unsafe-inline'` なしで運用しています**。

```
script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none' …
```

あわせて次のヘッダも付けています。

| ヘッダ | 値 | 理由 |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | MIME スニッフィングの抑止 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 外部リンク経由でのパス漏れ防止 |
| `Permissions-Policy` | `camera=(self), geolocation=(self), microphone=(), payment=()` | 使わない機能を明示的に禁止 |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | `same-origin` にすると Google サインインのポップアップが壊れるため |

`npm run test:csp` で、`firebase.json` のヘッダをそのまま適用した状態でアプリを操作し、CSP 違反が発生しないこと、かつ**インラインスクリプトの注入が実際に阻止されること**まで確認できます。

> CSP はホスティング側のヘッダで効きます。`npm run dev` / `npm run preview` には付きません。Firebase Hosting 以外へ配置する場合は、同じヘッダをそのサーバに設定してください。

> 独自の認証ドメインを使う場合は `frame-src` に、Cloud Functions を使う場合は `connect-src` に、それぞれ追記が必要です。

## 構成

```
index.html              画面のマークアップ
src/
  main.js               起動と配線（イベント委譲）
  state.js              アプリ状態
  styles.css            Tailwind v4 + 独自アニメーション
  config/env.js         環境設定・バックエンド判定
  data/
    backend.js            バックエンド選択（Firebase / ローカル）
    backend-local.js      IndexedDB 実装
    backend-firebase.js   Firestore + Cloud Storage 実装
    firebase-app.js       SDK 初期化・認証
    repositories.js       アプリが触る唯一のデータ層
    shops.js              周辺の服屋（静的データ + 営業時間判定）
  domain/
    gacha.js              抽選ロジック（DOM非依存）
    weather.js            天気取得（DOM非依存）
    dates.js              日付ユーティリティ
  ui/                   画面ごとの描画とフォーカス管理
tests/
  rules.test.mjs        セキュリティルール検証
  e2e.mjs               E2E（機能・アクセシビリティ・PWA）
  csp.mjs               CSP とセキュリティヘッダの検証
  contrast.mjs          コントラスト比（WCAG AA）の検証
  css-coverage.mjs      Tailwind のクラスが生成されているかの検証
```

`domain/` は DOM に依存しないため、単体でテストできます。

## アクセシビリティ

- 非表示の画面は `inert` + `aria-hidden` にして、フォーカスと読み上げの対象から外しています
- 画面を開くと見出しへフォーカスを移し、戻ると開いたボタンへ返します
- タブは WAI-ARIA の tabs パターン（`←` `→` `Home` `End` で移動）
- `Escape` で前の画面に戻れます
- タップ対象は 44px 以上、入力欄は 16px 以上（iOS のフォーカス時ズーム防止）
- `prefers-reduced-motion` を尊重します
- 全画面で WCAG 2.1 AA のコントラスト比（通常 4.5:1 / 大きい文字 3:1）を満たします

コントラストは `npm run test:contrast` で自動検証しています。グラデーション背景は最も不利な色停止点で判定し、親要素の `opacity` も計算に含めます。

## 天気について

[Open-Meteo](https://open-meteo.com/) を使っています。API キーは不要です。

取得に失敗したときは、**架空の気温を表示しません**。気温はコーデ提案の主要な入力なので、嘘の値を出すと誤った提案に直結するためです。取得できなかった旨を表示し、ガチャは気温を考慮せずに継続します。

位置情報は、天気ウィジェットをタップしたときだけ要求します。起動直後に理由なく許可を求めないようにするためです。既定は愛媛県西条市です（`src/domain/weather.js`）。

## 公開URLの設定

OGP の `og:image` / `og:url` は絶対URLでなければクローラが解決できません。ドメインが決まったら `.env` に設定してください。

```
VITE_SITE_URL=https://your-app.web.app
```

未設定でも動作します（相対パスのまま出力されます）。

## ライセンス

私的利用を想定しています。
