import { h, $ } from './dom.js';
import { icon } from './icons.js';
import { accountRepo } from '../data/account.js';
import { showToast } from './toast.js';

/**
 * 設定画面のうち「データの保存先」の部分。
 *
 * 既定の匿名認証は、すぐ使い始められる代わりに
 * ブラウザのデータを消すか機種変更すると二度と戻れない。
 * 何着も登録したあとで失うと痛いので、状態をはっきり見せて
 * Google アカウントへの紐づけへ誘導する。
 */

function statusRow({ iconName, iconClass, title, description }) {
  return h('div', { class: 'flex items-start gap-3' },
    h('span', { class: `w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${iconClass}` },
      icon(iconName, 'w-5 h-5')
    ),
    h('div', { class: 'min-w-0 flex-1' },
      h('p', { class: 'text-sm font-bold text-gray-900', text: title }),
      h('p', { class: 'text-xs text-gray-700 leading-relaxed mt-0.5', text: description })
    )
  );
}

function warning(text) {
  return h('p', { class: 'flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed' },
    icon('triangle-alert', 'w-4 h-4 mt-0.5 text-amber-700'),
    h('span', { text })
  );
}

function primaryButton({ label, action, iconName }) {
  return h('button', {
    type: 'button',
    id: 'account-action',
    class: 'w-full min-h-[44px] py-3 bg-gray-900 text-white font-bold text-sm rounded-2xl active:bg-gray-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60',
    dataset: { action },
  }, icon(iconName, 'w-4 h-4'), label);
}

function subtleButton({ label, action, iconName }) {
  return h('button', {
    type: 'button',
    class: 'w-full min-h-[44px] py-3 bg-gray-100 text-gray-800 font-bold text-sm rounded-2xl active:bg-gray-200 transition-colors flex items-center justify-center gap-2',
    dataset: { action },
  }, icon(iconName, 'w-4 h-4'), label);
}

export async function renderSettings() {
  const body = $('account-body');
  body.replaceChildren(h('p', { class: 'text-xs text-gray-600 py-2', text: '確認中...' }));

  let account;
  try {
    account = await accountRepo.get();
  } catch (err) {
    console.error('アカウント情報を取得できませんでした:', err);
    body.replaceChildren(h('p', { class: 'text-xs text-gray-700 py-2', text: 'アカウント情報を取得できませんでした。' }));
    return;
  }

  const parts = [];

  if (account.degraded) {
    parts.push(statusRow({
      iconName: 'wifi-off',
      iconClass: 'bg-amber-100 text-amber-800',
      title: 'オンライン同期に接続できていません',
      description: 'この端末に保存しています。接続が戻ってから設定を開き直してください。',
    }));
  } else if (account.mode === 'local') {
    parts.push(statusRow({
      iconName: 'smartphone',
      iconClass: 'bg-gray-100 text-gray-700',
      title: 'この端末にだけ保存しています',
      description: 'オンライン同期は設定されていません。ブラウザのデータを消すと、登録した服は復元できません。',
    }));
  } else if (account.mode === 'linked') {
    parts.push(statusRow({
      iconName: 'shield-check',
      iconClass: 'bg-green-100 text-green-800',
      title: 'Google アカウントでバックアップ中',
      description: account.email
        ? `${account.email} に紐づいています。別の端末でも同じデータを開けます。`
        : '別の端末でも同じデータを開けます。',
    }));
  } else {
    // anonymous / signed-out
    parts.push(statusRow({
      iconName: 'smartphone',
      iconClass: 'bg-gray-100 text-gray-700',
      title: 'まだアカウントに紐づいていません',
      description: 'データはオンラインに保存されていますが、このブラウザからしか開けません。',
    }));
    parts.push(warning(
      'ブラウザのデータを消したり機種変更したりすると、登録した服の写真は復元できません。Google アカウントに紐づけておくと、別の端末からも開けるようになります。'
    ));
  }

  if (account.mode === 'anonymous' || account.mode === 'signed-out') {
    parts.push(primaryButton({
      label: 'Google アカウントに紐づける',
      action: 'link-account',
      iconName: 'log-in',
    }));
  }

  if (account.canSignOut) {
    parts.push(subtleButton({
      label: 'ログアウト',
      action: 'sign-out-account',
      iconName: 'log-out',
    }));
  }

  body.replaceChildren(...parts);
}

/** 連携ボタンの処理。成功しても引き継げない場合があるので、結果を伝える */
export async function linkAccount() {
  const button = $('account-action');
  if (button) {
    button.disabled = true;
    button.textContent = '連携中...';
  }

  try {
    const { carriedOver } = await accountRepo.link();
    await renderSettings();
    if (carriedOver) {
      showToast('バックアップを有効にしました', { iconName: 'shield-check' });
    } else {
      // 既に使われている Google アカウントを選ぶと、通常のサインインになり
      // 匿名で貯めたデータは引き継がれない。黙っていると「消えた」と見える。
      showToast('そのアカウントの既存データを開きました', {
        iconName: 'alert-circle', iconColor: 'text-amber-400',
      });
    }
  } catch (err) {
    console.error('アカウント連携に失敗しました:', err);
    await renderSettings();
    const messages = {
      'auth/popup-closed-by-user': '連携を中止しました',
      'auth/popup-blocked': 'ポップアップがブロックされました。ブラウザの設定をご確認ください',
      'auth/cancelled-popup-request': '連携を中止しました',
      'auth/network-request-failed': '通信できませんでした。接続をご確認ください',
      'auth/operation-not-allowed': 'Google ログインが有効になっていません',
    };
    showToast(messages[err.code] || '連携できませんでした', {
      iconName: 'alert-circle', iconColor: 'text-amber-400',
    });
  }
}

export async function signOutAccount() {
  try {
    await accountRepo.signOut();
    showToast('ログアウトしました。再読み込みします', { iconName: 'log-out' });
    // サインインし直しとデータの読み直しが要るので、まっさらから始める
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    console.error('ログアウトに失敗しました:', err);
    showToast('ログアウトできませんでした', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
  }
}
