import * as XLSX from 'xlsx';
import { coordinate } from '../utils/coordinateUtils.js';

const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const number = (value) => Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0;
const text = (value) => String(value ?? '').trim();
const validPoint = (lat, lng) => coordinate(lat, lng);
const employeeAssignments = (value) => [...String(value || '').matchAll(/([^,;]+?)\s*\(\s*(?:app\s*)?(\d+)\s*\)/gi)].map((match) => ({ id: match[2], name: text(match[1]) }));
const employeeIds = (value) => [...new Set([...employeeAssignments(value).map((item) => item.id), ...[...String(value || '').matchAll(/\((?:app\s*)?(\d+)\)|\b(\d{2,})\b/gi)].map((match) => match[1] || match[2])])];
function headerGetter(row, columns) { return (...names) => { for (const name of names) { const key = columns[normalize(name)]; if (key) return row[key] ?? ''; } return ''; }; }
function dateValue(value) { if (value instanceof Date) return value; if (typeof value === 'number') { const parts = XLSX.SSF.parse_date_code(value); return parts ? new Date(parts.y, parts.m - 1, parts.d, parts.H, parts.M, Math.floor(parts.S)) : null; } const valueText = text(value); const iso = valueText.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/); if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0), Number(iso[6] || 0)); const match = valueText.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/); if (match) return new Date(Number(match[3].length === 2 ? `20${match[3]}` : match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0)); const date = new Date(valueText); return Number.isNaN(date.getTime()) ? null : date; }
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
  const records = rows.map((row, index) => { const get = headerGetter(row, columns); const start = dateValue(get('Start Time')); const stop = dateValue(get('Stop Time')); const startLatitude = get('Start Latitude', 'Start Lat', 'Latitude'); const startLongitude = get('Start Longitude', 'Start Long', 'Start Lang', 'Longitude'); const stopLatitude = get('Stop Latitude', 'End Latitude', 'Stop Lat'); const stopLongitude = get('Stop Longitude', 'End Longitude', 'Stop Long', 'Stop Lang', 'End Lang'); const record = { id: `attendance-${index}`, employee: text(get('Name')), empId: text(get('Employee Code')), designation: text(get('Designation')), googleKm: number(get('Google KM')), start, stop, dateKey: dateKey(start || stop), startAddress: text(get('Start Address')), stopAddress: text(get('Stop Address')), startLatitude, startLongitude, stopLatitude, stopLongitude, startPoint: validPoint(startLatitude, startLongitude), stopPoint: validPoint(stopLatitude, stopLongitude), reportingManager: text(get('Reporting Manager')), zonalManager: text(get('Zonal Manager')), workingTime: text(get('Total Working Time') ) }; if (record.start) starts++; if (record.stop) stops++; else missingStops++; if (record.empId) employeeIds.add(record.empId); return record; }).filter((record) => record.empId || record.employee);
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

export function parseSecondaryOrdersBuffer(fileBuffer) {
  const { sheetName, rows, columns } = rowsFromBuffer(fileBuffer, 'Secondary Sales Report');
  if (!rows.length) throw new Error('The secondary order report has no data rows.');
  const hasColumn = (...names) => names.some((name) => columns[normalize(name)]);
  if (!hasColumn('Basic order value', 'Basic Amount')) throw new Error('The secondary order report must include “Basic order value” (Excel column V) or legacy “Basic Amount”. Q.5 uses this field only.');
  if (!hasColumn('Date Created', 'Order Date', 'Date', 'Invoice Date', 'Secondary Order Date')) throw new Error('The secondary order report must include a Date Created, Order Date, or Date column to assign weekly buckets.');
  if (!hasColumn('Order No', 'Order Number', 'Order ID', 'Sales Order No', 'Sales Order Number', 'SO Number', 'Invoice No', 'Invoice Number')) throw new Error('The secondary order report must include a unique Order No, Order ID, or Invoice No column.');
  if (!hasColumn('Order Type')) throw new Error('The secondary order report must include an Order Type column.');
  if (!hasColumn('Status', 'Order Status')) throw new Error('The secondary order report must include a Status column.');
  const records = rows.map((row, index) => {
    const get = headerGetter(row, columns);
    const firstNonblank = (...names) => names.map((name) => get(name)).find((value) => text(value) !== '') ?? '';
    const rawDate = firstNonblank('Date Created', 'Order Date', 'Date', 'Invoice Date', 'Secondary Order Date');
    const date = dateValue(rawDate);
    const rawBasicAmount = firstNonblank('Basic order value', 'Basic Amount');
    const amountText = String(rawBasicAmount ?? '').replace(/[^0-9.-]/g, '');
    const basicAmount = amountText !== '' && Number.isFinite(Number(amountText)) ? Number(amountText) : null;
    const sourceIndex = index + 2;
    return {
      sourceRow: sourceIndex,
      orderId: text(firstNonblank('Order No', 'Order Number', 'Order ID', 'Sales Order No', 'Sales Order Number', 'SO Number', 'Invoice No', 'Invoice Number')),
      dateKey: dateKey(date),
      dateLabel: date ? dateText(date) : text(rawDate),
      salesUserName: text(firstNonblank('Sales User Name', 'Sales User', 'Employee Name', 'Employee', 'Sales Person', 'Salesperson')),
      empId: text(firstNonblank('Emp ID', 'Employee ID', 'Employee Code', 'Sales User ID', 'User Code')),
      orderType: text(firstNonblank('Order Type')),
      status: text(firstNonblank('Status', 'Order Status')),
      dealerId: text(firstNonblank('Dealer ID', 'Retailer ID', 'Type ID')),
      companyName: text(firstNonblank('Company', 'Company Name', 'Dealer Name')),
      basicAmount,
      rawBasicAmount: text(rawBasicAmount),
    };
  });
  const validDates = records.map((row) => row.dateKey).filter(Boolean).sort();
  return { sheetName, records, stats: { rows: records.length, validDates: records.filter((row) => row.dateKey).length, validBasicAmounts: records.filter((row) => row.basicAmount !== null).length, uniqueOrders: new Set(records.map((row) => row.orderId).filter(Boolean)).size, minDate: validDates[0] || '', maxDate: validDates.at(-1) || '' } };
}

function timeParts(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { hours: value.getHours(), minutes: value.getMinutes(), seconds: value.getSeconds() };
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const minutes = Math.round(value * 24 * 60);
    return { hours: Math.floor(minutes / 60), minutes: minutes % 60, seconds: 0 };
  }
  const match = text(value).match(/(?:^|[ T])(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const meridiem = (match[4] || '').toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || Number(match[2]) > 59 || Number(match[3] || 0) > 59) return null;
  return { hours, minutes: Number(match[2]), seconds: Number(match[3] || 0) };
}

export function parseNcotBuffer(fileBuffer) {
  const { sheetName, rows, columns } = rowsFromBuffer(fileBuffer, 'NCOT Report');
  if (!rows.length) throw new Error('The NCOT report has no data rows.');
  const hasColumn = (...names) => names.some((name) => columns[normalize(name)]);
  const dateTimeColumns = ['Created At', 'Created On', 'Creation Date Time', 'Dealer Created At', 'Retailer Created At', 'Created Date Time', 'Date Created'];
  const createdDateColumns = ['Created Date', 'Creation Date', 'Dealer Created Date', 'Retailer Created Date', 'Date of Creation', 'NCOT Date'];
  const createdTimeColumns = ['Created Time', 'Creation Time', 'Dealer Created Time', 'Retailer Created Time', 'Time Created', 'NCOT Time', 'Created At'];
  if (!hasColumn(...dateTimeColumns, ...createdDateColumns)) throw new Error('The NCOT report must include a dealer creation date or timestamp (for example, Created At or Created Date).');
  if (!hasColumn('Created By Employee ID', 'Created By Employee Code', 'Created By Emp ID', 'Employee ID', 'Employee Code', 'Emp ID', 'Sales User ID', 'BDO ID', 'Created By ID', 'Assign User', 'Sales User Name', 'Employee Name', 'BDO Name')) {
    throw new Error('The NCOT report must include Employee Code or Assign User (or equivalent employee identity) so new dealers can be matched to Check-Ins.');
  }
  if (!hasColumn('Dealer ID', 'New Dealer ID', 'Retailer ID', 'New Retailer ID', 'Customer ID', 'Account ID', 'Dealer Code', 'Retailer Code', 'Customer Code', 'Account Code', 'Type ID', 'Dealer Name', 'Retailer Name', 'Customer Name', 'Company Name', 'Name')) {
    throw new Error('The NCOT report must include a Dealer/Retailer ID or name to count each newly created dealer once.');
  }
  const idFields = ['Created By Employee ID', 'Created By Employee Code', 'Created By Emp ID', 'Employee ID', 'Employee Code', 'Emp ID', 'Sales User ID', 'BDO ID', 'Created By ID'];
  const nameFields = ['Assign User', 'Sales User Name', 'Employee Name', 'BDO Name', 'Employee', 'Sales User', 'Created By Name'];
  const dealerIdFields = ['Dealer ID', 'New Dealer ID', 'Retailer ID', 'New Retailer ID', 'Customer ID', 'Account ID', 'Dealer Code', 'Retailer Code', 'Customer Code', 'Account Code', 'Type ID'];
  const dealerNameFields = ['Dealer Name', 'Retailer Name', 'Customer Name', 'Company Name', 'Name'];
  const records = rows.map((row, index) => {
    const get = headerGetter(row, columns);
    const firstNonblank = (...names) => names.map((name) => get(name)).find((value) => text(value) !== '') ?? '';
    const rawCreatedAt = firstNonblank(...dateTimeColumns);
    const rawCreatedDateOnly = firstNonblank(...createdDateColumns);
    const timeOnlyValue = typeof rawCreatedAt === 'number' ? rawCreatedAt >= 0 && rawCreatedAt < 1
      : rawCreatedAt instanceof Date ? rawCreatedAt.getFullYear() < 1901
        : /^\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?$/i.test(text(rawCreatedAt));
    const rawCreatedDate = timeOnlyValue ? (rawCreatedDateOnly || '') : (rawCreatedAt || rawCreatedDateOnly);
    const rawCreatedTime = timeOnlyValue ? rawCreatedAt : firstNonblank(...createdTimeColumns.filter((name) => name !== 'Created At'));
    const parsedDate = dateValue(rawCreatedDate);
    const explicitDateTime = rawCreatedDate instanceof Date
      ? rawCreatedDate.getHours() !== 0 || rawCreatedDate.getMinutes() !== 0 || rawCreatedDate.getSeconds() !== 0
      : /(?:[T ]\d{1,2}:\d{2})/.test(text(rawCreatedDate));
    const parts = rawCreatedTime !== '' ? timeParts(rawCreatedTime) : explicitDateTime && parsedDate
      ? timeParts(rawCreatedDate)
      : null;
    const createdAt = parsedDate && parts
      ? new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), parts.hours, parts.minutes, parts.seconds)
      : null;
    const creatorId = text(firstNonblank(...idFields));
    const creatorName = text(firstNonblank(...nameFields));
    const dealerId = text(firstNonblank(...dealerIdFields));
    const dealerName = text(firstNonblank(...dealerNameFields));
    const sourceRow = index + 2;
    return {
      sourceRow,
      dateKey: dateKey(parsedDate),
      createdAt,
      createdAtLabel: createdAt ? createdAt.toLocaleString('en-IN') : text(rawCreatedAt || rawCreatedDate),
      hasCreationTime: Boolean(createdAt),
      employeeId: creatorId,
      employeeName: creatorName,
      dealerId,
      dealerName,
      dealerKey: dealerId ? `ID:${normalize(dealerId)}` : dealerName ? `NAME:${normalize(dealerName)}` : '',
    };
  });
  const validDates = records.map((row) => row.dateKey).filter(Boolean).sort();
  return {
    sheetName,
    records,
    stats: {
      rows: records.length,
      validCreationTimestamps: records.filter((row) => row.createdAt).length,
      validCreatorIdentities: records.filter((row) => row.employeeId || row.employeeName).length,
      validDealerIdentities: records.filter((row) => row.dealerKey).length,
      uniqueDealers: new Set(records.map((row) => row.dealerKey).filter(Boolean)).size,
      minDate: validDates[0] || '',
      maxDate: validDates.at(-1) || '',
    },
  };
}
