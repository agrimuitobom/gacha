import { toDateKey } from './dates.js';

export const DEFAULT_LOCATION = { lat: 33.9189, lon: 133.1818, name: '西条市' }; // 愛媛県西条市

export function parseWmoWeatherCode(code) {
  if (code === 0) return { text: '晴れ', icon: 'sun', color: 'text-orange-500' };
  if (code >= 1 && code <= 3) return { text: '晴れ時々曇り', icon: 'cloud-sun', color: 'text-amber-600' };
  if (code === 45 || code === 48) return { text: '霧', icon: 'cloud-fog', color: 'text-slate-500' };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { text: '雨', icon: 'cloud-rain', color: 'text-blue-600' };
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return { text: '雪', icon: 'snowflake', color: 'text-cyan-600' };
  if (code >= 95) return { text: '雷雨', icon: 'cloud-lightning', color: 'text-purple-600' };
  return { text: '曇り', icon: 'cloud', color: 'text-gray-600' };
}

/** 現在時刻に対応する降水確率を hourly.time と突き合わせて取り出す */
export function pickPrecipitationProbability(data) {
  const hourly = data.hourly;
  if (!hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly.precipitation_probability)) {
    return null;
  }

  const currentTime = data.current_weather?.time;
  let index = currentTime ? hourly.time.indexOf(currentTime) : -1;

  if (index === -1) {
    const now = new Date();
    const key = `${toDateKey(now)}T${String(now.getHours()).padStart(2, '0')}:00`;
    index = hourly.time.indexOf(key);
  }
  if (index === -1) return null;

  // 0% は正当な値なので ?? を使う（|| だと 0 が握り潰される）
  return hourly.precipitation_probability[index] ?? null;
}

/**
 * 天気を取得する。
 * 失敗時は例外を投げる。架空の値を返して「取得できたふり」をしない
 * （誤ったコーデ提案の直接の原因になるため）。
 */
export async function fetchWeather(lat, lon, locationName, { fetchImpl = fetch } = {}) {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
    '&current_weather=true&hourly=precipitation_probability&timezone=auto';

  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`天気APIが ${response.status} を返しました`);

  const data = await response.json();
  if (!data?.current_weather) throw new Error('天気APIのレスポンスが不正です');

  const info = parseWmoWeatherCode(data.current_weather.weathercode);
  return {
    temp: Math.round(data.current_weather.temperature),
    code: data.current_weather.weathercode,
    text: info.text,
    icon: info.icon,
    color: info.color,
    pop: pickPrecipitationProbability(data),
    locationName,
  };
}

export async function reverseGeocode(lat, lon) {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ja`
    );
    if (!response.ok) return '現在地';
    const data = await response.json();
    return data.city || data.locality || data.principalSubdivision || '現在地';
  } catch {
    return '現在地';
  }
}

/** 現在地を取得する（ユーザー操作起点でのみ呼ぶこと） */
export function getCurrentPosition(options = { timeout: 8000, maximumAge: 10 * 60 * 1000 }) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('geolocation is unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}
