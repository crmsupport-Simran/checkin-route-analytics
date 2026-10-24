import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheckinOutReportRows, CHECKIN_OUT_COLUMNS, filterCheckinOutRows,
  getCheckinOutExportRows, getCheckinOutSourceCoverage, summarizeCheckinOutRows,
} from './checkinOutReport.js';

const headers = ['Date', 'Sales User Name', 'Emp ID', 'State Name', 'Check In', 'Check Out', 'Type', 'Type ID', 'Counter Planned', 'Remark'];
const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute, 0);
const row = (overrides = {}) => ({
  id: 'r1', dateKey: '2026-10-01', date: at(1, 0), salesUserName: 'Asha Rao', empId: 'E-10', stateName: 'Gujarat',
  checkIn: at(1, 8), checkInRaw: '08:00:00', checkOut: at(1, 18), checkOutRaw: '18:00:00',
  type: 'DEALER', typeId: 'C-1', counterPlanned: 10, remark: '', ...overrides,
});

test('groups source visits into employee-day rows and counts unique category identifiers', () => {
  const rows = buildCheckinOutReportRows([
    row({ id: 'r1', type: 'DEALER', typeId: 'C-1' }),
    row({ id: 'r2', type: 'DEALER', typeId: 'C-1', checkIn: at(1, 9), checkInRaw: '09:00:00' }),
    row({ id: 'r3', type: 'OTHERS', typeId: 'C-2' }),
    row({ id: 'r4', type: 'CHANNEL PARTNER', typeId: 'C-3' }),
    row({ id: 'r5', type: 'DIRECT DEALER', typeId: 'C-4' }),
    row({ id: 'r6', type: 'OFFICE', typeId: 'C-5' }),
  ], headers);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceRecordCount, 6);
  assert.equal(rows[0].counterVisited, 2);
  assert.equal(rows[0].cpVisit, 2);
  assert.equal(rows[0].durationMinutes, 600);
});

test('uses Emp ID for grouping across names and keeps undated or unidentified records distinct', () => {
  const rows = buildCheckinOutReportRows([
    row({ id: 'one', salesUserName: 'Asha Rao' }), row({ id: 'two', salesUserName: 'Asha R.' }),
    row({ id: 'three', empId: '', salesUserName: '', dateKey: '' }), row({ id: 'four', empId: '', salesUserName: '', dateKey: '' }),
  ], headers);
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((item) => item.employeeKey === 'id:E-10').length, 1);
});

test('does not deduplicate an employee-day by BDO name alone when Emp ID is absent', () => {
  const rows = buildCheckinOutReportRows([
    row({ id: 'no-id-1', empId: '', salesUserName: 'Asha Rao' }),
    row({ id: 'no-id-2', empId: '', salesUserName: 'Asha Rao' }),
  ], headers);
  assert.equal(rows.length, 2);
  assert.equal(summarizeCheckinOutRows(rows, getCheckinOutSourceCoverage(headers)).uniqueBdos, 1);
});

test('flags midnight values for validation and missing timestamps without inventing durations', () => {
  const rows = buildCheckinOutReportRows([
    row({ id: 'midnight', empId: 'E-11', checkIn: at(1, 0), checkInRaw: '00:00:00' }),
    row({ id: 'missing', empId: 'E-12', checkOut: null, checkOutRaw: '' }),
  ], headers);
  assert.equal(rows[0].status, 'Timestamp review required');
  assert.equal(rows[0].checkInValid, false);
  assert.equal(rows[0].durationMinutes, null);
  assert.equal(rows[1].status, 'Missing / invalid timestamp');
  assert.equal(rows[1].durationMinutes, null);
  assert.equal(getCheckinOutExportRows(rows)[2][5], 'SOURCE DATA REQUIRED');
});

test('flags negative and over-18-hour daily spans for review', () => {
  const rows = buildCheckinOutReportRows([
    row({ id: 'long', empId: 'E-11', checkIn: at(1, 1), checkInRaw: '01:00:00', checkOut: at(1, 23), checkOutRaw: '23:00:00' }),
    row({ id: 'negative', empId: 'E-12', checkIn: at(1, 17), checkInRaw: '17:00:00', checkOut: at(1, 8), checkOutRaw: '08:00:00' }),
  ], headers);
  assert.deepEqual(rows.map((item) => item.status), ['Unusual duration', 'Invalid duration']);
  assert.equal(rows.every((item) => !item.durationValid), true);
});

test('returns unavailable values if category IDs or planned source fields are missing', () => {
  const missingId = buildCheckinOutReportRows([row({ typeId: '' })], headers);
  const missingPlan = buildCheckinOutReportRows([row()], headers.filter((name) => name !== 'Counter Planned'));
  assert.equal(missingId[0].counterVisited, null);
  assert.equal(missingPlan[0].counterPlanned, null);
  assert.equal(summarizeCheckinOutRows(missingId, getCheckinOutSourceCoverage(headers)).totalCountersVisited, null);
  assert.equal(summarizeCheckinOutRows(missingPlan, getCheckinOutSourceCoverage(headers)).totalCountersPlanned, null);
});

test('applies month, date, BDO, state, attendance, and remarks filters', () => {
  const rows = buildCheckinOutReportRows([
    row({ id: 'a', remark: 'Phone order received' }),
    row({ id: 'b', dateKey: '2026-11-01', date: at(1, 0), salesUserName: 'Maya', stateName: 'Rajasthan' }),
  ], headers);
  assert.equal(filterCheckinOutRows(rows, { month: '2026-10', startDate: '2026-10-01', endDate: '2026-10-31', bdo: 'Asha Rao', state: 'Gujarat', status: 'Valid', exception: 'phone order' }).length, 1);
  assert.equal(filterCheckinOutRows(rows, { status: 'Unusual duration' }).length, 0);
});

test('calculates working-time average over valid employee-days and leaves orders pending', () => {
  const rows = buildCheckinOutReportRows([row(), row({ id: 'invalid', empId: 'E-11', checkOut: null, checkOutRaw: '' })], headers);
  const summary = summarizeCheckinOutRows(rows, getCheckinOutSourceCoverage(headers));
  assert.equal(summary.employeeDayRecords, 2);
  assert.equal(summary.validWorkingRecords, 1);
  assert.equal(summary.averageWorkingMinutes, 600);
  assert.equal(summary.ordersPending, true);
  assert.equal(summary.salesPending, true);
});

test('exports the exact 13-column schema and marks all order-derived data pending', () => {
  const [header, output] = getCheckinOutExportRows(buildCheckinOutReportRows([row()], headers));
  assert.deepEqual(header, ['DATE', 'Month', 'BDO NAME', 'STATE NAME', 'CHECK IN TIME', 'CHECK OUT TIME', 'TOTAL WORKING TIME', 'COUNTER PLANNED', 'COUNTER VISITED', 'CP VISIT', 'TOTAL ORDER COUNT', 'SALE', 'REMARKS']);
  assert.deepEqual(header, CHECKIN_OUT_COLUMNS);
  assert.equal(output[10], 'PENDING SOURCE DATA');
  assert.equal(output[11], 'PENDING SOURCE DATA');
});
