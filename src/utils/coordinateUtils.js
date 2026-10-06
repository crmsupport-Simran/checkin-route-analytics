const numericCoordinate = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
export function isValidCoordinate(lat, lon) {
  const latitude = numericCoordinate(lat), longitude = numericCoordinate(lon);
  return latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && !(latitude === 0 && longitude === 0);
}
export function coordinate(lat, lon) { return isValidCoordinate(lat, lon) ? [Number(lat), Number(lon)] : null; }
export function haversine(a, b) { if (!a || !b || !isValidCoordinate(a[0], a[1]) || !isValidCoordinate(b[0], b[1])) return null; const rad = Math.PI / 180, R = 6371; const dLat=(b[0]-a[0])*rad, dLon=(b[1]-a[1])*rad; const x=Math.sin(dLat/2)**2 + Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dLon/2)**2; const value = 2*R*Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1-x))); return Number.isFinite(value) ? value : null; }
