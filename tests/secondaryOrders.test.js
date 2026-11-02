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
  headers[0] = 'Date'; headers[1] = 'Order No'; headers[2] = 'Order Type'; headers[3] = 'Status'; headers[6] = 'Total Amount'; headers[21] = 'Basic order value';
  const values = Array(22).fill(''); values[0] = '01/10/2026'; values[1] = 'SO-V'; values[2] = 'VISIT ORDER'; values[3] = 'PENDING'; values[6] = 99999; values[21] = 321.5;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, values]), 'Secondary Sales Report');
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' });
}

test('secondary order upload requires Basic Amount, Order Type, and Status and parses weekly order fields', () => {
  assert.throws(() => parseSecondaryOrdersBuffer(workbookBuffer([{ Date: '01/10/2026', 'Total Amount': 500 }])), /Basic Amount/);
  const parsed = parseSecondaryOrdersBuffer(workbookBuffer([
    { 'Order No': 'SO-1', 'Order Date': '01/10/2026', 'Basic Amount': '₹1,250.50', 'Total Amount': 99999, 'Employee Code': '101', 'Order Type': 'VISIT ORDER', Status: 'APPROVED', 'Dealer ID': 'R-1' },
    { 'Order No': 'SO-2', Date: '09/10/2026', 'Basic Amount': 750, 'Net Amount': 10000, 'Sales User': 'Employee B', 'Order Type': 'PHONE ORDER', Status: 'PENDING' },
  ]));
  assert.equal(parsed.records.length, 2);
  assert.deepEqual(parsed.records.map((row) => [row.orderId, row.dateKey, row.basicAmount]), [
    ['SO-1', '2026-10-01', 1250.5], ['SO-2', '2026-10-09', 750],
  ]);
  assert.deepEqual(parsed.records.map((row) => [row.orderType, row.status, row.dealerId]), [
    ['VISIT ORDER', 'APPROVED', 'R-1'], ['PHONE ORDER', 'PENDING', ''],
  ]);
  assert.throws(() => parseSecondaryOrdersBuffer(workbookBuffer([{ 'Order No': 'SO-X', Date: '01/10/2026', 'Basic Amount': 1, 'Order Type': 'VISIT ORDER' }])), /Status column/);
});

test('Q.5 reads Basic order value from Excel column V and ignores Total Amount', () => {
  const parsed = parseSecondaryOrdersBuffer(workbookWithBasicOrderValueInColumnV());
  assert.equal(parsed.records[0].basicAmount, 321.5);
});

test('secondary-order weekly date uses Date Created and ignores its time component', () => {
  const parsed = parseSecondaryOrdersBuffer(workbookBuffer([
    { 'Order No': 'SO-1', 'Date Created': '01-10-2026 09:57:29', 'Basic order value': 125, 'Order Type': 'VISIT ORDER', Status: 'PENDING' },
    { 'Order No': 'SO-2', 'Date Created': '08-10-2026 10:00:19', 'Basic order value': 250, 'Order Type': 'VISIT ORDER', Status: 'APPROVED' },
  ]));
  assert.deepEqual(parsed.records.map((row) => row.dateKey), ['2026-10-01', '2026-10-08']);
});

test('weekly Q.4/Q.5 count approved or pending same-day Visit Orders matched to secondary Check-Ins', () => {
  const sourceRows = [
    { date: '01/10/2026', salesUserName: 'Senior', empId: '1', designation: 'MANAGER-SALES', jointWorking: 'YES', designationSalesType: 'SECONDARY' },
    { date: '08/10/2026', salesUserName: 'Senior', empId: '1', designation: 'MANAGER-SALES', jointWorking: 'YES', designationSalesType: 'SECONDARY' },
    { date: '09/10/2026', salesUserName: 'Senior', empId: '1', designation: 'MANAGER-SALES', jointWorking: 'NO', designationSalesType: 'SECONDARY' },
  ];
  const prepared = prepareQ1Q3ReportRows(sourceRows);
  const existing = calculateQ1Q3Reports(prepared, '2026-10');
  const secondaryOrders = { records: [
    { sourceRow: 2, orderId: 'SO-1', dateKey: '2026-10-01', empId: '1', orderType: 'VISIT ORDER', status: 'PENDING', basicAmount: 100 },
    { sourceRow: 3, orderId: 'SO-1', dateKey: '2026-10-01', empId: '1', orderType: 'VISIT ORDER', status: 'APPROVED', basicAmount: 50 },
    { sourceRow: 4, orderId: 'SO-2', dateKey: '2026-10-08', empId: '1', orderType: 'VISIT ORDER', status: 'APPROVED', basicAmount: 200 },
    { sourceRow: 5, orderId: 'SO-3', dateKey: '2026-10-08', empId: '1', orderType: 'PHONE ORDER', status: 'PENDING', basicAmount: 400 },
    { sourceRow: 6, orderId: 'SO-4', dateKey: '2026-10-09', empId: '1', orderType: 'VISIT ORDER', status: 'REJECTED', basicAmount: 500 },
    { sourceRow: 7, orderId: 'SO-5', dateKey: '2026-10-01', empId: '2', orderType: 'VISIT ORDER', status: 'APPROVED', basicAmount: 600 },
  ] };
  const result = calculateWeeklySalesPerformanceAddon(prepared, '2026-10', existing, secondaryOrders);
  assert.deepEqual(result.actualByRow.orders, { week1: 1, week2: 1, week3: 0, week4: 0 });
  assert.deepEqual(result.actualByRow.orderAmount, { week1: 100, week2: 200, week3: 0, week4: 0 });
  assert.deepEqual(result.actualByRow.averageOrderValue, { week1: 100, week2: 200, week3: null, week4: null });
  const exported = buildWeeklySalesPerformanceExportRows(result);
  assert.equal(exported[4][2], 1);
  assert.equal(exported[5][2], 100);
});

test('Q.4/Q.5 stay pending when no Secondary Order Report is loaded', () => {
  const prepared = prepareQ1Q3ReportRows([]);
  const result = calculateWeeklySalesPerformanceAddon(prepared, '2026-10', null, null);
  assert.equal(result.actualByRow.orders.week1, null);
  assert.equal(result.actualByRow.orderAmount.week1, null);
  assert.equal(buildWeeklySalesPerformanceExportRows(result)[4][2], 'UPLOAD SECONDARY ORDER REPORT');
  assert.equal(buildWeeklySalesPerformanceExportRows(result)[5][2], 'UPLOAD SECONDARY ORDER REPORT');
});
