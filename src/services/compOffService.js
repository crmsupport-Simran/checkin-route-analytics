export const COMP_OFF_RECORDS_STORAGE_KEY = 'checkin-route-analytics-comp-off-records-v1';
export const COMP_OFF_HOLIDAYS_STORAGE_KEY = 'checkin-route-analytics-comp-off-holidays-v1';

const clean = (value) => String(value ?? '').trim();
const normalize = (value) => clean(value).replace(/\s+/g, ' ').toLocaleUpperCase();
const identityFor = (empId, name) => clean(empId)
  ? `ID:${normalize(empId)}`
  : clean(name) ? `NAME:${normalize(name)}` : '';
const validDate = (value) => value instanceof Date && Number.isFinite(value.getTime());
const keyFor = (identity, dateKey) => `${identity}|${dateKey}`;

export function readCompOffRecords(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(COMP_OFF_RECORDS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveCompOffRecords(records, storage = globalThis.localStorage) {
  try { storage?.setItem(COMP_OFF_RECORDS_STORAGE_KEY, JSON.stringify(records)); } catch { /* Report remains usable when browser storage is unavailable. */ }
}

export function readCompOffHolidays(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(COMP_OFF_HOLIDAYS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? [...new Set(parsed.map(clean).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort() : [];
  } catch { return []; }
}

export function saveCompOffHolidays(dates, storage = globalThis.localStorage) {
  const cleaned = [...new Set(dates.map(clean).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
  try { storage?.setItem(COMP_OFF_HOLIDAYS_STORAGE_KEY, JSON.stringify(cleaned)); } catch { /* Custom dates remain active for the current view. */ }
  return cleaned;
}

export function defaultNationalHolidayDates(years) {
  const dates = [];
  for (const year of years) {
    for (const date of [`${year}-01-26`, `${year}-08-15`, `${year}-10-02`]) dates.push(date);
    if (Number(year) === 2026) dates.push(
      '2026-02-15', '2026-03-04', '2026-05-01', '2026-08-28',
      '2026-09-04', '2026-10-20', '2026-11-08', '2026-11-09', '2026-11-11',
    );
  }
  return [...new Set(dates)].sort();
}

function dateKeyOf(value) {
  if (!validDate(value)) return '';
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function hasValidCheckIn(record) {
  const raw = record.checkInRaw;
  if (raw === '' || raw == null || (typeof raw === 'string' && !raw.trim())) return false;
  if (typeof raw === 'number') return raw >= 0 && raw < 1;
  if (validDate(raw)) return true;
  const value = String(raw).trim();
  return value === '0' || /^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\s*(?:AM|PM)?$/i.test(value)
    || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}[ T](?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?/i.test(value);
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

function formatDateTime(value) {
  return validDate(value) ? value.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

function dayLabel(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function createCandidates(report, attendance, holidayDates) {
  const candidates = new Map();
  const aliasesByName = new Map();
  const ensure = (identity, dateKey, details) => {
    if (!identity || !dateKey) return null;
    const key = keyFor(identity, dateKey);
    const nameAlias = details.name ? keyFor(`NAME:${normalize(details.name)}`, dateKey) : '';
    let candidate = candidates.get(key);
    if (!candidate && nameAlias) {
      const named = aliasesByName.get(nameAlias);
      if (named && (!named.empId || !details.empId || normalize(named.empId) === normalize(details.empId))) candidate = named;
    }
    if (!candidate) {
      candidate = { key, identity, dateKey, name: '', empId: '', checkins: [], attendanceRows: [] };
      candidates.set(key, candidate);
    }
    if (details.empId && !candidate.empId) {
      candidates.delete(candidate.key);
      candidate.empId = details.empId;
      candidate.identity = `ID:${normalize(details.empId)}`;
      candidate.key = keyFor(candidate.identity, dateKey);
      candidates.set(candidate.key, candidate);
    }
    candidate.name ||= details.name || '';
    candidate.empId ||= details.empId || '';
    candidates.set(candidate.key, candidate);
    if (nameAlias) {
      if (!aliasesByName.has(nameAlias)) aliasesByName.set(nameAlias, candidate);
      else if (aliasesByName.get(nameAlias) !== candidate && aliasesByName.get(nameAlias)?.empId && candidate.empId && normalize(aliasesByName.get(nameAlias).empId) !== normalize(candidate.empId)) aliasesByName.set(nameAlias, null);
    }
    return candidate;
  };

  for (const row of report?.records || []) {
    const dateKey = row.dateKey || dateKeyOf(row.date);
    const identity = identityFor(row.empId, row.salesUserName);
    if (!identity) continue;
    const candidate = ensure(identity, dateKey, { name: row.salesUserName, empId: row.empId });
    if (candidate) candidate.checkins.push(row);
  }
  for (const row of attendance?.records || []) {
    const dateKey = row.dateKey || dateKeyOf(row.start || row.stop);
    const identity = identityFor(row.empId, row.employee);
    if (!identity) continue;
    const candidate = ensure(identity, dateKey, { name: row.employee, empId: row.empId });
    if (candidate) candidate.attendanceRows.push(row);
  }

  const holidaySet = new Set(holidayDates);
  return [...new Set(candidates.values())].flatMap((candidate) => {
    const [year, month, day] = candidate.dateKey.split('-').map(Number);
    if (!year || !month || !day) return [];
    const weekday = new Date(year, month - 1, day).getDay();
    const isSunday = weekday === 0;
    const isNationalHoliday = holidaySet.has(candidate.dateKey);
    if (!isSunday && !isNationalHoliday) return [];

    const validCheckins = candidate.checkins.filter(hasValidCheckIn);
    const sourceAttendanceStatus = candidate.attendanceRows
      .map((row) => normalize(row.status))
      .find((status) => status === 'P' || status === 'WO') || '';
    const timeRows = candidate.attendanceRows.filter((row) => validDate(row.start) || validDate(row.stop));
    const firstStart = timeRows.map((row) => row.start).filter(validDate).sort((a, b) => a - b)[0] || null;
    const lastStop = timeRows.map((row) => row.stop).filter(validDate).sort((a, b) => a - b).at(-1) || null;
    let travelMinutes = firstStart && lastStop ? Math.round((lastStop - firstStart) / 60000) : null;
    if (travelMinutes != null && travelMinutes < 0) travelMinutes = null;
    const travelDuration = formatDuration(travelMinutes);
    const startHour = firstStart?.getHours();
    const stopDateKey = lastStop ? dateKeyOf(lastStop) : '';
    const reachedNextDayBeforeNoon = Boolean(lastStop && stopDateKey > candidate.dateKey && (lastStop.getHours() < 12 || (lastStop.getHours() === 12 && lastStop.getMinutes() === 0)));
    const nightTravel = firstStart && startHour >= 21 && reachedNextDayBeforeNoon;
    const eveningStop = lastStop && lastStop.getHours() >= 17;

    let attendanceStatus;
    let eligibility;
    let policyNote;
    if (validCheckins.length) {
      attendanceStatus = 'P';
      eligibility = 'ELIGIBLE';
      policyNote = `Valid Check-In recorded (${validCheckins.length} row${validCheckins.length === 1 ? '' : 's'}).`;
    } else if (nightTravel) {
      attendanceStatus = 'REVIEW REQUIRED';
      eligibility = 'REVIEW';
      policyNote = 'Night departure at or after 9:00 PM ends by noon next day. Do not mark Present; confirm travel was towards home to apply Leave under policy.';
    } else if (eveningStop) {
      attendanceStatus = 'LEAVE / NOT PRESENT';
      eligibility = 'NOT ELIGIBLE';
      policyNote = 'No Check-In and travel Stop Time is in the evening; day treated as Leave.';
    } else if (travelMinutes != null && travelMinutes < 240) {
      attendanceStatus = 'REVIEW REQUIRED';
      eligibility = 'REVIEW';
      policyNote = 'Travel is under 4 hours. If this is travel home, retain Week Off / National Holiday and do not grant Comp-Off; home destination is not provided in the uploaded reports.';
    } else {
      attendanceStatus = 'REVIEW REQUIRED';
      eligibility = 'REVIEW';
      policyNote = 'No valid Check-In; available travel details do not establish an automatic Present decision.';
    }

    if (sourceAttendanceStatus === 'WO') {
      attendanceStatus = 'WO';
      eligibility = 'NOT ELIGIBLE';
      policyNote = 'Attendance Report marks this date WO; no Comp-Off is granted.';
    } else if (sourceAttendanceStatus === 'P') {
      attendanceStatus = 'P';
      if (!validCheckins.length) policyNote = `Attendance Report marks this date P. ${policyNote} No qualifying Check-In was found, so Comp-Off is not automatically granted.`;
    }

    const dayTypes = [isSunday && 'Sunday', isNationalHoliday && 'National Holiday'].filter(Boolean);
    return [{
      key: candidate.key,
      employeeName: candidate.name,
      employeeCode: candidate.empId,
      workingDate: candidate.dateKey,
      workingDateLabel: dayLabel(candidate.dateKey),
      dayType: dayTypes.join(' + '),
      checkInStatus: validCheckins.length ? 'Available' : 'No valid Check-In',
      attendanceStatus,
      travelStart: formatDateTime(firstStart),
      travelStop: formatDateTime(lastStop),
      travelDuration,
      compOffEligibility: eligibility,
      policyNote,
      checkInRows: validCheckins.map((row) => row.sourceIndex ?? row.id),
      attendanceRows: candidate.attendanceRows.map((row) => row.id),
      compOffStatus: eligibility === 'ELIGIBLE' ? 'Pending' : '—',
    }];
  }).sort((a, b) => a.workingDate.localeCompare(b.workingDate) || a.employeeName.localeCompare(b.employeeName));
}

export function generateCompOffCandidates(report, attendance, customHolidayDates = []) {
  const years = new Set();
  for (const row of report?.records || []) if (row.dateKey) years.add(Number(row.dateKey.slice(0, 4)));
  for (const row of attendance?.records || []) if (row.dateKey) years.add(Number(row.dateKey.slice(0, 4)));
  const holidays = new Set([...defaultNationalHolidayDates(years), ...customHolidayDates]);
  return createCandidates(report, attendance, [...holidays]);
}

export function mergeCompOffRecords(existing, generated) {
  const merged = new Map((existing || []).filter((row) => row?.key).map((row) => [row.key, row]));
  for (const candidate of generated) {
    const prior = merged.get(candidate.key);
    merged.set(candidate.key, {
      ...prior,
      ...candidate,
      compOffStatus: candidate.compOffEligibility === 'ELIGIBLE'
        ? (['Pending', 'Availed', 'Expired'].includes(prior?.compOffStatus) ? prior.compOffStatus : 'Pending')
        : '—',
      recordedAt: prior?.recordedAt || new Date().toISOString(),
    });
  }
  return [...merged.values()].sort((a, b) => a.workingDate.localeCompare(b.workingDate) || String(a.employeeName).localeCompare(String(b.employeeName)));
}
