import { isValidCoordinate } from '../utils/coordinateUtils.js';

const grid = (point) => `${point[0].toFixed(2)},${point[1].toFixed(2)}`;
const normalizeEmpId = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/\.0+$/, '');
export function inferAttendanceBase(attendance, empId) {
  const wantedId = normalizeEmpId(empId);
  if (!wantedId) return null;
  const samples = (attendance?.records || []).flatMap((record) => {
    if (normalizeEmpId(record.empId) !== wantedId) return [];
    return [
      ['startPoint', record.startPoint],
      ['stopPoint', record.stopPoint],
    ].filter(([, point]) => point && isValidCoordinate(point[0], point[1]))
      .map(([field, point]) => ({ field, point, record }));
  });
  if (!samples.length) return null;
  const groups = new Map();
  samples.forEach((sample) => {
    const key = grid(sample.point);
    const group = groups.get(key) || [];
    group.push(sample);
    groups.set(key, group);
  });
  const ranked = [...groups.values()].sort((a, b) => b.length - a.length);
  const winner = ranked[0];
  const center = [
    winner.reduce((sum, sample) => sum + sample.point[0], 0) / winner.length,
    winner.reduce((sum, sample) => sum + sample.point[1], 0) / winner.length,
  ];
  // Keep the reference on an observed GPS point; the center is only used to
  // choose a representative and must never become a synthetic coordinate.
  const representative = winner.reduce((best, sample) => {
    const distance = (sample.point[0] - center[0]) ** 2 + (sample.point[1] - center[1]) ** 2;
    return !best || distance < best.distance ? { sample, distance } : best;
  }, null).sample;
  const supportingRecords = winner.map(({ field, point, record }) => ({
    recordId: record.id || '',
    dateKey: record.dateKey || '',
    field,
    point: [...point],
  }));
  return {
    point: [...representative.point],
    sourceDate: representative.record.dateKey || '',
    sourceRecordId: representative.record.id || '',
    sourceField: representative.field,
    sourcePoint: [...representative.point],
    observations: samples.length,
    repeatedObservations: winner.length,
    supportingDates: [...new Set(supportingRecords.map((item) => item.dateKey).filter(Boolean))].sort(),
    supportingRecords,
    confidence: winner.length >= 6 ? 'High' : winner.length >= 3 ? 'Medium' : 'Low',
    label: 'Inferred Base',
  };
}
