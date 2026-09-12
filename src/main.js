import './styles.css';

import { $ } from './ui/dom.js';
import { setIcon } from './ui/icons.js';
import { state } from './state.js';
import { closetRepo, scheduleRepo, outfitRepo, seedIfEmpty } from './data/repositories.js';
import { getBackend } from './data/backend.js';
import { isFirebaseConfigured } from './config/env.js';
import { drawOutfit } from './domain/gacha.js';
import { initScreens, navigateTo, navigateBack, currentScreen, onScreenEnter } from './ui/screens.js';
import { showToast } from './ui/toast.js';
import { loadWeather, renderWeather } from './ui/weather-widget.js';
import { refreshHomeWidget } from './ui/home.js';
import { renderCloset, switchTab, handleTabKeydown } from './ui/closet.js';
import { renderResult } from './ui/result.js';
import { renderShops } from './ui/shop.js';
import {
  renderCalendar, renderSchedules, addScheduleInputRow, resetScheduleInputRows,
  removeScheduleInputRow, readScheduleInputRows, moveCalendarMonth, resetCalendarToToday,
} from './ui/calendar.js';
import {
  startCamera, stopCamera, takePhoto, hideCaptureForm, readCaptureForm, isCameraActive,
} from './ui/camera.js';
import {
  initPwa, promptInstall, dismissInstall, showIosInstallHelp, reloadForUpdate,
} from './ui/pwa.js';

const SCREENS = [
  'home-screen', 'result-screen', 'closet-screen',
  'shop-screen', 'camera-screen', 'calendar-screen',
];

/* ---------------- ガチャ ---------------- */

let gachaRunning = false;
const GACHA_SPIN_MS = 1200;        // ガチャ演出の長さ
const REGACHA_SPIN_MS = 400;       // 結果画面での引き直し（すでに結果が見えているので短く）
const CARD_REMOVE_MS = 200;        // 削除アニメーションの長さ。styles の duration-200 と揃える

function setGachaSpinning(spinning) {
  const button = $('gacha-btn');
  button.disabled = spinning;
  button.setAttribute('aria-busy', String(spinning));
  button.classList.toggle('hover:scale-105', !spinning);
  button.classList.toggle('animate-pulse-slow', !spinning);
  button.classList.toggle('animate-spin-slow', spinning);
  button.classList.toggle('opacity-90', spinning);

  $('icon-wand').classList.toggle('hidden', spinning);
  $('icon-spinner').classList.toggle('hidden', !spinning);
  $('gacha-text').textContent = spinning ? 'Thinking...' : 'コーデガチャ';
  $('gacha-subtext').classList.toggle('hidden', spinning);
}

async function buildOutfit() {
  const [items, schedules] = await Promise.all([
    closetRepo.list(),
    scheduleRepo.listByDate(state.todayKey),
  ]);
  return drawOutfit({ items, weather: state.weather, schedules });
}

async function startGacha(origin) {
  if (gachaRunning) return;
  gachaRunning = true;
  setGachaSpinning(true);

  try {
    // 抽選と演出を並行させる（演出だけ待って結果が固定、という状態にしない）
    const [outfit] = await Promise.all([
      buildOutfit(),
      new Promise((resolve) => setTimeout(resolve, GACHA_SPIN_MS)),
    ]);
    renderResult(outfit);
    navigateTo('result-screen', { origin });
  } catch (err) {
    console.error('コーデの抽選に失敗しました:', err);
    showToast('コーデを作成できませんでした', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
  } finally {
    setGachaSpinning(false);
    gachaRunning = false;
  }
}

/** 結果画面の「やり直す」：ホームを経由せず、その場で引き直す */
async function regacha() {
  if (gachaRunning) return;
  gachaRunning = true;

  const items = $('result-items');
  $('result-message').textContent = '選び直しています...';
  items.classList.add('opacity-40');

  try {
    const [outfit] = await Promise.all([
      buildOutfit(),
      new Promise((resolve) => setTimeout(resolve, REGACHA_SPIN_MS)),
    ]);
    renderResult(outfit);
  } catch (err) {
    console.error('コーデの抽選に失敗しました:', err);
    showToast('コーデを作成できませんでした', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
  } finally {
    items.classList.remove('opacity-40');
    gachaRunning = false;
  }
}

async function decideOutfit() {
  if (!state.currentOutfit) return;
  try {
    await outfitRepo.save(state.todayKey, state.currentOutfit);
    showToast('今日のコーデを決定しました！');
  } catch (err) {
    console.error('コーデの保存に失敗しました:', err);
    showToast('保存できませんでした', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
  }
  navigateBack();
}

/* ---------------- カメラ ---------------- */

function closeCamera() {
  stopCamera();
  hideCaptureForm();
  state.pendingPhoto = null;
  navigateBack();
}

async function saveCapturedItem() {
  if (!state.pendingPhoto) return;
  const input = readCaptureForm();

  if (!input.name) {
    showToast('アイテム名を入力してください', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
    $('capture-name').focus();
    return;
  }

  const saveButton = $('capture-save-btn');
  saveButton.disabled = true;
  saveButton.textContent = '保存中...';

  try {
    await closetRepo.add({ ...input, imageDataUrl: state.pendingPhoto });
    state.pendingPhoto = null;
    switchTab(input.category);
    await renderCloset();
    closeCamera();
    showToast(`「${input.name}」を追加しました`);
  } catch (err) {
    console.error('アイテムの保存に失敗しました:', err);
    showToast('保存できませんでした', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = '保存する';
  }
}

async function deleteClosetItem(id) {
  await closetRepo.remove(id);
  const card = document.querySelector(`[data-item-card="${CSS.escape(id)}"]`);
  if (card) {
    card.classList.add('transition-all', 'duration-200', 'scale-90', 'opacity-0');
    setTimeout(() => renderCloset(), CARD_REMOVE_MS);
  } else {
    await renderCloset();
  }
}

/* ---------------- 予定 ---------------- */

async function addSchedules() {
  const entries = readScheduleInputRows();

  if (entries.length === 0) {
    showToast('予定の内容を入力してください', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
    return;
  }

  for (const entry of entries) {
    await scheduleRepo.add(state.selectedDateKey, entry);
  }

  resetScheduleInputRows();
  await Promise.all([renderCalendar(), renderSchedules(), refreshHomeWidget()]);
  showToast(`${entries.length}件の予定を追加しました`);
}

/* ---------------- アクション（インライン onclick は使わない） ---------------- */

const actions = {
  'open-calendar': async (el) => {
    resetCalendarToToday();
    navigateTo('calendar-screen', { origin: el });
    resetScheduleInputRows();
    await Promise.all([renderCalendar(), renderSchedules()]);
  },
  'refresh-weather': () => loadWeather(true),
  'start-gacha': (el) => startGacha(el),
  regacha: () => regacha(),
  'decide-outfit': () => decideOutfit(),
  'open-closet': async (el) => {
    navigateTo('closet-screen', { origin: el });
    await renderCloset();
  },
  'open-shop': async (el) => {
    navigateTo('shop-screen', { origin: el });
    await renderShops();
  },
  'open-camera': async (el) => {
    navigateTo('camera-screen', { origin: el });
    await startCamera();
  },
  'close-camera': () => closeCamera(),
  'take-photo': () => takePhoto(),
  'cancel-capture': () => {
    state.pendingPhoto = null;
    hideCaptureForm();
  },
  'save-capture': () => saveCapturedItem(),
  back: () => navigateBack(),
  'switch-tab': (el) => switchTab(el.dataset.tab),
  'delete-item': (el) => deleteClosetItem(el.dataset.id),
  'change-month': (el) => {
    moveCalendarMonth(parseInt(el.dataset.delta, 10));
    return renderCalendar();
  },
  'select-date': async (el) => {
    state.selectedDateKey = el.dataset.date;
    resetScheduleInputRows();
    await Promise.all([renderCalendar(), renderSchedules()]);
  },
  'add-input-row': () => addScheduleInputRow({ focus: true }),
  'remove-input-row': (el) => removeScheduleInputRow(el.dataset.rowId),
  'add-schedules': () => addSchedules(),
  'delete-schedule': async (el) => {
    await scheduleRepo.remove(el.dataset.id);
    await Promise.all([renderCalendar(), renderSchedules(), refreshHomeWidget()]);
  },
  'install-app': () => promptInstall(),
  'show-ios-install': () => showIosInstallHelp(),
  'dismiss-install': () => dismissInstall(),
  'reload-for-update': () => reloadForUpdate(),
};

function registerEventHandlers() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const handler = actions[target.dataset.action];
    if (!handler) return;
    event.preventDefault();
    Promise.resolve(handler(target)).catch((err) => {
      console.error(`アクション "${target.dataset.action}" の実行に失敗しました:`, err);
      showToast('処理に失敗しました', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
    });
  });

  // 画像の読み込み失敗を委譲で処理する（error はバブルしないので capture フェーズで拾う）
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const fallback = img.dataset.fallback;
    if (!fallback || img.src === fallback) return;
    img.src = fallback;
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (currentScreen() === 'camera-screen') closeCamera();
      else navigateBack();
      return;
    }
    if (event.target.matches?.('[role="tab"]')) handleTabKeydown(event);
  });

  // オフライン復帰時に天気を取り直す
  window.addEventListener('online', () => loadWeather(false));
  window.addEventListener('offline', () => {
    if (!state.weather) {
      state.weatherError = 'オフラインです';
      renderWeather();
    }
  });
}

/* ---------------- 初期化 ---------------- */

function renderStaticIcons() {
  for (const element of document.querySelectorAll('[data-icon]')) {
    setIcon(element, element.dataset.icon, element.dataset.iconClass || 'w-4 h-4');
  }
}

/**
 * manifest の shortcuts から起動されたときの初期画面を処理する。
 *   /?action=gacha    … そのままガチャを引く
 *   /?screen=closet   … クローゼットを開く
 *   /?screen=calendar … カレンダーを開く
 */
async function handleLaunchIntent() {
  const params = new URLSearchParams(location.search);
  const action = params.get('action');
  const screen = params.get('screen');
  if (!action && !screen) return;

  // 履歴に残すとリロードのたびに再実行されるので、URL から取り除く
  history.replaceState(null, '', location.pathname);

  if (screen === 'closet') {
    await actions['open-closet'](null);
  } else if (screen === 'calendar') {
    await actions['open-calendar'](null);
  } else if (action === 'gacha') {
    // 天気の取得を少し待ってから引く（気温を反映させたいため）
    await new Promise((resolve) => setTimeout(resolve, WEATHER_GRACE_MS));
    await startGacha(null);
  }
}

const WEATHER_GRACE_MS = 1500;

async function init() {
  renderStaticIcons();
  initScreens(SCREENS);
  switchTab('tops');
  registerEventHandlers();
  onScreenEnter('home-screen', refreshHomeWidget);
  initPwa();

  // 天気はデータ層と独立に取得できるので待たずに始める
  loadWeather(false);

  try {
    const backend = await getBackend();
    if (backend.degradedFrom === 'firebase') {
      showToast('オンライン同期に接続できません。この端末に保存します', {
        iconName: 'wifi-off', iconColor: 'text-amber-400',
      });
    }
    await seedIfEmpty();
  } catch (err) {
    console.error('データの初期化に失敗しました:', err);
    showToast('データを読み込めませんでした', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
  }

  await refreshHomeWidget();
  resetScheduleInputRows();
  await handleLaunchIntent();

  if (import.meta.env.DEV) {
    console.info(`保存先: ${isFirebaseConfigured ? 'Firebase' : 'ブラウザ内 (IndexedDB)'}`);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
