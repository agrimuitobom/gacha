import { chromium } from 'playwright';

/**
 * Playwright の Chromium を起動する。
 *
 * CHROME_PATH が設定されていればそれを使い、未設定なら Playwright が
 * 管理するブラウザを使う。CI では後者（npx playwright install chromium）。
 */
export function launchChromium({ fakeCamera = false } = {}) {
  const executablePath = process.env.CHROME_PATH || undefined;
  const args = ['--no-sandbox'];
  if (fakeCamera) {
    // 実機のカメラなしで getUserMedia を通すための合成映像
    args.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream');
  }
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args,
  });
}
