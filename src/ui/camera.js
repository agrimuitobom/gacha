import { $ } from './dom.js';
import { setIcon } from './icons.js';
import { state } from '../state.js';

/**
 * 保存する画像の上限。
 *
 * 画面に出る最大サイズはクローゼットのカードで 150 CSS px。
 * DPR 3 の端末でも 450px、DPR 4 でも 600px あれば足りるので、
 * 640px あれば拡大表示しても粗くならない。
 * これ以上大きくしても見た目は変わらず、保存容量と通信量だけが増える。
 */
const MAX_IMAGE_SIZE = 640;
const IMAGE_QUALITY = 0.8;
/** フラッシュ演出：白く光らせてからフェードアウトを始めるまでの間 */
const FLASH_HOLD_MS = 50;

let currentStream = null;

export function showCameraError(message) {
  $('camera-error-text').textContent = message;
  $('camera-error').classList.remove('hidden');
  $('camera-error').classList.add('flex');
  $('camera-guide').classList.add('hidden');
  $('camera-shutter-bar').classList.add('hidden');
  setIcon($('camera-error-icon'), 'camera-off', 'w-10 h-10');
}

export function hideCameraError() {
  $('camera-error').classList.add('hidden');
  $('camera-error').classList.remove('flex');
  $('camera-guide').classList.remove('hidden');
  $('camera-shutter-bar').classList.remove('hidden');
}

export async function startCamera() {
  hideCameraError();
  hideCaptureForm();

  if (!navigator.mediaDevices?.getUserMedia) {
    showCameraError('この環境ではカメラを利用できません。https:// または localhost で開いているかご確認ください。');
    return;
  }

  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    $('camera-video').srcObject = currentStream;
  } catch (err) {
    console.error('カメラの起動に失敗しました:', err);
    // 以前は console だけで、ユーザーには真っ黒な画面しか見えなかった
    const messages = {
      NotAllowedError: 'カメラの使用が許可されていません。ブラウザの設定でカメラを許可してください。',
      NotFoundError: '利用できるカメラが見つかりませんでした。',
      NotReadableError: '他のアプリがカメラを使用中の可能性があります。',
      OverconstrainedError: '対応するカメラが見つかりませんでした。',
    };
    showCameraError(messages[err.name] || `カメラを起動できませんでした（${err.name || 'エラー'}）`);
  }
}

export function stopCamera() {
  if (!currentStream) return;
  currentStream.getTracks().forEach((track) => track.stop());
  currentStream = null;
  $('camera-video').srcObject = null;
}

export function isCameraActive() {
  return Boolean(currentStream);
}

function flashCamera() {
  const flash = $('camera-flash');
  flash.style.transition = 'none';
  flash.classList.replace('opacity-0', 'opacity-100');
  setTimeout(() => {
    flash.style.transition = 'opacity 0.3s ease-out';
    flash.classList.replace('opacity-100', 'opacity-0');
  }, FLASH_HOLD_MS);
}

let cachedFormat = null;

/**
 * 保存形式を決める。
 *
 * 同じ見た目なら WebP のほうが小さい（写真によるが2〜3割）。
 * ただし canvas での WebP 書き出しは Safari 16.4 未満が非対応で、
 * その場合 toDataURL は黙って PNG を返す（JPEGより桁違いに大きい）。
 * 返ってきた形式を確かめて、駄目なら JPEG に落とす。
 */
function pickImageFormat() {
  if (cachedFormat) return cachedFormat;
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const encoded = probe.toDataURL('image/webp', IMAGE_QUALITY);
  cachedFormat = encoded.startsWith('data:image/webp')
    ? { contentType: 'image/webp', extension: 'webp' }
    : { contentType: 'image/jpeg', extension: 'jpg' };
  return cachedFormat;
}

function captureResizedImage(video) {
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(width, height));

  const canvas = $('camera-canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  const format = pickImageFormat();
  return { dataUrl: canvas.toDataURL(format.contentType, IMAGE_QUALITY), ...format };
}

export function showCaptureForm(image) {
  $('capture-preview').src = image.dataUrl;
  $('capture-name').value = '';
  $('capture-category').value = state.activeTab;
  $('capture-warmth').value = '3';
  $('capture-formality').value = '1';
  $('capture-rainsafe').checked = true;

  const form = $('capture-form');
  form.classList.remove('hidden');
  form.classList.add('flex');
  form.removeAttribute('inert');
  $('capture-name').focus();
}

export function hideCaptureForm() {
  const form = $('capture-form');
  form.classList.add('hidden');
  form.classList.remove('flex');
  form.setAttribute('inert', '');
}

export function takePhoto() {
  if (!currentStream) return false;
  flashCamera();
  state.pendingPhoto = captureResizedImage($('camera-video'));
  showCaptureForm(state.pendingPhoto);
  return true;
}

export function readCaptureForm() {
  return {
    name: $('capture-name').value.trim(),
    category: $('capture-category').value,
    warmth: parseInt($('capture-warmth').value, 10),
    formality: parseInt($('capture-formality').value, 10),
    rainSafe: $('capture-rainsafe').checked,
  };
}
