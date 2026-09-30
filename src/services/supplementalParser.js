import * as XLSX from 'xlsx';

const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const number = (value) => Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;
const text = (value) => String(value ?? '').trim();
const validPoint = (lat, lng) => { const a = Number(lat), b = Number(lng); return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180 && !(a === 0 && b === 0) ? [a, b] : null; };
const employeeIds = (value) => [...String(value || '').matchAll(/\((\d+)\)|\b(\d{2,})\b/g)].map((match) => match[1] || match[2]);
function headerGetter(row) { const keys = Object.keys(row); return (...names) => { const target = names.map(normalize); const key = keys.find((item) => target.includes(normalize(item))); return key ? row[key] : ''; }; }
function dateValue(value) { if (value instanceof Date) return value; if (typeof value === 'number') { const parts = XLSX.SSF.parse_date_code(value); return parts ? new Date(parts.y, parts.m - 1, parts.d, parts.H, parts.M, Math.floor(parts.S)) : null; } const valueText = text(value); const match = valueText.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/); if (match) return new Date(Number(match[3].length === 2 ? `20${match[3]}` : match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0)); const date = new Date(valueText); return Number.isNaN(date.getTime()) ? null : date; }
const dateKey = (date) => date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';

async function rowsFrom(file, expectedSheet) {
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheetName = book.SheetNames.find((name) => normalize(name) === normalize(expectedSheet)) || book.SheetNames.find((name) => normalize(name).includes(normalize(expectedSheet).replace('report', ''))) || book.SheetNames[0];
  if (!sheetName) throw new Error('No worksheet was found in this file.');
  return { sheetName, rows: XLSX.utils.sheet_to_json(book.Sheets[sheetName], { defval: '', raw: true }) };
}

export async function parseAttendance(file) {
  const { sheetName, rows } = await rowsFrom(file, 'Attendance Report');
  const records = rows.map((row, index) => { const get = headerGetter(row); const start = dateValue(get('Start Time')); const stop = dateValue(get('Stop Time')); return { id: `attendance-${index}`, employee: text(get('Name')), empId: text(get('Employee Code')), designation: text(get('Designation')), googleKm: number(get('Google KM')), start, stop, dateKey: dateKey(start || stop), startAddress: text(get('Start Address')), stopAddress: text(get('Stop Address')), startPoint: validPoint(get('Start Latitude', 'Start Lat', 'Latitude'), get('Start Longitude', 'Start Long', 'Longitude')), stopPoint: validPoint(get('Stop Latitude', 'End Latitude', 'Stop Lat'), get('Stop Longitude', 'End Longitude', 'Stop Long')), reportingManager: text(get('Reporting Manager')), zonalManager: text(get('Zonal Manager')), workingTime: text(get('Total Working Time')) }; }).filter((record) => record.empId || record.employee);
  const byEmployeeDate = {}; records.forEach((record) => { const key = `${record.empId}|${record.dateKey}`; (byEmployeeDate[key] ||= []).push(record); });
  return { sheetName, records, byEmployeeDate, stats: { employees: new Set(records.map((record) => record.empId).filter(Boolean)).size, starts: records.filter((record) => record.start).length, stops: records.filter((record) => record.stop).length, missingStops: records.filter((record) => !record.stop).length } };
}

export async function parseDealers(file) {
  const { sheetName, rows } = await rowsFrom(file, 'Direct Dealer Report');
  const dealers = rows.map((row, index) => { const get = headerGetter(row); const assigned = text(get('Assigned Sales Users')); const point = validPoint(get('Latitude'), get('Longitude')); return { id: `dealer-${index}`, companyName: text(get('Company Name')), accountCode: text(get('Account Code', 'Customer Code')), customerName: text(get('Customer Name')), customerType: text(get('Customer Type')), mobile: text(get('Mobile', 'Mobile Number')), state: text(get('State')), city: text(get('City')), district: text(get('District')), pincode: text(get('Pincode')), address: text(get('Address')), assignedSalesUsers: assigned, assignedEmpIds: employeeIds(assigned), channelPartner: text(get('Assigned Channel Partner', 'Channel Partner')), lastOrder: text(get('Last Order')), lastVisit: text(get('Last Visit', 'Last Checkin Date')), planDate: text(get('Plan Date')), beat: text(get('Assigned Beat')), point }; });
  const byEmployeeId = {}, byAccountCode = {}, byCity = {}, byState = {}, byBeat = {};
  const add = (map, key, dealer) => { if (key) (map[key] ||= []).push(dealer); };
  dealers.forEach((dealer) => { dealer.assignedEmpIds.forEach((id) => add(byEmployeeId, id, dealer)); add(byAccountCode, dealer.accountCode, dealer); add(byCity, dealer.city.toLowerCase(), dealer); add(byState, dealer.state.toLowerCase(), dealer); add(byBeat, dealer.beat.toLowerCase(), dealer); });
  return { sheetName, dealers, indexes: { byEmployeeId, byAccountCode, byCity, byState, byBeat }, stats: { total: dealers.length, validGps: dealers.filter((dealer) => dealer.point).length, missingGps: dealers.filter((dealer) => !dealer.point).length, assignedEmployees: Object.keys(byEmployeeId).length, unassigned: dealers.filter((dealer) => !dealer.assignedEmpIds.length).length } };
}
