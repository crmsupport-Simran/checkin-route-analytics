import { haversine } from '../utils/coordinateUtils';
import { routePoints } from './routingService';

// These are deliberately visible defaults rather than hidden caps. A manager can
// change them in the Tour Plan screen when a territory genuinely covers a wider area.
export const TOUR_DEFAULTS = Object.freeze({
  clusterRadiusKm: 45,
  farKm: 100,
  outlierKm: 250,
  longSegmentKm: 100,
});

const pointIsUsable = (point) => Array.isArray(point) && point.length === 2
  && Number.isFinite(point[0]) && Number.isFinite(point[1])
  && point[0] >= -90 && point[0] <= 90 && point[1] >= -180 && point[1] <= 180
  && !(point[0] === 0 && point[1] === 0);

const averagePoint = (items) => [
  items.reduce((sum, item) => sum + item.point[0], 0) / items.length,
  items.reduce((sum, item) => sum + item.point[1], 0) / items.length,
];

const labelFor = (items, field, fallback) => {
  const counts = new Map();
  items.forEach((item) => { const value = String(item[field] || '').trim(); if (value) counts.set(value, (counts.get(value) || 0) + 1); });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || fallback;
};

const prioritySort = (a, b) => String(a.lastVisit || '9999-12-31').localeCompare(String(b.lastVisit || '9999-12-31'))
  || String(a.companyName || a.customerName || '').localeCompare(String(b.companyName || b.customerName || ''));
const estimatedRoadKm = (points) => points.slice(1).reduce((sum, point, index) => sum + haversine(points[index], point), 0) * 1.35;

export async function buildDailyTour(dealers, maxVisits, supplied = {}) {
  const config = { ...TOUR_DEFAULTS, ...supplied };
  const validDealers = dealers.filter((dealer) => pointIsUsable(dealer.point));
  const invalidDealers = dealers.filter((dealer) => !pointIsUsable(dealer.point));
  if (!validDealers.length) return { visits: [], metrics: { assigned: dealers.length, valid: 0, invalid: invalidDealers.length, outliers: 0, selected: 0, status: 'REVIEW REQUIRED', reason: 'No valid dealer coordinates are available.' }, debug: { validDealers: [], invalidDealers: invalidDealers.map((item) => item.id) } };

  // Find the largest local neighbourhood. This is a deterministic lightweight
  // Haversine clustering pass, not a random sample and not an OSRM call.
  const basePoint = pointIsUsable(supplied.base?.point) ? supplied.base.point : null;
  let cluster = [];
  if (basePoint) {
    // A historical home/hotel base anchors the market for this day. Never switch
    // to a denser but distant dealer cluster simply because it has more accounts.
    cluster = validDealers.filter((dealer) => haversine(basePoint, dealer.point) <= config.clusterRadiusKm);
  } else validDealers.forEach((seed) => {
    const nearby = validDealers.filter((dealer) => haversine(seed.point, dealer.point) <= config.clusterRadiusKm);
    if (nearby.length > cluster.length || (nearby.length === cluster.length && String(seed.id).localeCompare(String(cluster[0]?.id || '')) < 0)) cluster = nearby;
  });
  if (!cluster.length) return { visits: [], candidatePool: [], metrics: { assigned: dealers.length, valid: validDealers.length, invalid: invalidDealers.length, outliers: validDealers.length, selected: 0, unplanned: validDealers.length, status: 'REVIEW REQUIRED', reason: 'No assigned dealer is within the configured cluster radius of the inferred start base.' }, debug: { algorithm: 'base-anchored cluster; no nearby eligible dealers', base: supplied.base, clusterRadiusKm: config.clusterRadiusKm, invalidDealerIds: invalidDealers.map((item) => item.id) } };
  const centroid = averagePoint(cluster);
  const classification = validDealers.map((dealer) => ({ dealer, distanceFromCentroidKm: haversine(centroid, dealer.point) }));
  const outliers = classification.filter((item) => item.distanceFromCentroidKm > config.outlierKm);
  const candidates = cluster.slice().sort(prioritySort);
  // Without an office/home/hotel GPS point, start at the geographic medoid of
  // the selected daily list. It is deterministic and avoids treating whichever
  // row appeared first in Excel as a start location.
  const cap = Math.max(0, Number(maxVisits) || 20);
  const travelLimit = Math.max(0, Number(supplied.dailyTravelLimitKm ?? Infinity));
  const remaining = new Map(candidates.map((dealer) => [dealer.id, dealer]));
  const visits = [];
  let current = basePoint;
  // Greedy nearest eligible selection. Test the complete route including the return leg
  // before committing each stop, and continue checking farther candidates if one fails.
  while (remaining.size && visits.length < cap) {
    const from = current || candidates.slice().sort((a, b) => {
      const aTotal = candidates.reduce((sum, item) => sum + haversine(a.point, item.point), 0);
      const bTotal = candidates.reduce((sum, item) => sum + haversine(b.point, item.point), 0);
      return aTotal - bTotal || String(a.id).localeCompare(String(b.id));
    })[0]?.point;
    const ordered = [...remaining.values()].sort((a, b) => haversine(from, a.point) - haversine(from, b.point) || String(a.id).localeCompare(String(b.id)));
    let chosen = null;
    for (const dealer of ordered) {
      const trial = [...visits, dealer];
      const points = [...(basePoint ? [basePoint] : []), ...trial.map((item) => item.point), ...(basePoint ? [basePoint] : [])];
      if (estimatedRoadKm(points) <= travelLimit) { chosen = dealer; break; }
    }
    if (!chosen) break;
    visits.push(chosen); remaining.delete(chosen.id); current = chosen.point;
  }
  const routePointsFor = (stops) => [...(basePoint ? [basePoint] : []), ...stops.map((item) => item.point), ...(basePoint ? [basePoint] : [])];
  let finalRoute = visits.length ? await routePoints(routePointsFor(visits)) : { km: 0, source: 'none' };
  while (visits.length && (!Number.isFinite(finalRoute.km) || finalRoute.km > travelLimit)) {
    const removed = visits.pop(); remaining.set(removed.id, removed);
    finalRoute = visits.length ? await routePoints(routePointsFor(visits)) : { km: 0, source: 'none' };
  }
  const segments = visits.slice(1).map((dealer, index) => haversine(visits[index].point, dealer.point));
  const orderedWithDistances = visits.map((dealer, index) => ({ ...dealer, distanceFromPreviousKm: index ? segments[index - 1] : null }));
  const maxSegmentKm = Math.max(0, ...segments);
  const medianSegmentKm = segments.length ? [...segments].sort((a, b) => a - b)[Math.floor(segments.length / 2)] : 0;
  const totalHaversineKm = segments.reduce((sum, value) => sum + value, 0);
  const partnerNames = [...new Set(visits.map((dealer) => dealer.channelPartner).filter(Boolean))];
  const status = maxSegmentKm > config.longSegmentKm ? 'REVIEW REQUIRED' : 'COHERENT';
  const reason = visits.length < Math.min(cap, cluster.length) ? `Stopped at ${visits.length} visits because no remaining stop fits the ${supplied.dailyTravelLimitKm} km complete-route limit (including return).` : 'Nearest eligible stops fit the configured complete-route limit.';
  return {
    visits: orderedWithDistances,
    candidatePool: cluster,
    metrics: {
      assigned: dealers.length, valid: validDealers.length, invalid: invalidDealers.length, unplanned: Math.max(0, validDealers.length - visits.length),
      clusterDealers: cluster.length, outliers: outliers.length, selected: orderedWithDistances.length,
      centroid, primaryMarket: labelFor(cluster, 'city', 'Not available'), district: labelFor(cluster, 'district', 'Not available'), state: labelFor(cluster, 'state', 'Not available'),
      channelPartners: partnerNames, totalHaversineKm, averageHaversineKm: orderedWithDistances.length ? totalHaversineKm / orderedWithDistances.length : 0,
      maxSegmentKm, medianSegmentKm, geographicSpreadKm: Math.max(...cluster.map((dealer) => haversine(centroid, dealer.point))), totalRouteKm: finalRoute.km, routingSource: finalRoute.source, status, reason, config,
    },
    debug: {
      algorithm: 'Haversine local-cluster → priority shortlist → central first stop → nearest-neighbour + 2-opt → final OSRM road route',
      centroid, clusterRadiusKm: config.clusterRadiusKm, outlierThresholdKm: config.outlierKm,
      validDealerIds: validDealers.map((dealer) => dealer.id), invalidDealerIds: invalidDealers.map((dealer) => dealer.id),
      outlierIds: outliers.map((item) => item.dealer.id), selected: orderedWithDistances.map((dealer, index) => ({ sequence: index + 1, id: dealer.id, customer: dealer.companyName || dealer.customerName, latitude: dealer.point[0], longitude: dealer.point[1], haversineFromPreviousKm: dealer.distanceFromPreviousKm })),
    },
  };
}
