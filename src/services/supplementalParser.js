import * as XLSX from 'xlsx';

const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const number = (value) => Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;
const text = (value) => String(value ?? '').trim();
const validPoint = (lat, lng) => { const a = Number(lat), b = Number(lng); return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180 && !(a === 0 && b === 0) ? [a, b] : null; };
const employeeAssignments = (value) => [...String(value || '').matchAll(/([^,;]+?)\s*\(\s*(?:app\s*)?(\d+)\s*\)/gi)].map((match) => ({ id: match[2], name: text(match[1]) }));
const employeeIds = (value) => [...new Set([...employeeAssignments(value).map((item) => item.id), ...[...String(value || '').matchAll(/\((?:app\s*)?(\d+)\)|\b(\d{2,})\b/gi)].map((match) => match[1] || match[2])])];
function headerGetter(row, columns) { return (...names) => { for (const name of names) { const key = columns[normalize(name)]; if (key) return row[key] ?? ''; } return ''; }; }
function dateValue(value) { if (value instanceof Date) return value; if (typeof value === 'number') { const parts = XLSX.SSF.parse_date_code(value); return parts ? new Date(parts.y, parts.m - 1, parts.d, parts.H, parts.M, Math.floor(parts.S)) : null; } const valueText = text(value); const match = valueText.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/); if (match) return new Date(Number(match[3].length === 2 ? `20${match[3]}` : match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0)); const date = new Date(valueText); return Number.isNaN(date.getTime()) ? null : date; }
const dateKey = (date) => date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';
const dateText = (value) => { if (value == null || value === '' || value === 0 || value === '0') return ''; const date = dateValue(value); return date ? `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}` : text(value); };

function rowsFromBuffer(fileBuffer, expectedSheet) {
  const book = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  const sheetName = book.SheetNames.find((name) => normalize(name) === normalize(expectedSheet)) || book.SheetNames.find((name) => normalize(name).includes(normalize(expectedSheet).replace('report', ''))) || book.SheetNames[0];
  if (!sheetName) throw new Error('No worksheet was found in this file.');
  const rows = XLSX.utils.sheet_to_json(book.Sheets[sheetName], { defval: '', raw: true });
  const columns = Object.fromEntries(Object.keys(rows[0] || {}).map((key) => [normalize(key), key]));
  return { sheetName, rows, columns };
}

export function parseAttendanceBuffer(fileBuffer) {
  const { sheetName, rows, columns } = rowsFromBuffer(fileBuffer, 'Attendance Report');
  let starts = 0; let stops = 0; let missingStops = 0; const employeeIds = new Set();
  const records = rows.map((row, index) => { const get = headerGetter(row, columns); const start = dateValue(get('Start Time')); const stop = dateValue(get('Stop Time')); const record = { id: `attendance-${index}`, employee: text(get('Name')), empId: text(get('Employee Code')), designation: text(get('Designation')), googleKm: number(get('Google KM')), start, stop, dateKey: dateKey(start || stop), startAddress: text(get('Start Address')), stopAddress: text(get('Stop Address')), startPoint: validPoint(get('Start Latitude', 'Start Lat', 'Latitude'), get('Start Longitude', 'Start Long', 'Longitude')), stopPoint: validPoint(get('Stop Latitude', 'End Latitude', 'Stop Lat'), get('Stop Longitude', 'End Longitude', 'Stop Long')), reportingManager: text(get('Reporting Manager')), zonalManager: text(get('Zonal Manager')), workingTime: text(get('Total Working Time')) }; if (record.start) starts++; if (record.stop) stops++; else missingStops++; if (record.empId) employeeIds.add(record.empId); return record; }).filter((record) => record.empId || record.employee);
  const byEmployeeDate = {}; records.forEach((record) => { const key = `${record.empId}|${record.dateKey}`; (byEmployeeDate[key] ||= []).push(record); });
  return { sheetName, records, byEmployeeDate, stats: { employees: employeeIds.size, starts, stops, missingStops } };
}

export function parseDealersBuffer(fileBuffer) {
  const { sheetName, rows, columns } = rowsFromBuffer(fileBuffer, 'Direct Dealer Report');
  const dealers = rows.map((row, index) => { const get = headerGetter(row, columns); const assigned = text(get('Assigned Sales Users')); const point = validPoint(get('Latitude'), get('Longitude')); const assignments = employeeAssignments(assigned); return { id: `dealer-${index}`, companyName: text(get('Company Name')), accountCode: text(get('Account Code', 'Customer Code')), customerName: text(get('Customer Name')), customerType: text(get('Customer Type', 'Party Type')), mobile: text(get('Mobile', 'Mobile No', 'Mobile Number', 'Primary Mobile', 'Contact Number', 'Phone Number')), alternateMobile: text(get('Alternate Mobile No', 'Alternate Mobile Number')), state: text(get('State')), city: text(get('City')), district: text(get('District')), pincode: text(get('Pincode')), address: text(get('Address')), assignedSalesUsers: assigned, assignedUsers: Object.fromEntries(assignments.map((item) => [item.id, item.name])), assignedEmpIds: employeeIds(assigned), channelPartner: text(get('Assigned Channel Partner', 'Channel Partner')), lastOrder: text(get('Last Order')), lastVisit: dateText(get('Last Visit', 'Last Checkin Date', 'Last Check-In Date', 'Last Check In Date', 'Last Visited Date', 'Last Visit Date')), planDate: text(get('Plan Date')), beat: text(get('Assigned Beat')), point }; });
  const byEmployeeId = {}, byAccountCode = {}, byCity = {}, byState = {}, byBeat = {};
  const add = (map, key, dealer) => { if (key) (map[key] ||= []).push(dealer); };
  let validGps = 0; let unassigned = 0;
  dealers.forEach((dealer) => { if (dealer.point) validGps++; if (!dealer.assignedEmpIds.length) unassigned++; dealer.assignedEmpIds.forEach((id) => add(byEmployeeId, id, dealer)); add(byAccountCode, dealer.accountCode, dealer); add(byCity, dealer.city.toLowerCase(), dealer); add(byState, dealer.state.toLowerCase(), dealer); add(byBeat, dealer.beat.toLowerCase(), dealer); });
  return { sheetName, dealers, indexes: { byEmployeeId, byAccountCode, byCity, byState, byBeat }, stats: { total: dealers.length, validGps, missingGps: dealers.length - validGps, assignedEmployees: Object.keys(byEmployeeId).length, unassigned } };
}
