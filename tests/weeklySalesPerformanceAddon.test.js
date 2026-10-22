import test from 'node:test';
import assert from 'node:assert/strict';
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
  const existingSnapshot = structuredClone(existing.values);
  const addon = calculateWeeklySalesPerformanceAddon(prepared, '2026-10', existing);
  assert.deepEqual(addon.actualByRow.ssp, { week1: 1, week2: 2, week3: 0, week4: 1 });
  assert.deepEqual(addon.actualByRow.jointDays, { week1: 1, week2: 2, week3: 0, week4: 0 });
  assert.deepEqual(addon.actualByRow.retailersVisited, { week1: 1, week2: 3, week3: 0, week4: 1 });
  assert.deepEqual(existing.values, existingSnapshot, 'add-on calculation must not mutate existing dashboard KPIs');
  const exported = buildWeeklySalesPerformanceExportRows(addon, { averageOrderValue: { week2: '10000' } });
  assert.equal(exported[1][1], 55);
  assert.equal(exported[1][2], 1);
  assert.equal(exported[4][8], 'PENDING · Upload secondary sales report');
  assert.equal(exported[5][2], 'PENDING · Upload secondary sales report');
  assert.equal(exported[6][4], 10000);
  assert.equal(exported[7][2], 'SOURCE DATA REQUIRED');
  const plans = { ssp: { week1: 60 }, jointDays: { week3: 180 } };
  const exportWithEditedPlans = buildWeeklySalesPerformanceExportRows(addon, {}, plans);
  assert.equal(exportWithEditedPlans[1][1], 60);
  assert.equal(exportWithEditedPlans[2][5], 180);
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
  const store = new Map([[WEEKLY_SALES_PERFORMANCE_STORAGE_KEY, '{"2026-10":{"orderAmount":{"week1":"1200"}}}']]);
  const storage = { getItem: (key) => store.get(key) ?? null };
  assert.deepEqual(readManualActuals(storage), { '2026-10': { orderAmount: { week1: '1200' } } });
  assert.deepEqual(readManualActuals({ getItem: () => 'broken json' }), {});
});
