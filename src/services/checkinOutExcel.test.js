import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckinOutExcelWorkbook } from './checkinOutExcel.js';

test('Excel export keeps report bands, centered data, alerts, and missing source styling', () => {
  const row = {
    date: '01-Oct-26', month: 'OCT', bdoName: 'Test BDO', stateName: 'Gujarat',
    checkIn: new Date(2026, 9, 1, 10, 45), checkOut: new Date(2026, 9, 1, 19, 0),
    checkInValid: true, checkOutValid: true, durationMinutes: 6 * 60, durationValid: true,
    counterPlanned: 10, counterVisited: 7, cpVisit: 0, orderCount: null, sale: null,
    remarks: '', status: 'Valid',
  };
  const sheet = buildCheckinOutExcelWorkbook([row], 'Filtered report').Sheets['Check-In-Out Report'];

  assert.equal(sheet.A1.v, 'Filtered report');
  assert.equal(sheet.A1.s.fill.fgColor.rgb, '9FC5E8');
  assert.equal(sheet.A2.s.fill.fgColor.rgb, 'FFF200');
  assert.equal(sheet.E2.s.fill.fgColor.rgb, '8FCE4E');
  assert.equal(sheet.B3.s.alignment.horizontal, 'center');
  assert.equal(sheet.E3.s.font.color.rgb, 'D71920');
  assert.equal(sheet.F3.s.font.color.rgb, 'D71920');
  assert.equal(sheet.G3.s.font.color.rgb, 'D71920');
  assert.equal(sheet.I3.s.font.color.rgb, 'D71920');
  assert.equal(sheet.K3.s.font.color.rgb, '946400');
  assert.equal(sheet.M3.s.fill.fgColor.rgb, 'FFFFFF');
  assert.equal(sheet['!autofilter'].ref, 'A2:M3');
  assert.deepEqual(sheet['!merges'][0], { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } });
});
