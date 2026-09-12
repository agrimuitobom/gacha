import { chromium } from 'playwright';

/**
 * Playwright の Chromium を起動する。
 *
 * CHROME_PATH が設定されていればそれを使い、未設定なら Playwright が
 * 管理するブラウザを使う。CI では後者（npx playwright install chromium）。
 */
export function launchChromium() {
  const executablePath = process.env.CHROME_PATH || undefined;
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });
}
