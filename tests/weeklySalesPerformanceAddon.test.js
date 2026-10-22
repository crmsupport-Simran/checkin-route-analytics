import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateJointWorkingKpis, prepareJointWorkingRows } from '../src/services/jointWorkingKpi.js';
import { calculateQ1Q3Reports, prepareQ1Q3ReportRows } from '../src/services/q1Q3ReportsService.js';
import { buildWeeklySalesPerformanceExportRows, calculateWeeklySalesPerformanceAddon, displayManualActual, getWeeklySalesPerformanceBucket, isValidManualActual, isValidPlanValue, readManualActuals, readWeeklySalesPlanOverrides, WEEKLY_SALES_PERFORMANCE_STORAGE_KEY, WEEKLY_SALES_PLAN_STORAGE_KEY } from '../src/services/weeklySalesPerformanceAddon.js';

const row = (date, extra = {}) => ({
  date, salesUserName: 'Senior A', empId: '100', designation: 'MANAGER-SALES',
  jointWorking: 'YES', jointWorkingName: 'Exec A', jointWorkingDesignation: 'EXECUTIVE-SALES', type: 'DEALER',
  ...extra,
});

test('weekly sales buckets use 1–7, 8–15, 16–23 and 24–month-end, including short months', () => {
  assert.deepEqual(['01','07','08','15','16','23','24','31'].map((day) => getWeeklySalesPerformanceBucket(`2026-10-${day}`, '2026-10')), ['week1','week1','week2','week2','week3','week3','week4','week4']);
  assert.equal(getWeeklySalesPerformanceBucket('2026-02-28', '2026-02'), 'week4');
  assert.equal(getWeeklySalesPerformanceBucket('2026-10-01', '2026-09'), null);
});

test('add-on calculates SSP, eligible joint-working days and qualifying retailer rows without changing existing KPI results', () => {
  const records = [
    row('01/10/2026', { sourceIndex: 0 }),
    row('08/10/2026', { sourceIndex: 1 }),
    row('08/10/2026', { sourceIndex: 2 }), // Q1 one Manager/date; retailer source row remains counted
    row('09/10/2026', { sourceIndex: 3, empId: '200', salesUserName: 'TSO', designation: 'TERRITORY SALES OFFICER' }),
    row('17/10/2026', { sourceIndex: 4, empId: '300', salesUserName: 'Not Senior', designation: 'SALES EXECUTIVE' }),
    row('25/10/2026', { sourceIndex: 5, empId: '400', salesUserName: 'Excluded', zonalManager: 'OTHERS' }),
    row('25/10/2026', { sourceIndex: 6, type: 'OTHER' }),
  ];
  const prepared = prepareQ1Q3ReportRows(records);
  const existing = calculateQ1Q3Reports(prepared, '2026-10');
  const territoryKpi = calculateJointWorkingKpis(prepareJointWorkingRows(records), '2026-10', { includeTerritory: true });
  const existingSnapshot = structuredClone(existing.values);
  const addon = calculateWeeklySalesPerformanceAddon(prepared, '2026-10', existing, null, territoryKpi);
  assert.deepEqual(addon.actualByRow.ssp, { week1: 1, week2: 2, week3: 0, week4: 1 });
  assert.deepEqual(addon.actualByRow.jointDays, { week1: 1, week2: 2, week3: 0, week4: 0 });
  assert.deepEqual(addon.actualByRow.retailersVisited, { week1: 1, week2: 3, week3: 0, week4: 1 });
  assert.deepEqual(addon.actualByRow.retailersVisited, Object.fromEntries(['week1', 'week2', 'week3', 'week4'].map((week) => [week, territoryKpi.values.q2[week]])));
  assert.deepEqual(addon.actualByRow.orders, { week1: 0, week2: 0, week3: 0, week4: 0 });
  assert.deepEqual(addon.actualByRow.orderAmount, { week1: 0, week2: 0, week3: 0, week4: 0 });
  assert.deepEqual(existing.values, existingSnapshot, 'add-on calculation must not mutate existing dashboard KPIs');
  const exported = buildWeeklySalesPerformanceExportRows(addon, { retainedRetailers: { week1: '12' }, newRetailers: { week3: '7' } });
  assert.equal(exported[1][1], 55);
  assert.equal(exported[1][2], 1);
  assert.equal(exported[4][8], 0);
  assert.equal(exported[5][2], 0);
  assert.equal(exported[6][4], 'Pending');
  assert.equal(exported[7][2], 12);
  assert.equal(exported[8][6], 7);
  const plans = { ssp: { week1: 60 }, jointDays: { week3: 180 } };
  const exportWithEditedPlans = buildWeeklySalesPerformanceExportRows(addon, {}, plans);
  assert.equal(exportWithEditedPlans[1][1], 60);
  assert.equal(exportWithEditedPlans[2][5], 180);
});

test('Q4 counts unique retailer Type IDs with a positive secondary order count; Q5 amount remains source-summed', () => {
  const records = [
    row('01/10/2026', { sourceIndex: 0, typeId: 'R-1', designationSalesType: 'SECONDARY', secondaryOrderCount: 2, basicOrderValue: 1250 }),
    row('02/10/2026', { sourceIndex: 1, typeId: 'r-1', designationSalesType: 'SECONDARY', basicOrderValue: 100 }),
    row('08/10/2026', { sourceIndex: 2, typeId: 'R-2', designationSalesType: 'SECONDARY', secondaryOrderCount: '3', basicOrderValue: '2,400' }),
    row('09/10/2026', { sourceIndex: 3, typeId: 'R-4', designationSalesType: 'SECONDARY', secondaryOrderCount: 99, basicOrderValue: 9999, jointWorking: 'NO' }),
    row('10/10/2026', { sourceIndex: 4, typeId: 'R-5', designationSalesType: 'PRIMARY', secondaryOrderCount: 8, basicOrderValue: 8000 }),
    row('11/10/2026', { sourceIndex: 5, typeId: 'R-3', designationSalesType: 'SECONDARY ORDER COUNT', secondaryOrderCount: 1, basicOrderValue: 150 }),
    row('12/10/2026', { sourceIndex: 6, typeId: 'R-6', designationSalesType: 'SECONDARY', secondaryOrderCount: 0, basicOrderValue: 0 }),
  ];
  const prepared = prepareQ1Q3ReportRows(records);
  const q1Q3 = calculateQ1Q3Reports(prepared, '2026-10');
  const territoryKpi = calculateJointWorkingKpis(prepareJointWorkingRows(records), '2026-10', { includeTerritory: true });
  const addon = calculateWeeklySalesPerformanceAddon(prepared, '2026-10', q1Q3, null, territoryKpi);

  assert.deepEqual(addon.actualByRow.retailersVisited, { week1: 2, week2: 4, week3: 0, week4: 0 });
  assert.deepEqual(addon.actualByRow.orders, { week1: 1, week2: 2, week3: 0, week4: 0 });
  assert.deepEqual(addon.actualByRow.orderAmount, { week1: 1350, week2: 2550, week3: 0, week4: 0 });
  assert.deepEqual(addon.actualByRow.averageOrderValue, { week1: 1350, week2: 1275, week3: null, week4: null });
  const exportRows = buildWeeklySalesPerformanceExportRows(addon, { retainedRetailers: { week1: '12' }, newRetailers: { week2: '7' } });
  assert.equal(exportRows[3][2], 2, 'Q2 visit count feeds the table actual');
  assert.equal(exportRows[4][2], 1, 'Q4 counts the repeated retailer Type ID once');
  assert.equal(exportRows[5][4], 2550, 'Q5 sums only qualifying Check-In Basic Order Value');
  assert.equal(exportRows[6][4], 1275, 'Average Order Value is calculated from Q5 / unique retailer IDs');
  assert.equal(exportRows[7][2], 12);
  assert.equal(exportRows[8][4], 7);
});

test('plan edits validate nonnegative numeric targets and load month-specific saved plans', () => {
  assert.equal(isValidPlanValue('0'), true);
  assert.equal(isValidPlanValue('123.5'), true);
  assert.equal(isValidPlanValue(''), false);
  assert.equal(isValidPlanValue('-1'), false);
  assert.equal(isValidPlanValue('abc'), false);
  const saved = '{"2026-10":{"ssp":{"week1":60}}}';
  const storage = { getItem: (key) => key === WEEKLY_SALES_PLAN_STORAGE_KEY ? saved : null };
  assert.deepEqual(readWeeklySalesPlanOverrides(storage), { '2026-10': { ssp: { week1: 60 } } });
  assert.deepEqual(readWeeklySalesPlanOverrides({ getItem: () => '{bad' }), {});
  assert.equal(WEEKLY_SALES_PERFORMANCE_STORAGE_KEY.length > 0, true);
});

test('manual actuals accept only blank or finite nonnegative values and persist safely', () => {
  assert.equal(isValidManualActual(''), true);
  assert.equal(isValidManualActual('12500'), true);
  assert.equal(isValidManualActual('-1'), false);
  assert.equal(isValidManualActual('nope'), false);
  assert.equal(isValidManualActual('Infinity'), false);
  assert.equal(displayManualActual(''), 'Pending');
  assert.equal(displayManualActual('12500'), 12500);
  const store = new Map([[WEEKLY_SALES_PERFORMANCE_STORAGE_KEY, '{"2026-10":{"retainedRetailers":{"week1":"12"},"newRetailers":{"week2":"6"}}}']]);
  const storage = { getItem: (key) => store.get(key) ?? null };
  assert.deepEqual(readManualActuals(storage), { '2026-10': { retainedRetailers: { week1: '12' }, newRetailers: { week2: '6' } } });
  assert.deepEqual(readManualActuals({ getItem: () => 'broken json' }), {});
});
