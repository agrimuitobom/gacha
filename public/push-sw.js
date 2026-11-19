/* global self, clients */
/**
 * プッシュ通知の受け取り（Service Worker に importScripts で読み込む）。
 *
 * Service Worker 本体は vite-plugin-pwa（workbox）が生成するので、
 * 手で書く部分だけをこのファイルに分けている。送信側は reminders/send.mjs。
 *
 * 受け取る JSON: { title, body, url, tag }
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'コーデガチャ';
  // iOS は「届いたのに表示しない」プッシュが続くと購読を打ち切るので、必ず表示する
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    lang: 'ja',
    // 同じ予定の通知は上書きする（再送されても積み重ならない）
    tag: payload.tag || undefined,
    data: { url: payload.url || '/?screen=calendar' },
    // Android の Chrome では通知から直接ガチャを引ける（iOS では表示されない）
    actions: [{ action: 'gacha', title: 'コーデを引く' }],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.action === 'gacha' ? '/?action=gacha' : (event.notification.data?.url || '/');
  const url = new URL(target, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    // 既に開いていれば、新しく開かずにそこへ移動する
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      if ('navigate' in client) await client.navigate(url);
      return;
    }
    await clients.openWindow(url);
  })());
});
