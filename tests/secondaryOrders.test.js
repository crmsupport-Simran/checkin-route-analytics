import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseSecondaryOrdersBuffer } from '../src/services/supplementalParser.js';
import { calculateQ1Q3Reports, prepareQ1Q3ReportRows } from '../src/services/q1Q3ReportsService.js';
import { buildWeeklySalesPerformanceExportRows, calculateWeeklySalesPerformanceAddon } from '../src/services/weeklySalesPerformanceAddon.js';

function workbookBuffer(rows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Secondary Sales Report');
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' });
}

function workbookWithBasicOrderValueInColumnV() {
  const headers = Array.from({ length: 22 }, (_, index) => `Unused ${index + 1}`);
  headers[0] = 'Date'; headers[1] = 'Order No'; headers[6] = 'Total Amount'; headers[21] = 'Basic order value';
  const values = Array(22).fill(''); values[0] = '01/10/2026'; values[1] = 'SO-V'; values[6] = 99999; values[21] = 321.5;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, values]), 'Secondary Sales Report');
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' });
}

test('secondary order upload requires Basic Amount and parses weekly order fields', () => {
  assert.throws(() => parseSecondaryOrdersBuffer(workbookBuffer([{ Date: '01/10/2026', 'Total Amount': 500 }])), /Basic Amount/);
  const parsed = parseSecondaryOrdersBuffer(workbookBuffer([
    { 'Order No': 'SO-1', 'Order Date': '01/10/2026', 'Basic Amount': '₹1,250.50', 'Total Amount': 99999, 'Employee Code': '101' },
    { 'Order No': 'SO-2', Date: '09/10/2026', 'Basic Amount': 750, 'Net Amount': 10000, 'Sales User': 'Employee B' },
  ]));
  assert.equal(parsed.records.length, 2);
  assert.deepEqual(parsed.records.map((row) => [row.orderId, row.dateKey, row.basicAmount]), [
    ['SO-1', '2026-10-01', 1250.5], ['SO-2', '2026-10-09', 750],
  ]);
});

test('Q.5 reads Basic order value from Excel column V and ignores Total Amount', () => {
  const parsed = parseSecondaryOrdersBuffer(workbookWithBasicOrderValueInColumnV());
  assert.equal(parsed.records[0].basicAmount, 321.5);
});

test('Q.4 counts unique order IDs and Q.5 sums only Basic Amount by weekly bucket and exports the same actuals', () => {
  const sourceRows = [{ date: '01/10/2026', salesUserName: 'Senior', empId: '1', designation: 'MANAGER-SALES' }];
  const prepared = prepareQ1Q3ReportRows(sourceRows);
  const existing = calculateQ1Q3Reports(prepared, '2026-10');
  const secondaryOrders = { records: [
    { sourceRow: 2, orderId: 'SO-1', dateKey: '2026-10-01', basicAmount: 100 },
    { sourceRow: 3, orderId: 'SO-1', dateKey: '2026-10-01', basicAmount: 50 },
    { sourceRow: 4, orderId: 'SO-2', dateKey: '2026-10-09', basicAmount: 200 },
  ] };
  const result = calculateWeeklySalesPerformanceAddon(prepared, '2026-10', existing, secondaryOrders);
  assert.deepEqual(result.actualByRow.orders, { week1: 1, week2: 1, week3: 0, week4: 0 });
  assert.deepEqual(result.actualByRow.orderAmount, { week1: 150, week2: 200, week3: 0, week4: 0 });
  const exported = buildWeeklySalesPerformanceExportRows(result);
  assert.equal(exported[4][2], 1);
  assert.equal(exported[5][2], 150);
  assert.equal(exported[5][4], 200);
});

test('Q.5 is marked incomplete when a selected-week order has no Basic Amount', () => {
  const prepared = prepareQ1Q3ReportRows([]);
  const result = calculateWeeklySalesPerformanceAddon(prepared, '2026-10', null, { records: [
    { sourceRow: 2, orderId: 'SO-1', dateKey: '2026-10-01', basicAmount: null },
  ] });
  assert.equal(result.actualByRow.orderAmount.week1, null);
  assert.match(result.statuses.orderAmount.week1, /Basic order value missing/);
  assert.equal(buildWeeklySalesPerformanceExportRows(result)[5][2], 'DATA INCOMPLETE · Basic order value missing');
});
