import { h, $ } from './dom.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';
import {
  pushAvailability, getPushSettings, enablePush, disablePush, updateLeadMinutes,
} from '../data/push.js';
import { LEAD_OPTIONS, DEFAULT_LEAD_MINUTES, ALL_DAY_NOTIFY_HOUR } from '../domain/reminders.js';

/**
 * 設定画面の「予定の通知」。
 *
 * 使えない理由は環境によって違い、直し方もそれぞれ違う。
 * 「使えません」とだけ出すと何をすればよいか分からないので、理由ごとに案内する。
 */
const UNAVAILABLE = {
  'no-sync': 'オンライン同期を使っているときだけ通知できます。この構成では予定がこの端末の中にしか無く、通知を送る側から読めません。',
  'no-key': '通知の送信設定がまだありません（VITE_VAPID_PUBLIC_KEY が未設定）。README の「予定の通知」を参照してください。',
  'ios-browser': 'iPhone / iPad では、ホーム画面に追加したアプリから開くと通知を有効にできます（iOS 16.4 以降）。',
  unsupported: 'このブラウザはプッシュ通知に対応していません。',
  denied: '通知がブロックされています。端末またはブラウザの設定で、このアプリの通知を許可してください。',
};

function description(text) {
  return h('p', { class: 'text-xs text-gray-700 leading-relaxed', text });
}

function leadSelect(current) {
  return h('div', { class: 'flex items-center gap-2' },
    h('label', { for: 'notify-lead', class: 'text-xs font-bold text-gray-800 shrink-0', text: 'お知らせするタイミング' }),
    h('select', {
      id: 'notify-lead',
      class: 'flex-1 min-w-0 border border-gray-300 rounded-xl px-3 py-2 text-base text-gray-900 bg-gray-50',
    }, ...LEAD_OPTIONS.map(({ minutes, label }) =>
      h('option', { value: String(minutes), selected: minutes === current, text: label })))
  );
}

function button({ label, action, iconName, primary }) {
  return h('button', {
    type: 'button',
    id: 'notify-action',
    class: primary
      ? 'w-full min-h-[44px] py-3 bg-rose-600 text-white font-bold text-sm rounded-2xl active:bg-rose-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60'
      : 'w-full min-h-[44px] py-3 bg-gray-100 text-gray-800 font-bold text-sm rounded-2xl active:bg-gray-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-60',
    dataset: { action },
  }, icon(iconName, 'w-4 h-4'), label);
}

export async function renderNotifications() {
  const body = $('notify-body');
  if (!body) return;

  let availability;
  let settings = null;
  try {
    availability = await pushAvailability();
    if (availability === 'ok') settings = await getPushSettings();
  } catch (err) {
    console.error('通知の設定を確認できませんでした:', err);
    body.replaceChildren(description('通知の設定を確認できませんでした。'));
    return;
  }

  if (availability !== 'ok') {
    body.replaceChildren(description(UNAVAILABLE[availability] || UNAVAILABLE.unsupported));
    return;
  }

  const timing = `時刻のある予定は指定した時間前に、終日の予定は当日の朝${ALL_DAY_NOTIFY_HOUR}時ごろにお知らせします。`;

  if (!settings) {
    body.replaceChildren(
      description(`予定が近づいたら、この端末に通知します。${timing}`),
      leadSelect(DEFAULT_LEAD_MINUTES),
      button({ label: '通知をオンにする', action: 'enable-push', iconName: 'bell', primary: true })
    );
    return;
  }

  body.replaceChildren(
    h('p', { class: 'flex items-center gap-2 text-sm font-bold text-gray-900' },
      h('span', { class: 'w-2 h-2 rounded-full bg-green-600', 'aria-hidden': 'true' }),
      'この端末に通知します'
    ),
    leadSelect(settings.leadMinutes),
    description(`${timing}数分ほど遅れて届くことがあります。`),
    button({ label: '通知をオフにする', action: 'disable-push', iconName: 'bell-off' })
  );

  // 選び直したらその場で保存する（保存ボタンを挟むほどの設定ではない）
  $('notify-lead').addEventListener('change', async (event) => {
    try {
      await updateLeadMinutes(Number(event.target.value));
      showToast('通知のタイミングを変更しました', { iconName: 'bell' });
    } catch (err) {
      console.error('通知の設定を保存できませんでした:', err);
      showToast('保存できませんでした', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
    }
  });
}

function setBusy(label) {
  const action = $('notify-action');
  if (!action) return;
  action.disabled = true;
  action.textContent = label;
}

export async function turnOnNotifications() {
  const leadMinutes = Number($('notify-lead')?.value) || DEFAULT_LEAD_MINUTES;
  setBusy('設定中...');
  try {
    await enablePush({ leadMinutes });
    showToast('予定の通知をオンにしました', { iconName: 'bell' });
  } catch (err) {
    console.error('通知を有効にできませんでした:', err);
    const message = err.code === 'denied'
      ? '通知がブロックされました。端末の設定から許可してください'
      : err.code === 'dismissed'
        ? '通知の許可がまだです'
        : '通知を有効にできませんでした';
    showToast(message, { iconName: 'alert-circle', iconColor: 'text-amber-400' });
  }
  await renderNotifications();
}

export async function turnOffNotifications() {
  setBusy('解除中...');
  try {
    await disablePush();
    showToast('予定の通知をオフにしました', { iconName: 'bell-off' });
  } catch (err) {
    console.error('通知を解除できませんでした:', err);
    showToast('解除できませんでした', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
  }
  await renderNotifications();
}
