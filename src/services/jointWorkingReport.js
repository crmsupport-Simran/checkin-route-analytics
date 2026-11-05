import XLSX from 'xlsx-js-style';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const VISIT_HEADERS = ['S.No.', 'Date', 'BDO Name', 'Start Time', 'Stop Time', 'Counter No.', 'Check In', 'Check Out', 'Duration', 'Company Name', 'Type', 'Joint Working Name', 'Joint Working Designation'];
export const SUMMARY_HEADERS = ['Date', 'BDO Name', 'Total Visits', 'First Check In', 'Last Check Out'];

const clean = (value) => String(value ?? '').trim();
const idNorm = (value) => clean(value).toLocaleUpperCase().replace(/\s+/g, '');
const nameKey = (value) => clean(value).toLocaleLowerCase().replace(/\s+/g, ' ');
const validDate = (value) => value instanceof Date && Number.isFinite(value.getTime());
const localDateKey = (date) => validDate(date) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';
function safeTime(value, date) {
  if (value === '' || value == null) return null;
  if (value instanceof Date && validDate(value)) return new Date(date.getFullYear(), date.getMonth(), date.getDate(), value.getHours(), value.getMinutes(), value.getSeconds());
  if (typeof value === 'number' && Number.isFinite(value)) {
    const fraction = value >= 0 && value < 1 ? value : value - Math.floor(value);
    const seconds = Math.round(fraction * 86400);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60);
  }
  const text = clean(value);
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (match) {
    let hour = Number(match[1]);
    const meridiem = match[4]?.toUpperCase();
    if (meridiem) hour = hour % 12 + (meridiem === 'PM' ? 12 : 0);
    if (hour > 23 || Number(match[2]) > 59 || Number(match[3] || 0) > 59) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, Number(match[2]), Number(match[3] || 0));
  }
  const fullDateTime = text.match(/^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/-](\d{1,2})[/-](\d{2,4}))[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (fullDateTime) {
    let hour = Number(fullDateTime[7]);
    const meridiem = fullDateTime[10]?.toUpperCase();
    if (meridiem) hour = hour % 12 + (meridiem === 'PM' ? 12 : 0);
    if (hour > 23 || Number(fullDateTime[8]) > 59 || Number(fullDateTime[9] || 0) > 59) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, Number(fullDateTime[8]), Number(fullDateTime[9] || 0));
  }
  return null;
}
function fingerprint(row) {
  return [row.empId, row.dateKey, row.checkInRaw, row.checkOutRaw, row.companyName, row.type, row.jointWorkingName, row.jointWorkingDesignation, row.checkInLocation, row.checkOutLocation]
    .map(clean).join('|');
}

export function buildJointWorkingReport(report, attendance, filters) {
  const attendanceByIdDate = new Map();
  const attendanceByNameDate = new Map();
  for (const item of attendance?.records || []) {
    if (item.dateKey && item.empId) {
      const key = `${idNorm(item.empId)}|${item.dateKey}`;
      if (!attendanceByIdDate.has(key)) attendanceByIdDate.set(key, []);
      attendanceByIdDate.get(key).push(item);
    }
    if (item.dateKey && item.employee) {
      const key = `${nameKey(item.employee)}|${item.dateKey}`;
      if (!attendanceByNameDate.has(key)) attendanceByNameDate.set(key, []);
      attendanceByNameDate.get(key).push(item);
    }
  }
  const seen = new Set();
  let duplicateCount = 0;
  const unmatchedIds = new Set();
  const unmatchedAttendanceDays = new Set();
  const source = (report?.records || []).filter((row) => {
    const yes = ['YES', 'Y', 'TRUE', '1'].includes(clean(row.jointWorking).toLocaleUpperCase());
    const key = row.dateKey || localDateKey(row.date);
    return yes && key >= filters.dateFrom && key <= filters.dateTo
      && (!filters.bdoName || nameKey(row.salesUserName) === nameKey(filters.bdoName))
      && (!filters.jointWorkingName || nameKey(row.jointWorkingName) === nameKey(filters.jointWorkingName));
  }).filter((row) => {
    const key = fingerprint(row);
    if (seen.has(key)) { duplicateCount++; return false; }
    seen.add(key);
    return true;
  }).map((row) => {
    const dateKey = row.dateKey || localDateKey(row.date);
    const date = row.date instanceof Date ? row.date : new Date(`${dateKey}T00:00:00`);
    const checkIn = safeTime(row.checkInRaw, date);
    const checkOut = safeTime(row.checkOutRaw, date);
    const empId = clean(row.empId);
    let sessions = empId ? attendanceByIdDate.get(`${idNorm(empId)}|${dateKey}`) || [] : [];
    if (!empId) sessions = attendanceByNameDate.get(`${nameKey(row.salesUserName)}|${dateKey}`) || [];
    else if (!sessions.length) unmatchedIds.add(empId);
    if (!sessions.length) unmatchedAttendanceDays.add(`${dateKey}|${nameKey(row.salesUserName)}`);
    const starts = sessions.map((item) => item.start).filter(validDate).sort((a, b) => a - b);
    const stops = sessions.map((item) => item.stop).filter(validDate).sort((a, b) => a - b);
    const startTime = starts[0] || null;
    const stopTime = stops.at(-1) || null;
    return {
      date, dateKey, bdoName: clean(row.salesUserName), empId, checkIn, checkOut, startTime, stopTime,
      duration: checkIn && checkOut && checkOut >= checkIn ? (checkOut - checkIn) / 86400000 : null,
      companyName: clean(row.companyName), type: clean(row.type), jointWorkingName: clean(row.jointWorkingName),
      jointWorkingDesignation: clean(row.jointWorkingDesignation),
    };
  }).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.bdoName.localeCompare(b.bdoName, undefined, { sensitivity: 'base' }) || (a.checkIn?.getTime() ?? Infinity) - (b.checkIn?.getTime() ?? Infinity));

  const counters = new Map();
  const visits = source.map((row, index) => {
    const group = `${row.dateKey}|${nameKey(row.bdoName)}`;
    const counter = (counters.get(group) || 0) + 1;
    counters.set(group, counter);
    return { ...row, serial: index + 1, counter };
  });
  const groups = new Map();
  for (const row of visits) {
    const key = `${row.dateKey}|${nameKey(row.bdoName)}`;
    if (!groups.has(key)) groups.set(key, { date: row.date, dateKey: row.dateKey, bdoName: row.bdoName, total: 0, checkIns: [], checkOuts: [] });
    const group = groups.get(key);
    group.total++;
    if (row.checkIn) group.checkIns.push(row.checkIn);
    if (row.checkOut) group.checkOuts.push(row.checkOut);
  }
  const summary = [...groups.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.bdoName.localeCompare(b.bdoName, undefined, { sensitivity: 'base' })).map((row) => ({
    ...row, firstCheckIn: row.checkIns.length ? new Date(Math.min(...row.checkIns.map(Number))) : null,
    lastCheckOut: row.checkOuts.length ? new Date(Math.max(...row.checkOuts.map(Number))) : null,
  }));
  const dates = (report?.records || []).map((row) => row.dateKey || localDateKey(row.date)).filter(Boolean).sort();
  return {
    visits, summary, duplicateCount, unmatchedEmployeeIds: unmatchedIds.size,
    unmatchedEmployeeIdList: [...unmatchedIds], missingCheckIn: visits.filter((row) => !row.checkIn).length,
    unmatchedAttendanceDays: unmatchedAttendanceDays.size,
    missingCheckOut: visits.filter((row) => !row.checkOut).length,
    bdoCount: new Set(visits.map((row) => row.bdoName)).size,
    dateFromAvailable: dates[0] || '', dateToAvailable: dates.at(-1) || '',
    bdoOptions: [...new Map((report?.records || []).filter((row) => ['YES', 'Y', 'TRUE', '1'].includes(clean(row.jointWorking).toLocaleUpperCase())).map((row) => [nameKey(row.salesUserName), clean(row.salesUserName)]).filter(([key, value]) => key && value)).values()].sort(),
    jointWorkingNameOptions: [...new Map((report?.records || []).filter((row) => ['YES', 'Y', 'TRUE', '1'].includes(clean(row.jointWorking).toLocaleUpperCase())).map((row) => [nameKey(row.jointWorkingName), clean(row.jointWorkingName)]).filter(([key, value]) => key && value)).values()].sort(),
  };
}

const BORDER = Object.fromEntries(['top', 'bottom', 'left', 'right'].map((side) => [side, { style: 'thin', color: { rgb: 'D3DCE8' } }]));
const cellAddress = (row, column) => XLSX.utils.encode_cell({ r: row, c: column });
const excelDate = (date) => (date.getTime() - new Date(1899, 11, 30).getTime()) / 86400000;
function styleSheet(rows, widths, dateColumns, timeColumns, durationColumns, autofilter) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const cols = rows[1].length;
  const titleStyle = { font: { name: 'Arial', sz: 15, bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '17365D' } }, alignment: { horizontal: 'left', vertical: 'center' } };
  const headerStyle = { font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '1F4E78' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: BORDER };
  for (let c = 0; c < cols; c++) ws[cellAddress(0, c)] = { t: 's', v: c === 0 ? rows[0][0] : '', s: titleStyle };
  for (let r = 1; r < rows.length; r++) for (let c = 0; c < cols; c++) {
    const cell = ws[cellAddress(r, c)] || { t: 's', v: '' };
    const fill = r === 1 ? '1F4E78' : r === rows.length - 1 && rows[r][1] === 'Grand Total' ? 'D9EAF7' : r % 2 === 0 ? 'F1F6FA' : 'FFFFFF';
    cell.s = { font: { name: 'Arial', sz: 10, bold: r === 1 || (r === rows.length - 1 && rows[r][1] === 'Grand Total'), color: { rgb: r === 1 ? 'FFFFFF' : '1B2941' } }, fill: { patternType: 'solid', fgColor: { rgb: fill } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: BORDER };
    if (dateColumns.includes(c) && r >= 2 && typeof cell.v === 'number') cell.z = 'dd-mmm-yyyy';
    if (timeColumns.includes(c) && r >= 2 && typeof cell.v === 'number') cell.z = 'hh:mm AM/PM';
    if (durationColumns.includes(c) && r >= 2 && typeof cell.v === 'number') cell.z = '[h]:mm';
    ws[cellAddress(r, c)] = cell;
  }
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols - 1 } }];
  ws['!cols'] = widths.map((wch) => ({ wch }));
  ws['!rows'] = [{ hpt: 30 }, { hpt: 32 }, ...rows.slice(2).map(() => ({ hpt: 22 }))];
  if (autofilter) ws['!autofilter'] = { ref: `A2:${XLSX.utils.encode_col(cols - 1)}${Math.max(2, rows.length - (rows.at(-1)?.[1] === 'Grand Total' ? 1 : 0))}` };
  return ws;
}
export function buildJointWorkingWorkbook(result, title) {
  const visitRows = [
    [`JOINT WORKING REPORT · ${title}`, ...Array(VISIT_HEADERS.length - 1).fill('')], VISIT_HEADERS,
    ...result.visits.map((row) => [row.serial, excelDate(row.date), row.bdoName, row.startTime ? excelDate(row.startTime) : '', row.stopTime ? excelDate(row.stopTime) : '', row.counter, row.checkIn ? excelDate(row.checkIn) : '', row.checkOut ? excelDate(row.checkOut) : '', row.duration ?? '', row.companyName, row.type, row.jointWorkingName, row.jointWorkingDesignation]),
  ];
  const summaryRows = [
    [`JOINT WORKING SUMMARY · ${title}`, ...Array(SUMMARY_HEADERS.length - 1).fill('')], SUMMARY_HEADERS,
    ...result.summary.map((row) => [excelDate(row.date), row.bdoName, row.total, row.firstCheckIn ? excelDate(row.firstCheckIn) : '', row.lastCheckOut ? excelDate(row.lastCheckOut) : '']),
    ['', 'Grand Total', result.visits.length, '', ''],
  ];
  const visitSheet = styleSheet(visitRows, [9, 15, 28, 15, 15, 12, 15, 15, 13, 34, 22, 30, 30], [1], [3, 4, 6, 7], [8], true);
  const summarySheet = styleSheet(summaryRows, [16, 30, 16, 18, 18], [0], [3, 4], [], true);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, visitSheet, 'Visit Details');
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  workbook.Props = { Title: 'Joint Working Report', Subject: 'Date-wise joint working visits and BDO summary' };
  return workbook;
}

export function downloadJointWorkingWorkbook(result, title, fileName) {
  const workbook = buildJointWorkingWorkbook(result, title);
  const files = unzipSync(new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })));
  workbook.SheetNames.forEach((_, index) => {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const xml = strFromU8(files[path]);
    files[path] = strToU8(xml.replace(/<sheetViews><sheetView([^>]*)\/><\/sheetViews>/, '<sheetViews><sheetView$1><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A3" sqref="A3"/></sheetView></sheetViews>'));
  });
  const blob = new Blob([zipSync(files, { level: 6 })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
