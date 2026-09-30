export const INTEGRITY_TYPES = ['Builder/Architect', 'Channel Partner', 'Direct Dealer', 'Dealer', 'Others', 'Office'];

export function normalizeType(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (key.includes('builder') || key.includes('architect')) return 'Builder/Architect';
  if (key.includes('channel') || key.includes('partner')) return 'Channel Partner';
  if (key.includes('direct') && key.includes('dealer')) return 'Direct Dealer';
  if (key === 'dealer' || key.endsWith('dealer')) return 'Dealer';
  if (key.includes('office')) return 'Office';
  return 'Others';
}

export const statusFor = (count) => count >= 6 ? 'Very High Duplicate Activity' : count >= 4 ? 'High Duplicate Activity' : count >= 2 ? 'Duplicate Check-in' : 'Normal Check-in';
const clean = (value, fallback) => String(value || fallback).trim().replace(/\s+/g, ' ');

// One O(n) pass builds the groups; all views and filters reuse these immutable results.
export function analyzeIntegrity(records) {
  const groupsByKey = new Map();
  records.forEach((record) => {
    const date = record.dateKey || 'Invalid date';
    const empId = clean(record.empId, 'Blank Emp ID');
    const location = clean(record.checkInLocation || record.companyName || record.dealerChannelPartner, 'Blank Location');
    const type = normalizeType(record.type);
    const key = [date, empId.toLowerCase(), location.toLowerCase(), type].join('|');
    const group = groupsByKey.get(key) || { key, date, empId, employee: clean(record.salesUserName, 'Unnamed employee'), location, type, records: [] };
    group.records.push(record); groupsByKey.set(key, group);
  });
  const groups = [...groupsByKey.values()].map((group) => {
    const count = group.records.length;
    const times = group.records.map((record) => record.checkIn).filter((value) => value instanceof Date && !Number.isNaN(value.getTime())).sort((a, b) => a - b);
    return { ...group, count, status: statusFor(count), verificationRequired: count > 1, firstCheckIn: times[0] || null, lastCheckIn: times.at(-1) || null };
  }).sort((a, b) => b.count - a.count || a.employee.localeCompare(b.employee));
  const typeStats = INTEGRITY_TYPES.map((type) => {
    const typeGroups = groups.filter((group) => group.type === type);
    const total = typeGroups.reduce((sum, group) => sum + group.count, 0);
    const duplicateGroups = typeGroups.filter((group) => group.count > 1);
    const duplicateRecords = duplicateGroups.reduce((sum, group) => sum + group.count, 0);
    return { type, total, employees: new Set(typeGroups.map((group) => group.empId)).size, locations: new Set(typeGroups.map((group) => group.location.toLowerCase())).size, single: typeGroups.filter((group) => group.count === 1).length, duplicateGroups: duplicateGroups.length, duplicateRecords, totalDuplicates: duplicateRecords - duplicateGroups.length, maximum: Math.max(0, ...typeGroups.map((group) => group.count)) };
  });
  return { groups, typeStats, duplicateGroups: groups.filter((group) => group.count > 1) };
}
