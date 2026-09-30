import { isValidCoordinate, haversine } from '../utils/coordinateUtils';
import { routePoints } from './routingService';

const idFor = (dealer) => String(dealer.accountCode || `${dealer.companyName}|${dealer.mobile}|${dealer.point?.join(',') || ''}`).toLowerCase();
const key = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parsePlanDate = (value) => { const text = String(value || '').trim(); const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`; const parts = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); return parts ? `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}` : ''; };
const estimatedRoadKm = (points) => points.slice(1).reduce((sum, point, index) => sum + haversine(points[index], point), 0) * 1.35;
export const monthDays = (month, working = [0, 1, 2, 3, 4, 5, 6]) => { const [year, value] = month.split('-').map(Number); const end = new Date(year, value, 0).getDate(); return Array.from({ length: end }, (_, index) => new Date(year, value - 1, index + 1)).filter((date) => working.includes(date.getDay())).map(key); };

export async function createMonthlyPlan(dealers, month, maxVisits, base, workingDays = [0,1,2,3,4,5,6], dailyTravelLimitKm = 100) {
  const dates = monthDays(month, workingDays); const unique = new Map(); dealers.forEach((dealer) => { const id = idFor(dealer); if (!unique.has(id)) unique.set(id, dealer); });
  const all = [...unique.values()]; const valid = all.filter((dealer) => dealer.point && isValidCoordinate(dealer.point[0], dealer.point[1])); const invalid = all.filter((dealer) => !valid.includes(dealer));
  const days = Object.fromEntries(dates.map((date) => [date, { date, visits: [], base, status: 'GENERATED', expectedKm: 0 }])); const cap = Math.max(1, Number(maxVisits) || 20); const limit = Math.max(0, Number(dailyTravelLimitKm) || 100);
  const pending = new Map(valid.map((dealer) => [idFor(dealer), dealer]));
  // Retain explicitly requested dates first, then place other dealers on days with
  // available capacity by repeatedly selecting the nearest feasible stop.
  const pinned = new Map();
  for (const dealer of valid) { const fixed = parsePlanDate(dealer.planDate); if (fixed && days[fixed]) { const list = pinned.get(fixed) || []; list.push(dealer); pinned.set(fixed, list); } }
  for (const date of dates) {
    const day = days[date]; const current = [];
    const choices = [...(pinned.get(date) || []), ...[...pending.values()].filter((dealer) => {
      if (pinned.get(date)?.some((item) => idFor(item) === idFor(dealer))) return false;
      const fixedDate = parsePlanDate(dealer.planDate);
      return !fixedDate || fixedDate <= date;
    })];
    while (current.length < cap && choices.length) {
      const from = current.length ? current.at(-1).point : base?.point;
      const candidates = choices.filter((dealer) => pending.has(idFor(dealer))).sort((a, b) => (from ? haversine(from, a.point) - haversine(from, b.point) : 0) || idFor(a).localeCompare(idFor(b)));
      let picked = null;
      for (const dealer of candidates) {
        const trial = [...current, dealer]; const points = [...(base?.point ? [base.point] : []), ...trial.map((item) => item.point), ...(base?.point ? [base.point] : [])];
        if (estimatedRoadKm(points) <= limit) { picked = dealer; break; }
      }
      if (!picked) break;
      current.push(picked); choices.splice(choices.indexOf(picked), 1); pending.delete(idFor(picked));
    }
    const measureDay = (stops) => stops.length ? routePoints([...(base?.point ? [base.point] : []), ...stops.map((item) => item.point), ...(base?.point ? [base.point] : [])]) : Promise.resolve({ km: 0, source: 'none' });
    let measured = await measureDay(current);
    while (current.length && (!Number.isFinite(measured.km) || measured.km > limit)) {
      const removed = current.pop(); pending.set(idFor(removed), removed);
      measured = await measureDay(current);
    }
    day.expectedKm = Number.isFinite(measured.km) ? measured.km : 0;
    day.visits = current;
  }
  const planned = Object.values(days).flatMap((day) => day.visits); const ids = planned.map(idFor); const duplicates = ids.length - new Set(ids).size;
  return { version: 2, month, maxVisits: cap, dailyTravelLimitKm: limit, workingDays, base, days, invalid, summary: { assigned: all.length, planned: planned.length, invalidGps: invalid.length, unplanned: all.length - planned.length, duplicates, coverage: all.length ? planned.length / all.length * 100 : 0, workingDays: dates.length } };
}
