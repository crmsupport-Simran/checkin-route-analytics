import { haversine, isValidCoordinate } from '../utils/coordinateUtils';

const cache = new Map();
const isPoint = (point) => Array.isArray(point) && isValidCoordinate(point[0], point[1]);
const finiteSegments = (segments, expected) => Array.isArray(segments) && segments.length === expected && segments.every((value) => Number.isFinite(value) && value >= 0);

export async function routePoints(points) {
  if (!Array.isArray(points) || points.some((point) => !isPoint(point))) return { km: null, geometry: [], source: 'invalid', segmentKm: [] };
  if (points.length < 2) return { km: 0, geometry: points, source: 'none', segmentKm: [] };
  const key = points.map((point) => point.join(',')).join(';'); if (cache.has(key)) return cache.get(key);
  try {
    let total = 0; let geometry = []; let segmentKm = [];
    for (let i = 0; i < points.length - 1; i += 49) {
      const chunk = points.slice(i, Math.min(i + 50, points.length));
      // OSRM requires longitude,latitude; application points are latitude,longitude.
      const coords = chunk.map(([lat, lon]) => `${lon},${lat}`).join(';');
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&annotations=distance`);
      if (!response.ok) throw new Error('Routing service unavailable');
      const data = await response.json(); const result = data.routes?.[0]; const segments = (result?.legs || []).map((leg) => leg.distance / 1000);
      if (data.code !== 'Ok' || !result || !Number.isFinite(result.distance) || !finiteSegments(segments, chunk.length - 1)) throw new Error('No valid road route');
      total += result.distance / 1000; geometry.push(...result.geometry.coordinates.map(([lon, lat]) => [lat, lon])); segmentKm.push(...segments);
    }
    if (!Number.isFinite(total) || !finiteSegments(segmentKm, points.length - 1)) throw new Error('Invalid routing result');
    const result = { km: total, geometry, source: 'road', segmentKm }; cache.set(key, result); return result;
  } catch {
    const segmentKm = points.slice(1).map((point, index) => haversine(points[index], point));
    if (!finiteSegments(segmentKm, points.length - 1)) return { km: null, geometry: [], source: 'failed', segmentKm: [] };
    const km = segmentKm.reduce((sum, value) => sum + value, 0); const result = { km, geometry: points, source: 'straight', segmentKm }; cache.set(key, result); return result;
  }
}

// The one source of truth for map, KPI, sequence, cumulative KM, and exports.
export async function calculateRouteMetrics(points) {
  const route = await routePoints(points);
  const segmentDistances = finiteSegments(route.segmentKm, Math.max(0, points.length - 1)) ? route.segmentKm : Array(Math.max(0, points.length - 1)).fill(null);
  let running = 0; const cumulativeDistances = segmentDistances.map((value) => { if (!Number.isFinite(value)) return null; running += value; return running; });
  return { totalRoadKm: route.source === 'road' ? route.km : null, totalKm: Number.isFinite(route.km) ? route.km : null, segmentDistances, cumulativeDistances, routeGeometry: route.geometry, routingStatus: route.source, route };
}
