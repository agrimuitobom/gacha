import './styles.css';

import { $ } from './ui/dom.js';
import { setIcon } from './ui/icons.js';
import { state } from './state.js';
import { initLifecycle } from './lifecycle.js';
import { closetRepo, scheduleRepo, outfitRepo, seedIfNeeded } from './data/repositories.js';
import { getBackend } from './data/backend.js';
import { isFirebaseConfigured } from './config/env.js';
import { drawOutfit, buildRecentlyWorn, RECENT_WINDOW_DAYS } from './domain/gacha.js';
import { toDateKey, fromDateKey } from './domain/dates.js';
import { initScreens, navigateTo, navigateBack, currentScreen, onScreenEnter } from './ui/screens.js';
import { showToast } from './ui/toast.js';
import { loadWeather, renderWeather, refreshWeatherIfStale } from './ui/weather-widget.js';
import { refreshHomeWidget } from './ui/home.js';
import { renderCloset, switchTab, handleTabKeydown } from './ui/closet.js';
import { renderResult } from './ui/result.js';
import { renderShops, locateShops } from './ui/shop.js';
import { renderSettings, linkAccount, signOutAccount } from './ui/settings.js';
import {
  renderCalendar, renderSchedules, addScheduleInputRow, resetScheduleInputRows,
  removeScheduleInputRow, readScheduleInputRows, moveCalendarMonth, resetCalendarToToday,
  setEditingSchedule, readScheduleEditRow, renderOutfitHistory,
} from './ui/calendar.js';
import { startCamera, stopCamera, takePhoto } from './ui/camera.js';
import {
  openForCreate, openForEdit, readForm, focusName,
  getMode, getEditingId, getPendingImage, clearPendingImage,
} from './ui/item-form.js';
import {
  initPwa, promptInstall, dismissInstall, showIosInstallHelp, reloadForUpdate,
} from './ui/pwa.js';

const SCREENS = [
  'home-screen', 'result-screen', 'closet-screen', 'shop-screen',
  'camera-screen', 'item-form-screen', 'calendar-screen', 'settings-screen',
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
  // 直近に着たものを避けるため、この日数ぶんの記録を見る
  const since = toDateKey(
    new Date(fromDateKey(state.todayKey).getTime() - RECENT_WINDOW_DAYS * 86400000)
  );

  const [items, schedules, recentOutfits] = await Promise.all([
    closetRepo.list(),
    scheduleRepo.listByDate(state.todayKey),
    outfitRepo.listByRange(since, state.todayKey),
  ]);

  return drawOutfit({
    items,
    weather: state.weather,
    schedules,
    recentlyWorn: buildRecentlyWorn(recentOutfits, state.todayKey),
  });
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
  navigateBack();
}

/** 撮影 → 登録フォームへ */
function capturePhoto(origin) {
  const image = takePhoto();
  if (!image) return;
  stopCamera();
  openForCreate(image, { defaultCategory: state.activeTab });
  navigateTo('item-form-screen', { origin });
  focusName();
}

/** フォームを閉じる。新規登録の途中なら撮影し直しに戻る */
function cancelItemForm() {
  clearPendingImage();
  navigateBack();
  if (currentScreen() === 'camera-screen') startCamera();
}

async function saveItemForm() {
  const input = readForm();
  if (!input.name) {
    showToast('アイテム名を入力してください', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
    focusName();
    return;
  }

  const button = $('capture-save-btn');
  const editing = getMode() === 'edit';
  button.disabled = true;
  button.textContent = '保存中...';

  try {
    if (editing) {
      await closetRepo.update(getEditingId(), input);
    } else {
      await closetRepo.add({ ...input, image: getPendingImage() });
      clearPendingImage();
    }

    switchTab(input.category);
    await renderCloset();
    navigateBack();
    // 新規登録はカメラ画面を経由しているので、そこも閉じる
    if (currentScreen() === 'camera-screen') {
      stopCamera();
      navigateBack();
    }
    showToast(editing ? `「${input.name}」を更新しました` : `「${input.name}」を追加しました`);
  } catch (err) {
    console.error('アイテムの保存に失敗しました:', err);
    showToast('保存できませんでした', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
  } finally {
    button.disabled = false;
    button.textContent = '保存する';
  }
}

async function editClosetItem(id, origin) {
  const items = await closetRepo.list();
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  openForEdit(item);
  navigateTo('item-form-screen', { origin });
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
    await Promise.all([renderCalendar(), renderSchedules(), renderOutfitHistory()]);
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
  'take-photo': (el) => capturePhoto(el),
  'cancel-item-form': () => cancelItemForm(),
  'save-item-form': () => saveItemForm(),
  'edit-item': (el) => editClosetItem(el.dataset.id, el),
  'toggle-availability': async (el) => {
    await closetRepo.toggleAvailability(el.dataset.id);
    await renderCloset();
  },
  back: () => navigateBack(),
  'switch-tab': (el) => switchTab(el.dataset.tab),
  'delete-item': (el) => deleteClosetItem(el.dataset.id),
  'change-month': (el) => {
    moveCalendarMonth(parseInt(el.dataset.delta, 10));
    return renderCalendar();
  },
  'select-date': async (el) => {
    state.selectedDateKey = el.dataset.date;
    setEditingSchedule(null);
    resetScheduleInputRows();
    await Promise.all([renderCalendar(), renderSchedules(), renderOutfitHistory()]);
  },
  'add-input-row': () => addScheduleInputRow({ focus: true }),
  'remove-input-row': (el) => removeScheduleInputRow(el.dataset.rowId),
  'add-schedules': () => addSchedules(),
  'edit-schedule': async (el) => {
    setEditingSchedule(el.dataset.id);
    await renderSchedules();
  },
  'cancel-edit-schedule': async () => {
    setEditingSchedule(null);
    await renderSchedules();
  },
  'save-edit-schedule': async (el) => {
    const values = readScheduleEditRow();
    if (!values?.title) {
      showToast('予定の内容を入力してください', { iconName: 'alert-circle', iconColor: 'text-amber-400' });
      return;
    }
    await scheduleRepo.update(el.dataset.id, values);
    setEditingSchedule(null);
    await Promise.all([renderCalendar(), renderSchedules(), refreshHomeWidget()]);
    showToast('予定を更新しました');
  },
  'delete-schedule': async (el) => {
    await scheduleRepo.remove(el.dataset.id);
    setEditingSchedule(null);
    await Promise.all([renderCalendar(), renderSchedules(), refreshHomeWidget()]);
  },
  'open-settings': async (el) => {
    navigateTo('settings-screen', { origin: el });
    await renderSettings();
  },
  'link-account': () => linkAccount(),
  'sign-out-account': () => signOutAccount(),
  'locate-shops': () => locateShops(),
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

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (currentScreen() === 'camera-screen') closeCamera();
      else if (currentScreen() === 'item-form-screen') cancelItemForm();
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

/**
 * 日付が変わったときの処理。
 *
 * 「今日」を見ている表示を全部作り直す。カレンダーの当日強調も
 * ずれるので、開いていれば描き直す。
 */
async function handleDateChange() {
  await refreshHomeWidget();
  if (currentScreen() === 'calendar-screen') {
    await Promise.all([renderCalendar(), renderSchedules(), renderOutfitHistory()]);
  }
  showToast('日付が変わりました', { iconName: 'calendar', iconColor: 'text-rose-300' });
}

/**
 * バックグラウンドから戻ったときの処理。
 * インストールして使うと、アプリは終了せず残り続ける。
 */
async function handleResume() {
  await refreshHomeWidget();
  await refreshWeatherIfStale();
}

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
  initLifecycle({ onDateChange: handleDateChange, onResume: handleResume });

  // 天気はデータ層と独立に取得できるので待たずに始める
  loadWeather(false);

  try {
    const backend = await getBackend();
    if (backend.degradedFrom === 'firebase') {
      showToast('オンライン同期に接続できません。この端末に保存します', {
        iconName: 'wifi-off', iconColor: 'text-amber-400',
      });
    }
    await seedIfNeeded();
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
