export const CHECKIN_OUT_COLUMNS = Object.freeze([
  'DATE', 'Month', 'BDO NAME', 'STATE NAME', 'CHECK IN TIME', 'CHECK OUT TIME',
  'TOTAL WORKING TIME', 'COUNTER PLANNED', 'COUNTER VISITED', 'CP VISIT',
  'TOTAL ORDER COUNT', 'SALE', 'REMARKS',
]);

const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const text = (value) => String(value ?? '').trim();
const dayKey = (date) => date instanceof Date && Number.isFinite(date.getTime())
  ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';
const idFor = (record) => text(record.empId) ? `id:${text(record.empId).toLocaleUpperCase().replace(/\s+/g, ' ')}` : '';
const normalizedIdentity = (value) => normalize(value).toLocaleUpperCase();
const isMidnightTime = (value, raw) => Boolean(text(raw)) && ((value instanceof Date && value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0)
  || raw === 0 || /^0?0:00(?::00)?$/.test(text(raw)));
const validTime = (value, raw) => Boolean(text(raw)) && value instanceof Date && Number.isFinite(value.getTime()) && !isMidnightTime(value, raw);
const fmtTime = (date) => date instanceof Date && Number.isFinite(date.getTime())
  ? [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':') : 'SOURCE DATA REQUIRED';
const fmtDate = (key) => {
  if (!key) return 'SOURCE DATA REQUIRED';
  const date = new Date(`${key}T00:00:00`);
  return Number.isFinite(date.getTime()) ? `${String(date.getDate()).padStart(2, '0')}-${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date)}-${String(date.getFullYear()).slice(-2)}` : 'SOURCE DATA REQUIRED';
};
export const formatWorkingTime = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0) return 'SOURCE DATA REQUIRED';
  const seconds = Math.round(minutes * 60);
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
export function getCheckinOutCellAlerts(row) {
  const alerts = new Set();
  if (row.checkInValid && row.checkIn.getHours() * 60 + row.checkIn.getMinutes() > 10 * 60 + 30) alerts.add('checkIn');
  if (row.checkOutValid && row.checkOut.getHours() * 60 + row.checkOut.getMinutes() < 19 * 60 + 30) alerts.add('checkOut');
  if (row.durationValid && row.durationMinutes < 7 * 60) alerts.add('duration');
  if (row.counterVisited != null && row.counterVisited < 8) alerts.add('counterVisited');
  return alerts;
}

const SOURCE_ALIASES = Object.freeze({
  date: ['Date'], employee: ['Sales User Name', 'BDO Name'], empId: ['Emp ID', 'Employee ID'],
  state: ['State Name', 'State'], checkIn: ['Check In', 'Check In Time'], checkOut: ['Check Out', 'Check Out Time'],
  counterPlanned: ['Counter Planned', 'Counters Planned', 'Planned Counters'], type: ['Type'], typeId: ['Type ID'],
  remark: ['Remark', 'Remarks'],
});
export function getCheckinOutSourceCoverage(headers = []) {
  const normalizedHeaders = new Set(headers.map(normalize));
  const present = (names) => names.some((name) => normalizedHeaders.has(normalize(name)));
  return {
    date: present(SOURCE_ALIASES.date), employee: present(SOURCE_ALIASES.employee), empId: present(SOURCE_ALIASES.empId),
    state: present(SOURCE_ALIASES.state), checkIn: present(SOURCE_ALIASES.checkIn), checkOut: present(SOURCE_ALIASES.checkOut),
    counterPlanned: present(SOURCE_ALIASES.counterPlanned), type: present(SOURCE_ALIASES.type), typeId: present(SOURCE_ALIASES.typeId),
    remark: present(SOURCE_ALIASES.remark),
  };
}

const CATEGORY_SETS = Object.freeze({ counters: new Set(['DEALER', 'OTHER', 'OTHERS']), cp: new Set(['CHANNEL PARTNER', 'DIRECT DEALER']) });
function uniqueCategoryCount(records, allowedTypes, coverage) {
  if (!coverage.type || !coverage.typeId) return null;
  const ids = new Set();
  for (const record of records) {
    if (!allowedTypes.has(text(record.type).toUpperCase())) continue;
    const id = text(record.typeId).toLocaleUpperCase();
    if (!id) return null;
    ids.add(id);
  }
  return ids.size;
}
function counterTypeCount(records, coverage) {
  if (!coverage.type) return null;
  return records.filter((record) => CATEGORY_SETS.counters.has(text(record.type).toUpperCase())).length;
}
function attendanceStatus(checkInValid, checkOutValid, durationMinutes, timestampReview) {
  if (!checkInValid || !checkOutValid) return timestampReview ? 'Timestamp review required' : 'Missing / invalid timestamp';
  if (durationMinutes < 0) return 'Invalid duration';
  if (durationMinutes > 18 * 60) return 'Unusual duration';
  return 'Valid';
}

export function buildCheckinOutReportRows(records = [], headers = []) {
  const coverage = getCheckinOutSourceCoverage(headers);
  const groups = new Map();
  for (const record of records) {
    const date = record.dateKey || dayKey(record.date);
    // Keep undated or unidentified source rows individually visible; do not discard them or infer a key.
    const person = idFor(record);
    const key = person && date ? `${person}|${date}` : `source:${record.id ?? record.sourceIndex ?? groups.size}`;
    const group = groups.get(key) || { key, date, identity: person, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const rows = group.records;
    const orderedCheckIns = rows.filter((row) => validTime(row.checkIn, row.checkInRaw)).map((row) => row.checkIn).sort((a, b) => a - b);
    const orderedCheckOuts = rows.filter((row) => validTime(row.checkOut, row.checkOutRaw)).map((row) => row.checkOut).sort((a, b) => a - b);
    const checkIn = orderedCheckIns[0] || rows.find((row) => text(row.checkInRaw) && row.checkIn instanceof Date)?.checkIn || null;
    const checkOut = orderedCheckOuts.at(-1) || rows.find((row) => text(row.checkOutRaw) && row.checkOut instanceof Date)?.checkOut || null;
    const checkInValid = orderedCheckIns.length > 0;
    const checkOutValid = orderedCheckOuts.length > 0;
    const timestampReview = rows.some((row) => isMidnightTime(row.checkIn, row.checkInRaw) || isMidnightTime(row.checkOut, row.checkOutRaw));
    const durationMinutes = checkInValid && checkOutValid ? (checkOut - checkIn) / 60000 : null;
    const durationValid = Number.isFinite(durationMinutes) && durationMinutes >= 0 && durationMinutes <= 18 * 60;
    const counterPlanned = 10;
    const typeRecords = rows.map((row) => ({ type: row.type, typeId: row.typeId }));
    const remarks = [...new Set(rows.map((row) => text(row.remark)).filter(Boolean))];
    const firstName = rows.map((row) => text(row.salesUserName)).find(Boolean) || '';
    const stateNames = [...new Set(rows.map((row) => text(row.stateName)).filter(Boolean))];
    const reportingManagers = [...new Set(rows.map((row) => text(row.reportingManager)).filter(Boolean))];
    const zonalManagers = [...new Set(rows.map((row) => text(row.zonalManager)).filter(Boolean))];
    const month = group.date ? new Date(`${group.date}T00:00:00`).toLocaleString('en-US', { month: 'short' }).toUpperCase() : '';
    const status = attendanceStatus(checkInValid, checkOutValid, durationMinutes, timestampReview);
    return {
      key: group.key, dateKey: group.date, date: fmtDate(group.date), month,
      bdoName: firstName, empId: text(rows.find((row) => text(row.empId))?.empId), employeeKey: group.identity || (firstName ? `name:${normalize(firstName)}` : `source:${group.key}`),
      stateName: stateNames.length === 1 ? stateNames[0] : stateNames.join(', ') || null,
      reportingManager: reportingManagers.join(', ') || null, zonalManager: zonalManagers.join(', ') || null,
      checkIn, checkOut, checkInValid, checkOutValid, timestampReview, durationMinutes, durationValid, status,
      counterPlanned,
      counterVisited: counterTypeCount(typeRecords, coverage),
      cpVisit: uniqueCategoryCount(typeRecords, CATEGORY_SETS.cp, coverage),
      orderCount: null, sale: null,
      remarks: remarks.join(' · '), sourceRecordCount: rows.length,
    };
  }).sort((a, b) => (a.dateKey || '').localeCompare(b.dateKey || '') || a.bdoName.localeCompare(b.bdoName));
}

export function attachSecondaryOrders(rows = [], parsed = null) {
  if (!parsed?.records?.length) return { rows, stats: null };
  const validDates = parsed.records.map((record) => record.dateKey).filter(Boolean).sort();
  const stats = { sourceRows: parsed.records.length, uniqueOrders: 0, matchedOrders: 0, unmatchedOrders: 0, skippedNoOrderId: 0, skippedNoDate: 0, skippedNoEmployee: 0, missingAmounts: 0, minDate: validDates[0] || '', maxDate: validDates.at(-1) || '' };
  const byEmployeeDay = new Map();
  rows.forEach((row, index) => {
    if (!row.dateKey) return;
    const identity = row.empId ? `id:${normalizedIdentity(row.empId)}` : row.bdoName ? `name:${normalizedIdentity(row.bdoName)}` : '';
    if (identity) byEmployeeDay.set(`${identity}|${row.dateKey}`, index);
  });
  const enriched = rows.map((row) => row.dateKey && stats.minDate && row.dateKey >= stats.minDate && row.dateKey <= stats.maxDate
    ? { ...row, orderCount: 0, sale: 0 } : row);
  const seen = new Set();
  for (const record of parsed.records) {
    if (!record.orderId) { stats.skippedNoOrderId++; continue; }
    if (!record.dateKey) { stats.skippedNoDate++; continue; }
    const identity = record.empId ? `id:${normalizedIdentity(record.empId)}` : record.salesUserName ? `name:${normalizedIdentity(record.salesUserName)}` : '';
    if (!identity) { stats.skippedNoEmployee++; continue; }
    const key = normalizedIdentity(record.orderId);
    if (seen.has(key)) continue;
    seen.add(key); stats.uniqueOrders++;
    const rowIndex = byEmployeeDay.get(`${identity}|${record.dateKey}`);
    if (rowIndex == null) { stats.unmatchedOrders++; continue; }
    const row = enriched[rowIndex];
    row.orderCount += 1; stats.matchedOrders++;
    if (record.basicAmount == null) { row.sale = null; stats.missingAmounts++; }
    else if (row.sale != null) row.sale += record.basicAmount;
  }
  return { rows: enriched, stats };
}

export function filterCheckinOutRows(rows = [], filters = {}) {
  return rows.filter((row) => {
    if (filters.month && filters.month !== 'all' && row.dateKey?.slice(0, 7) !== filters.month) return false;
    if (filters.startDate && (!row.dateKey || row.dateKey < filters.startDate)) return false;
    if (filters.endDate && (!row.dateKey || row.dateKey > filters.endDate)) return false;
    if (filters.bdo && row.bdoName !== filters.bdo) return false;
    if (filters.state && row.stateName !== filters.state) return false;
    if (filters.reportingManager && row.reportingManager !== filters.reportingManager) return false;
    if (filters.zonalManager && row.zonalManager !== filters.zonalManager) return false;
    if (filters.status && row.status !== filters.status) return false;
    const query = normalize(filters.exception);
    if (query && !normalize(`${row.remarks} ${row.status}`).includes(query)) return false;
    return true;
  });
}

export function summarizeCheckinOutRows(rows = [], coverage = {}, secondaryOrdersLoaded = false) {
  const identitySet = new Set(rows.map((row) => row.employeeKey).filter((key) => key && !key.startsWith('source:')));
  const validWorkingRows = rows.filter((row) => row.durationValid);
  const totalWorkingMinutes = validWorkingRows.reduce((sum, row) => sum + row.durationMinutes, 0);
  const plannedComplete = true;
  const countersComplete = coverage.type && rows.every((row) => row.counterVisited != null);
  const cpComplete = coverage.type && coverage.typeId && rows.every((row) => row.cpVisit != null);
  const planned = rows.reduce((sum, row) => sum + row.counterPlanned, 0);
  const visited = countersComplete ? rows.reduce((sum, row) => sum + row.counterVisited, 0) : null;
  return {
    uniqueBdos: identitySet.size, employeeDayRecords: rows.length,
    validCheckIns: rows.filter((row) => row.checkInValid).length,
    validCheckOuts: rows.filter((row) => row.checkOutValid).length,
    totalWorkingMinutes: validWorkingRows.length ? totalWorkingMinutes : null, averageWorkingMinutes: validWorkingRows.length ? totalWorkingMinutes / validWorkingRows.length : null,
    validWorkingRecords: validWorkingRows.length,
    totalCountersPlanned: planned,
    totalCountersVisited: countersComplete ? visited : null,
    counterAchievement: plannedComplete && countersComplete && planned > 0 ? (visited / planned) * 100 : null,
    totalCpVisits: cpComplete ? rows.reduce((sum, row) => sum + row.cpVisit, 0) : null,
    missingAttendance: rows.filter((row) => !row.checkInValid || !row.checkOutValid || !row.durationValid).length,
    totalOrderCount: secondaryOrdersLoaded && rows.every((row) => row.orderCount != null) ? rows.reduce((sum, row) => sum + row.orderCount, 0) : null,
    totalSales: secondaryOrdersLoaded && rows.every((row) => row.sale != null) ? rows.reduce((sum, row) => sum + row.sale, 0) : null,
    ordersPending: !secondaryOrdersLoaded || rows.some((row) => row.orderCount == null),
    salesPending: !secondaryOrdersLoaded || rows.some((row) => row.sale == null),
  };
}

export function getCheckinOutExportRows(rows = []) {
  const data = rows.map((row) => [
    row.date, row.month, row.bdoName || 'SOURCE DATA REQUIRED', row.stateName || 'SOURCE DATA REQUIRED',
    fmtTime(row.checkIn), fmtTime(row.checkOut), Number.isFinite(row.durationMinutes) ? (row.durationMinutes < 0 ? 'INVALID DURATION' : formatWorkingTime(row.durationMinutes)) : 'SOURCE DATA REQUIRED',
    row.counterPlanned ?? 'SOURCE DATA REQUIRED', row.counterVisited ?? 'SOURCE DATA REQUIRED', row.cpVisit ?? 'SOURCE DATA REQUIRED',
    row.orderCount ?? 'PENDING SOURCE DATA', row.sale == null ? 'PENDING SOURCE DATA' : row.sale, row.remarks,
  ]);
  return [CHECKIN_OUT_COLUMNS, ...data];
}
