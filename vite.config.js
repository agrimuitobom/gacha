import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'コーデガチャ',
        short_name: 'コーデガチャ',
        description: '天気と予定に合わせて、手持ちの服から今日のコーデを提案します',
        lang: 'ja',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fce7f3',
        theme_color: '#ec4899',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
});
