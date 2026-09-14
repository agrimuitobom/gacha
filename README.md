# コーデガチャ

天気と予定に合わせて、手持ちの服から今日のコーデを提案するアプリです。

## できること

- **コーデガチャ** — 気温・降水確率・その日の予定から手持ちの服をスコアリングし、加重ランダムで1組引きます
- **マイクローゼット** — 服を撮影して登録（アウター / トップス / ボトムス / シューズ）。あとから編集でき、洗濯中などは一時的に外せます
- **カレンダー＆予定** — 予定を登録すると、その日のコーデ提案に反映されます。決めたコーデもここから見返せます
- **周辺の服屋** — 近隣ショップの営業時間・距離・商品（商品は実物の写真のみ。未登録のうちは「準備中」と表示）
- **PWA** — ホーム画面に追加してアプリとして起動でき、オフラインでも動きます

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
| `npm run icons` | アイコンと OGP 画像を再生成（`public/`） |
| `npm run screenshots` | manifest 用スクリーンショットを再生成 |
| `npm run emulators` | Firebase エミュレータ（auth / firestore / storage）を起動 |
| `npm run build:emulator` | エミュレータ接続用にビルド |
| `npm test` | ビルド + クラス生成チェック + CSP 検証（サーバ不要で完結） |
| `npm run test:css` | Tailwind のクラスが生成されているかの検証 |
| `npm run test:csp` | CSP とセキュリティヘッダの検証 |
| `npm run test:e2e` | E2E テスト（プレビューサーバは自動で起動・停止） |
| `npm run test:contrast` | コントラスト比の検証（同上） |
| `npm run test:image` | 撮影画像が縮小・圧縮されているかの検証 |
| `npm run test:lifecycle` | 日付の切り替わり・復帰処理の検証 |
| `npm run test:read-cost` | Firestore の読み取り件数の検証（エミュレータ前提） |
| `npm run test:settings` | 設定画面とアカウント表示の検証 |
| `npm run test:editing` | アウターの出し分けと編集機能の検証 |
| `npm run test:history` | コーデ履歴と距離表示の検証 |
| `npm run test:shop` | 店舗の商品写真の検証（サーバ不要） |
| `npm run shop:photos` | 店舗の商品写真を 320px の WebP に変換して `public/shops/` に置く |
| `npm run test:rules` | セキュリティルールの検証（`npm run emulators` が前提） |
| `npm run test:rules:ci` | 同上（エミュレータの起動・停止まで自動） |
| `npm run test:e2e:firebase` | Firebase 経路の E2E（エミュレータ込みで自動） |
| `npm run build:deploy` | 設定チェック付きの本番ビルド |

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

GitHub Actions から自動でデプロイする場合は次節を参照してください。

## GitHub Actions からのデプロイ

| ワークフロー | 実行タイミング | 内容 |
| --- | --- | --- |
| `verify.yml` | 他から呼ばれる | ビルドと全テスト（再利用可能ワークフロー） |
| `ci.yml` | PR・main 以外への push | 検証 + PR ごとのプレビューURL発行 |
| `deploy.yml` | main への push・手動実行 | 検証 + ルールと Hosting の本番デプロイ |

検証が通らなければデプロイは実行されません（`needs: verify`）。

### 1. サービスアカウントを作る

Firebase コンソール > プロジェクトの設定 > **サービスアカウント** > 「新しい秘密鍵の生成」で JSON をダウンロードします。

このサービスアカウントには次のロールが必要です（Google Cloud コンソールの IAM で付与）。

- **Firebase Hosting 管理者** — Hosting のデプロイ
- **Cloud Datastore インデックス管理者** / **Firebase Rules 管理者** — Firestore・Storage のルール反映
- **サービス アカウント ユーザー**

> `firebase init hosting:github` を使うと、サービスアカウントの作成とシークレット登録まで自動で行えます。ただしルールのデプロイ権限は別途付与が必要です。

### 2. GitHub に登録する

Settings > Secrets and variables > Actions で設定します。

**Secrets**（秘密情報）

| 名前 | 内容 |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | 上でダウンロードした JSON の中身をそのまま貼り付け |

**Variables**（秘密ではない設定）

| 名前 | 例 |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `AIza...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-app.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `your-app` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `your-app.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `123456789012` |
| `VITE_FIREBASE_APP_ID` | `1:123456789012:web:abc...` |
| `VITE_SITE_URL` | `https://your-app.web.app` |

> Firebase のウェブ設定値は**秘密情報ではありません**。ビルド結果に埋め込まれ、ブラウザから誰でも読めます。だから Secrets ではなく Variables に置いています。データの保護は `firestore.rules` / `storage.rules` の役割です。
>
> 設定が欠けたままデプロイされると、**同期されないアプリが無言で公開されます**。これを防ぐため `npm run build:deploy` は `scripts/check-env.js` で事前に確認し、不足があればビルドを中止します。

### 3. デプロイ

main にマージすると `deploy.yml` が動きます。手動で流す場合は Actions タブから `Deploy` を選んで「Run workflow」です。

PR を作ると `ci.yml` が検証したうえでプレビューURLを発行し、PR にコメントします（7日で失効）。

### デプロイ順序について

ルールを Hosting より**先に**反映しています。逆順にすると、新しいフィールドを書き込む新バージョンのアプリが、まだ古いルールに弾かれる時間帯が生まれるためです。

### 認証について

初回起動時に**匿名認証**でサインインします。アカウント作成を求めずにすぐ使い始められるようにするためです。

匿名のままだと、**ブラウザのデータを消すか機種変更したときに登録した服を復元できません**。設定画面（ホーム右上の歯車）に現在の保存先を表示し、Google アカウントへの紐づけへ誘導しています。

| 状態 | 表示 | できること |
| --- | --- | --- |
| `local` | この端末にだけ保存しています | （Firebase 未設定の構成） |
| `anonymous` | まだアカウントに紐づいていません + 警告 | Google アカウントに紐づける |
| `linked` | Google アカウントでバックアップ中 | ログアウト |

紐づけは `linkWithPopup` で行い、匿名アカウントのデータをそのまま引き継ぎます。

> **注意**: 選んだ Google アカウントが既に別のデータで使われている場合、Firebase は紐づけではなく通常のサインインになり、**匿名で貯めたデータは引き継がれません**。黙っていると「消えた」ように見えるため、`linkAccount()` は引き継げたかどうかを返し、UI で伝えています。

匿名の状態ではログアウトを出していません。ログアウトすると、そのデータに二度と戻れなくなるためです。

### データ構造

すべて `users/{uid}` 配下のサブコレクションに置いています。トップレベルに置いて `userId` で絞る方式に比べ、ルールが単純になり、複合インデックスも不要で、他人のドキュメントへ到達する経路がそもそも存在しません。

```
users/{uid}/closetItems/{itemId}
  category: 'outer' | 'tops' | 'bottoms' | 'shoes'
  name: string (1-40)
  imageUrl: string | null      … Cloud Storage の downloadURL
  imagePath: string | null     … users/{uid}/closet/{itemId}.jpg
  colorClass: string           … 画像が無いときの代替色
  warmth: 1-5                  … 生地の厚み
  formality: 1-3               … きれいめ度
  rainSafe: boolean
  available: boolean        … false なら提案から外す（洗濯中など）
  createdAt: number

users/{uid}/schedules/{scheduleId}
  date: 'YYYY-MM-DD'
  time: 'HH:MM' | '終日'
  title: string (1-60)
  createdAt: number

users/{uid}/outfits/{outfitId}
  date: 'YYYY-MM-DD'
  outerId / topsId / bottomsId / shoesId: string | null
  decidedAt: number
  createdAt: number

users/{uid}/meta/{docId}
  seededAt: number     … サンプル投入済みフラグ
```

`meta` はアプリ自身の状態を置く場所です。サンプルの投入を「0件なら入れる」で判定すると、利用者が全部削除したときに次回起動で復活してしまうため、投入したこと自体を記録しています。アカウントに紐づくので機種変更しても復活しません。

画像は Cloud Storage の `users/{uid}/closet/{itemId}.{webp|jpg}` に置きます。撮影時の処理は後述の「画像の容量」を参照してください。

### セキュリティルール

`firestore.rules` / `storage.rules` では、所有者チェックに加えてフィールドの型・範囲・`hasOnly()` による未知フィールドの排除まで行っています。`npm run test:rules` でエミュレータ相手に検証できます（26項目）。

> **注意**: Cloud Storage の `getDownloadURL()` が返す URL にはアクセストークンが含まれており、**URL を知っていれば未認証でも画像を取得できます**。公開されて困る画像を扱う場合は、ダウンロード URL を配らず `getBlob()` 経由に切り替えてください。

### オフライン対応

Firestore のローカルキャッシュ（`persistentLocalCache`）を有効にしているため、オフラインでも読み書きでき、復帰時に同期されます。複数タブで開いても壊れないよう `persistentMultipleTabManager` を使っています。

## コーデの選び方

気温・降水確率・その日の予定から各アイテムにスコアを付け、スコアを重みにした加重ランダムで引きます。最適解を1つ出すのではなく、ふさわしい服が出やすい「ガチャ」として成立させるのが狙いです。

### アウターの扱い

アウターだけは「必ず1点選ぶ」対象にしていません。30℃の日にコートを出しても仕方がないためです。

| 気温 | 扱い |
| --- | --- |
| 22℃ 以上 | 出さない |
| 16〜21℃ | 引くたびに半々で出す（朝晩は冷えるため） |
| 16℃ 未満 | 必ず出す |

アウターを着るぶん中は一段薄くてよいので、アウターが選ばれたときはトップスの目標の厚みを1段下げています。そうしないと、寒い日に「厚手のコート＋最も厚いニット」ばかりが出てしまいます。

アウターが未登録でも欠品扱いにはしません。寒い日にだけ「この気温だとアウターが欲しいところですが、まだ登録がありません」と添えます。

### 直近に着たものを避ける

毎日同じ組み合わせが出ると使い物にならないので、直近4日ぶんのコーデ記録を見て、最近着たアイテムのスコアを下げます。下げ幅は直近ほど大きくします（昨日 −3、3日前 −1）。

除外ではなく減点にとどめているのは、手持ちが少ないと選べるものが無くなってしまうためです。条件が同じ3着で試すと、昨日着たものの出現率は 35% から 26% に下がります。

### コーデ履歴

「これを着る」で決めたコーデは日付ごとに記録され、カレンダー画面で日付を選ぶと見返せます。カレンダーの日付には、予定がある日（赤）とコーデを決めた日（青）の印が付きます。

記録した後で削除されたアイテムは「削除されたアイテム」と表示します。名前だけ残しても実体と食い違うためです。

### お休み中（一時的に外す）

洗濯中やクリーニング中の服を削除せずに提案から外せます。クローゼットのカード下の「お休みにする」で切り替え、一覧では破線枠・薄い表示になって末尾にまとまります。

最近着たものとは扱いを変えていて、**お休み中は減点ではなく除外**です。今そこに無いものは選びようがないためです。

登録はあるのに全部お休み中の場合は、未登録とは別の案内を出します。

| 状態 | 提案文 |
| --- | --- |
| 未登録 | クローゼットにトップスが登録されていません… |
| 全部お休み中 | トップスがすべてお休み中です。クローゼットから戻すと提案できます |

### 登録内容の編集

クローゼットのカード左上、予定の行の鉛筆アイコンから編集できます。アイテムの登録画面は新規登録（撮影後）と編集で共用しています。入力項目が同じで、片方だけ直すとずれていくためです。

写真の撮り直しは編集では扱いません。削除して撮り直してください。

## 店舗までの距離

以前は「2.7 km 先」と固定値が書かれており、**利用者がどこにいても同じ距離を表示していました**。事実と異なる可能性がある表示なので、実際に計算するようにしています。

- 店舗データに `location: { lat, lon }` を入れると、現在地からの**直線距離**を表示します
- 店舗の座標か現在地のどちらかが分からなければ、距離は表示しません
- 現在地は天気の取得時に分かればそれを使い、無ければショップ画面の「現在地を使う」から取得します

> **現在は両店舗とも `location: null` です。** 正確な座標が分からないまま適当な値を入れると、もっともらしく間違った距離が出てしまうためです。`src/data/shops.js` の `TODO` に座標を入れれば、距離表示が有効になります。

距離は Haversine 式で求めた直線距離で、道のりではありません。表示にも「直線距離 約〜」と明記しています。

## 店舗の商品写真

ショップ画面には**実在する店舗名とリンク**が並びます。その隣に置く商品の写真・名前・価格は、実物だけを載せます。

以前はストックフォト（Unsplash）と、こちらで考えた商品名・価格が入っていました。利用者から見ると本物の品揃えと区別がつかないため、すべて削除しました。**現在はどちらの店舗も商品が未登録で、画面には「商品の写真は準備中です」と表示されます。**

### 載せてよい写真

店舗の許可を得た写真か、自分で撮影した写真に限ります。店舗のサイトや SNS の写真を許可なく転載しないでください。

### 追加のしかた

1. 写真を変換して `public/shops/<店舗ID>/` に置きます。

   ```bash
   npm run shop:photos -- minami ~/Desktop/shirt.jpg ~/Desktop/knit.jpg
   ```

   元のファイルは読むだけで、変更しません。EXIF の回転を反映し、正方形に切り、**320px の WebP** として書き出します（実測: 10.4MB のスマホ写真 → 11KB）。

2. 実行すると貼り付ける雛形が出るので、`src/data/shops.js` の `items` に貼り、商品名と価格を実物に合わせます。

   ```js
   items: [
     { photo: 'shirt.webp', name: '（実物の商品名）', price: 4900 },
     // 価格が分からない・変動するものは null（価格を表示しません）
     { photo: 'knit.webp', name: '（実物の商品名）', price: null },
   ],
   ```

3. `npm run test:shop` で確認します。

写真はリポジトリに入り、Firebase Hosting から配信されます。Storage の無料枠を使わず、Service Worker がプリキャッシュするのでオフラインでも表示されます。差し替えにはデプロイが必要です。

### なぜ 320px なのか

画面に出るのは 80 CSS px の正方形です。DPR 4 の端末でも 320px あれば足ります。これ以上大きくしても見た目は変わらず、通信量とプリキャッシュの容量だけが増えます。

### 退行の防止

`npm run test:shop`（CI でも実行）が次を確認します。

| 確認すること | 落ちる例 |
| --- | --- |
| 宣言した写真が実在する | `items` のファイル名を打ち間違えた |
| `public/shops/` に未参照のファイルが無い | 差し替えて古いファイルを消し忘れた |
| 形式が WebP、一辺 320px・60KB 以内 | 元の写真をそのまま置いた |
| 商品名が空でない | 雛形の `name: ''` のまま貼った |
| 価格が `null` か正の数 | 分からない価格に `0` や推測値を入れた |
| 外部のストックフォトを参照していない | Unsplash 等の URL が復活した |

`npm run test:history` は画面側も確認します。未登録の店舗に「準備中」が出ること、表示される商品名と価格が `shops.js` の宣言と一致すること、**外部から画像を1枚も読み込んでいない**ことです。

写真を `public/` 配下だけに限ったので、CSP の `img-src` から `images.unsplash.com` と `placehold.co` を外しました。

## 読み取り件数

Firestore は**クエリが返したドキュメント数で課金**されます。全件取ってからクライアントで絞る実装だと、使い込むほど費用と待ち時間が線形に増えます。

必要な範囲だけを問い合わせるため、バックエンドに `get`（1件）と `query`（条件指定）を用意しています。

| 用途 | 問い合わせ方 |
| --- | --- |
| その日の予定 | `where('date', '==', key)` |
| カレンダーの点 | `where('date', '>=', 月初)` + `where('date', '<=', 月末)` |
| その日のコーデ記録 | `where('date', '==', key)` + `limit(1)` |
| アイテムの削除・フラグ確認 | `get`（1件） |
| クローゼット一覧 | 全件（ガチャが全アイテムを必要とするため妥当） |

`query` に `orderBy` は付けていません。等価条件と別フィールドの並べ替えを混ぜると複合インデックスが必要になりますが、絞り込んだ後の件数は少ないので呼び出し側で並べ替えれば足ります。単一フィールドのインデックスは自動で作られるため、`firestore.indexes.json` は空のままです。

### 実測

予定365件・コーデ記録365件（1年ぶん）を入れた状態で、実際のエミュレータに対して測った結果です。

| 用途 | 変更前 | 現在 |
| --- | --- | --- |
| その日の予定 | 365件 | **1件** |
| カレンダーの点 | 365件 | **31件** |
| その日のコーデ記録 | 365件 | **1件** |

`npm run test:read-cost` が同じ条件で測り直し、件数が日数に比例していないことを確認します（CI でも実行）。

### まだ残っている改善余地

`getDocs`（1回取得）を使っているので、画面を開くたびにサーバへ問い合わせます。`onSnapshot` に替えるとローカルキャッシュから即座に描画でき、読み取りもさらに減らせますが、データ層を購読型に作り替える必要があるため見送っています。

## 日付の切り替わりと復帰

インストールして使うと、アプリは終了せずバックグラウンドに残ります。起動時に一度求めた日付や天気を持ち続けると、**翌朝開いたときに昨日の情報のまま操作する**ことになります（昨日の予定でコーデを選び、昨日の日付でコーデを保存してしまう）。

`src/lifecycle.js` が次の2つを監視しています。

- **日付の切り替わり** — 次の0時にタイマーを仕掛け、切り替わったら「今日」を取り直して表示を作り直します。バックグラウンドではタイマーが止められることがあるため、復帰のたびに張り直します
- **復帰** — `visibilitychange` に加え、`pageshow`（bfcache からの復元）も拾います。iOS では前者が来ないことがあるためです

天気は**取得から10分以上経っていれば**復帰時に取り直します。毎回叩くとAPIを無駄に消費し、放置すると朝の気温で夜のコーデを選ぶことになるためです。

`npm run test:lifecycle` が仮想時計で日付をまたがせ、表示とガチャの入力が切り替わることを検証します（CI でも実行）。

## 画像の容量

無料枠で運用することを前提に、撮影した写真は保存前に縮小・圧縮しています。

### 解像度: 長辺 640px

画面に出る最大サイズはクローゼットのカードで **150 CSS px** です。DPR 3 の端末でも 450px、DPR 4 でも 600px あれば足ります。それ以上大きくしても見た目は変わらず、保存容量と通信量だけが増えます。

| 表示箇所 | CSS px | DPR 3 での必要画素数 |
| --- | --- | --- |
| クローゼットのカード | 150 | 450px |
| 提案結果のサムネイル | 80 | 240px |

### 形式: WebP（非対応端末は JPEG）

同じ見た目なら WebP のほうが小さく収まります。ただし canvas での WebP 書き出しは Safari 16.4 未満が非対応で、その場合 `toDataURL` は**黙って PNG を返します**（JPEG より桁違いに大きい）。返ってきた形式を確認して、駄目なら JPEG に落としています。

### 実測

合成画像での比較です。実際の写真はこの中間に収まります。

| 被写体 | 変更前（800px / JPEG） | 現在（640px / WebP） | 削減 |
| --- | --- | --- | --- |
| 生地の質感のある服 | 33 KB | 7 KB | 79% |
| 柄物・毛足のある服 | 134 KB | 96 KB | 29% |

1着あたり **10〜100KB** 程度です。Cloud Storage の無料枠（5GB）なら、単純計算で数万着ぶんに相当します。実際には枚数より**ダウンロード量**のほうが先に効きますが、クローゼットの画像は Service Worker が 30日間キャッシュするので、同じ端末で繰り返し開いても再取得されません。

> 無料枠の内容は変わることがあります。実際の使用量は Firebase コンソールの使用状況ページで確認してください。

### 退行の防止

ここは壊れても画面上は何も変わらないため気づきにくい箇所です。`npm run test:image` が疑似カメラで撮影から保存まで通し、**形式・画素数・バイト数**を検証します（CI でも実行）。

## PWA

ホーム画面に追加すると、ブラウザのUIなしで単独のアプリとして起動します。

### インストール導線

ブラウザ既定の導線はメニューの奥にあって気づかれないため、自前の案内を出しています。

- **Chrome / Edge / Android** — `beforeinstallprompt` を受け取ったらホーム画面下部に案内を表示し、「追加」でブラウザのインストールダイアログを開きます
- **iOS Safari** — 同イベントに対応していないので、共有ボタンからの手順を案内します
- 閉じた場合は14日間再表示しません（`localStorage`。使えない環境では毎回出ます）
- インストール済み（`display-mode: standalone`）なら出しません

### 更新の通知

`registerType` は `prompt` です。`autoUpdate` だと新バージョンを検知した瞬間にリロードがかかり、撮影フォームの入力中などに巻き込まれるため、**更新するかを利用者に委ねています**。新しい Service Worker を検知するとトーストと案内を出し、「更新」を押したときだけ再読み込みします。

### ショートカット

アイコンを長押しすると出るメニューです。クエリパラメータで起動時の画面を指定します。

| ショートカット | URL | 動作 |
| --- | --- | --- |
| コーデを引く | `/?action=gacha` | 天気の取得を待ってからガチャを実行 |
| クローゼット | `/?screen=closet` | クローゼットを開く |
| 予定を追加 | `/?screen=calendar` | カレンダーを開く |

処理後はクエリを `history.replaceState` で取り除きます。残すとリロードのたびに再実行されるためです。

### キャッシュ戦略

| 対象 | 戦略 | 理由 |
| --- | --- | --- |
| アプリ本体（HTML/JS/CSS/アイコン） | プリキャッシュ | オフラインで起動できるように |
| 天気API | NetworkFirst（8秒でタイムアウト） | 鮮度が重要。オフライン時のみ直近の値 |
| クローゼットの画像 | CacheFirst（30日） | 変わらないので取り直さない |
| Firebase SDK | StaleWhileRevalidate | 600KB超あるので初回プリキャッシュから除外 |

### 画像の生成

アイコンと、インストールダイアログ用のスクリーンショットはスクリプトで生成し、リポジトリにコミットしています（CI でブラウザを立ち上げ直さずに済むように）。

```bash
npm run icons        # アイコン + OGP画像
npm run screenshots  # manifest の screenshots（実際の画面を撮影）
```

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

#### Google ログインと CSP

`script-src` に `https://apis.google.com` が入っています。**外しても画面上は何も変わらないので、外さないでください。**

Firebase Auth は `signInWithPopup` / `linkWithPopup` を呼ぶと、ポップアップを開く**前に** `https://apis.google.com/js/api.js` を `<script>` として読み込み、それで作った iframe 経由でポップアップの結果を受け取ります（SDK に URL がハードコードされています）。

`script-src 'self'` だけだとここで止まり、**ポップアップが開かないまま `auth/internal-error` になります**。画面には「連携できませんでした」としか出ないため、原因が分かりません。実際にこれで Google ログインが動いていませんでした。

必要なのは次の2つです。

| ディレクティブ | 必要な値 | 用途 |
| --- | --- | --- |
| `script-src` | `https://apis.google.com` | ポップアップの結果を受け取る仕組みの読み込み |
| `frame-src` | `https://<authDomain>` | `https://<authDomain>/__/auth/iframe` |

ポップアップ本体（`/__/auth/handler`）は別ウィンドウなので `frame-src` の対象外です。iframe とポップアップはどちらも別オリジンの文書なので、こちら側の `connect-src` には影響されません。

`npm run test:csp` が、この CSP で `apis.google.com` を実際に読み込めること、`frame-src` に authDomain のオリジンがあること、そして **SDK が今もその URL を使っていること**（バージョンアップでホストが変わったら気づけるように）を確認します。

`npm run check:env` は、`VITE_FIREBASE_AUTH_DOMAIN` が `firebase.json` の `frame-src` に載っているかを突き合わせます。authDomain を `web.app` のものに変えると frame-src に一致しなくなるため、デプロイ用ビルドを止めます。

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
    shops.js              周辺の服屋（静的データ + 営業時間判定 + 商品写真の宣言）
    account.js            アカウントの状態と Google 連携
  domain/
    gacha.js              抽選ロジック（DOM非依存）
    weather.js            天気取得（DOM非依存）
    dates.js              日付ユーティリティ
    geo.js                2地点間の距離（Haversine）
  ui/                   画面ごとの描画とフォーカス管理
    pwa.js              インストール導線・更新通知・オフライン表示
    settings.js         設定画面（データの保存先）
    item-form.js        アイテムの登録・編集フォーム（両モード共用）
.github/workflows/
  verify.yml            ビルドと全テスト（再利用可能）
  ci.yml                PR 検証 + プレビューデプロイ
  deploy.yml            本番デプロイ
scripts/
  check-env.js          デプロイ前の設定チェック
  serve-and-run.js      プレビュー起動 → テスト実行 → 後片付け
  generate-icons.js     アイコンと OGP 画像の生成
  generate-screenshots.js  manifest 用スクリーンショットの生成
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
