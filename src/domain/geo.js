/** 地球の半径（km）。距離計算に使う */
const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * 2地点間の直線距離（km）を Haversine 式で求める。
 * 実際の道のりではなく直線距離なので、表示にもその旨を添えること。
 */
export function distanceKm(from, to) {
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  return `${km.toFixed(1)} km`;
}
