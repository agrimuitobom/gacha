import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * OGP の og:image / og:url は絶対URLでなければクローラが解決できない。
 * VITE_SITE_URL が設定されていれば、ビルド時に相対パスを絶対URLへ書き換える。
 * 未設定なら相対パスのまま出力する（開発・プレビュー用）。
 */
function absoluteUrls(siteUrl) {
  return {
    name: 'absolute-og-urls',
    transformIndexHtml(html) {
      if (!siteUrl) return html;
      const base = siteUrl.replace(/\/$/, '');
      return html.replace(
        /(<meta\s+(?:property|name)="(?:og:image|og:url|twitter:image)"\s+content=")(\/[^"]*)"/g,
        (_match, prefix, path) => `${prefix}${base}${path}"`
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const siteUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL || '';

  return {
  plugins: [
    absoluteUrls(siteUrl),
    tailwindcss(),
    VitePWA({
      // autoUpdate は新バージョンを検知すると即リロードする。
      // 撮影フォーム入力中などに巻き込まれるので、利用者に選ばせる。
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        // id を明示すると start_url を変えてもインストール済みアプリと同一だと認識される
        id: '/',
        name: 'コーデガチャ',
        short_name: 'コーデガチャ',
        description: '天気と予定に合わせて、手持ちの服から今日のコーデを提案します',
        lang: 'ja',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        background_color: '#fce7f3',
        theme_color: '#ec4899',
        categories: ['lifestyle', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Android Chrome のリッチなインストールダイアログに使われる
        screenshots: [
          {
            src: 'screenshots/home.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: '天気と予定に合わせてコーデを引く',
          },
          {
            src: 'screenshots/result.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: '提案されたコーデと、その理由',
          },
          {
            src: 'screenshots/closet.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: '手持ちの服を登録しておくクローゼット',
          },
        ],
        // アイコン長押しで開くショートカット
        shortcuts: [
          {
            name: 'コーデを引く',
            short_name: 'ガチャ',
            description: '今日のコーデをすぐに提案します',
            url: '/?action=gacha',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'クローゼット',
            short_name: 'クローゼット',
            description: '登録した服を確認・追加します',
            url: '/?screen=closet',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: '予定を追加',
            short_name: '予定',
            description: 'カレンダーを開いて予定を登録します',
            url: '/?screen=calendar',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Firebase SDK は 600KB 超あり、未設定なら読み込まれもしない。
        // 初回訪問のプリキャッシュから外し、実際に使われたときだけ保存する。
        globIgnores: ['**/firebase-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/firebase-.*\.js$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'firebase-sdk' },
          },
          {
            // 天気は鮮度が大事なので network-first（オフライン時のみ直近の値を返す）
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'weather-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'closet-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    // Firebase SDK は意図的に別チャンクへ分離済みなので警告の閾値を上げる
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Firebase SDK は重いので初回表示をブロックしないよう1チャンクにまとめる
        // （backend-firebase.js 自体が動的 import なので遅延読み込みされる）
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase';
          }
          return null;
        },
      },
    },
  },
  };
});
