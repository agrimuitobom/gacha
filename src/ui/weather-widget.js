import { $ } from './dom.js';
import { setIcon } from './icons.js';
import { state } from '../state.js';
import { DEFAULT_LOCATION, fetchWeather, getCurrentPosition, reverseGeocode } from '../domain/weather.js';

export function renderWeather() {
  const tempEl = $('weather-temp');
  const descEl = $('weather-desc');
  const iconEl = $('weather-icon-container');

  if (!state.weather) {
    tempEl.textContent = '--°';
    descEl.textContent = state.weatherError || '天気取得中...';
    // className を丸ごと上書きすると shrink-0 が消えてレイアウトが崩れるため両方指定する
    iconEl.className = 'shrink-0 text-gray-500';
    setIcon(iconEl, state.weatherError ? 'cloud-off' : 'cloud', 'w-6 h-6');
    return;
  }

  const { temp, text, icon: iconName, color, pop, locationName } = state.weather;
  tempEl.textContent = `${temp}°`;
  descEl.textContent =
    pop === null ? `${locationName}: ${text}` : `${locationName}: ${text} / 降水 ${pop}%`;
  iconEl.className = `shrink-0 ${color}`;
  setIcon(iconEl, iconName, 'w-6 h-6');
}

/**
 * 天気を読み込む。
 * @param {boolean} useCurrentLocation 現在地を使うか。
 *   起動時の自動取得では false。理由なく位置情報ダイアログを出さないため。
 */
export async function loadWeather(useCurrentLocation = false) {
  let location = DEFAULT_LOCATION;

  if (useCurrentLocation) {
    $('weather-desc').textContent = '位置情報を確認中...';
    try {
      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;
      location = { lat: latitude, lon: longitude, name: await reverseGeocode(latitude, longitude) };
    } catch (err) {
      console.warn('位置情報が取得できないため既定地点を使用します:', err.message);
    }
  }

  $('weather-desc').textContent = `${location.name}: 取得中...`;

  try {
    state.weather = await fetchWeather(location.lat, location.lon, location.name);
    state.weatherError = null;
  } catch (err) {
    // 取得に失敗したときに架空の気温を表示しない。
    // 誤ったコーデ提案の直接の原因になるため、失敗は失敗として扱う。
    console.error('天気データの取得に失敗しました:', err);
    state.weather = null;
    state.weatherError = navigator.onLine ? '天気を取得できません' : 'オフラインです';
  }

  renderWeather();
}
