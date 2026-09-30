import { isValidCoordinate } from '../utils/coordinateUtils';

const grid = (point) => `${point[0].toFixed(2)},${point[1].toFixed(2)}`;
export function inferAttendanceBase(attendance, empId) {
  const samples = (attendance?.records || []).flatMap((record) => record.empId === empId ? [record.startPoint, record.stopPoint].filter((point) => point && isValidCoordinate(point[0], point[1])) : []);
  if (!samples.length) return null;
  const groups = new Map(); samples.forEach((point) => { const key = grid(point); const group = groups.get(key) || []; group.push(point); groups.set(key, group); });
  const ranked = [...groups.values()].sort((a, b) => b.length - a.length); const winner = ranked[0]; const point = [winner.reduce((sum, item) => sum + item[0], 0) / winner.length, winner.reduce((sum, item) => sum + item[1], 0) / winner.length];
  return { point, observations: samples.length, repeatedObservations: winner.length, confidence: winner.length >= 6 ? 'High' : winner.length >= 3 ? 'Medium' : 'Low', label: 'Inferred Base' };
}
