import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateJointWorkingKpis, prepareJointWorkingRows } from '../src/services/jointWorkingKpi.js';
import { calculateQ1Q3Reports, prepareQ1Q3ReportRows } from '../src/services/q1Q3ReportsService.js';
import { buildWeeklySalesActualAudit, buildWeeklySalesPerformanceExportRows, calculateWeeklySalesPerformanceAddon, displayManualActual, getWeeklySalesPerformanceBucket, getWeeklySalesPlanMonthOptions, isValidManualActual, isValidPlanValue, readManualActuals, readWeeklySalesPlanOverrides, saveWeeklySalesPlanOverrides, WEEKLY_SALES_PERFORMANCE_STORAGE_KEY, WEEKLY_SALES_PLAN_STORAGE_KEY } from '../src/services/weeklySalesPerformanceAddon.js';

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

test('add-on counts unique Manager + Territory employee-days from Joint Working YES rows without changing existing KPI results', () => {
  const records = [
    row('01/10/2026', { sourceIndex: 0 }),
    row('08/10/2026', { sourceIndex: 1 }),
    row('08/10/2026', { sourceIndex: 2 }), // Q1 one Manager/date; retailer source row remains counted
    row('09/10/2026', { sourceIndex: 3, empId: '200', salesUserName: 'TSO', designation: 'TERRITORY SALES OFFICER' }),
    row('17/10/2026', { sourceIndex: 4, empId: '300', salesUserName: 'Territory Without Joint Working', designation: 'TERRITORY SALES OFFICER', jointWorking: 'NO' }),
    row('25/10/2026', { sourceIndex: 5, empId: '400', salesUserName: 'Zonal exclusions are separate from SSP', zonalManager: 'OTHERS' }),
    row('25/10/2026', { sourceIndex: 6, type: 'OTHER' }),
  ];
  const prepared = prepareQ1Q3ReportRows(records);
  const existing = calculateQ1Q3Reports(prepared, '2026-10');
  const territoryKpi = calculateJointWorkingKpis(prepareJointWorkingRows(records), '2026-10', { includeTerritory: true });
  const existingSnapshot = structuredClone(existing.values);
  const addon = calculateWeeklySalesPerformanceAddon(prepared, '2026-10', existing, null, territoryKpi);
  assert.deepEqual(addon.actualByRow.ssp, { week1: 1, week2: 2, week3: 0, week4: 2 });
  assert.deepEqual(addon.actualByRow.jointDays, { week1: 1, week2: 2, week3: 0, week4: 2 });
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

test('Q4 counts unique retailer Type IDs with positive secondary order evidence; currency actuals round up', () => {
  const records = [
    row('01/10/2026', { sourceIndex: 0, typeId: 'R-1', designationSalesType: 'SECONDARY', secondaryOrderCount: 2, basicOrderValue: 1250.1 }),
    row('02/10/2026', { sourceIndex: 1, typeId: 'r-1', designationSalesType: 'SECONDARY', basicOrderValue: 100.2 }),
    row('08/10/2026', { sourceIndex: 2, typeId: 'R-2', designationSalesType: 'SECONDARY', secondaryOrderCount: '3', basicOrderValue: '2,400.5' }),
    row('09/10/2026', { sourceIndex: 3, typeId: 'R-4', designationSalesType: 'SECONDARY', secondaryOrderCount: 99, basicOrderValue: 9999, jointWorking: 'NO' }),
    row('10/10/2026', { sourceIndex: 4, typeId: 'R-5', designationSalesType: 'PRIMARY', secondaryOrderCount: 8, basicOrderValue: 8000 }),
    row('11/10/2026', { sourceIndex: 5, typeId: 'R-3', designationSalesType: 'SECONDARY ORDER COUNT', secondaryOrderCount: 1, basicOrderValue: 150.1 }),
    row('12/10/2026', { sourceIndex: 6, typeId: 'R-6', designationSalesType: 'SECONDARY', secondaryOrderCount: 0, basicOrderValue: 0 }),
  ];
  const prepared = prepareQ1Q3ReportRows(records);
  const q1Q3 = calculateQ1Q3Reports(prepared, '2026-10');
  const territoryKpi = calculateJointWorkingKpis(prepareJointWorkingRows(records), '2026-10', { includeTerritory: true });
  const addon = calculateWeeklySalesPerformanceAddon(prepared, '2026-10', q1Q3, null, territoryKpi);

  assert.deepEqual(addon.actualByRow.retailersVisited, { week1: 2, week2: 4, week3: 0, week4: 0 });
  assert.deepEqual(addon.actualByRow.orders, { week1: 1, week2: 2, week3: 0, week4: 0 });
  assert.deepEqual(addon.actualByRow.orderAmount, { week1: 1351, week2: 2551, week3: 0, week4: 0 });
  assert.deepEqual(addon.actualByRow.averageOrderValue, { week1: 1351, week2: 1276, week3: null, week4: null });
  const exportRows = buildWeeklySalesPerformanceExportRows(addon, { retainedRetailers: { week1: '12' }, newRetailers: { week2: '7' } });
  assert.equal(exportRows[3][2], 2, 'Q2 visit count feeds the table actual');
  assert.equal(exportRows[4][2], 1, 'Q4 counts the repeated retailer Type ID once');
  assert.equal(exportRows[5][2], 1351, 'Q5 exports the rounded-up weekly Basic Order Value');
  assert.equal(exportRows[5][4], 2551, 'Q5 exports the rounded-up weekly Basic Order Value');
  assert.equal(exportRows[6][4], 1276, 'Average Order Value is calculated from Q5 / unique retailer IDs and rounded up');
  assert.equal(exportRows[7][2], 12);
  assert.equal(exportRows[8][4], 7);
});

test('all weekly KPI actuals export source rows with contributions that reconcile to the displayed values', () => {
  const records = [
    row('01/10/2026', { sourceIndex: 0, typeId: 'R-1', designationSalesType: 'SECONDARY', secondaryOrderCount: 2, basicOrderValue: 1250.1 }),
    row('02/10/2026', { sourceIndex: 1, typeId: 'r-1', designationSalesType: 'SECONDARY', basicOrderValue: 100.2 }),
    row('08/10/2026', { sourceIndex: 2, typeId: 'R-2', designationSalesType: 'SECONDARY', secondaryOrderCount: '3', basicOrderValue: '2,400.5' }),
    row('09/10/2026', { sourceIndex: 3, typeId: 'R-4', designationSalesType: 'SECONDARY', secondaryOrderCount: 99, basicOrderValue: 9999, jointWorking: 'NO' }),
    row('10/10/2026', { sourceIndex: 4, typeId: 'R-5', designationSalesType: 'PRIMARY', secondaryOrderCount: 8, basicOrderValue: 8000 }),
    row('11/10/2026', { sourceIndex: 5, typeId: 'R-3', designationSalesType: 'SECONDARY ORDER COUNT', secondaryOrderCount: 1, basicOrderValue: 150.1 }),
    row('12/10/2026', { sourceIndex: 6, typeId: 'R-6', designationSalesType: 'SECONDARY', secondaryOrderCount: 0, basicOrderValue: 0 }),
    row('12/10/2026', { sourceIndex: 7, empId: '200', salesUserName: 'Territory B', designation: 'TERRITORY SALES OFFICER', typeId: 'R-7', designationSalesType: 'SECONDARY', secondaryOrderCount: 1, basicOrderValue: 200 }),
  ];
  const prepared = prepareQ1Q3ReportRows(records);
  const managerRows = prepareJointWorkingRows(records);
  const managerKpi = calculateJointWorkingKpis(managerRows, '2026-10', { includeTerritory: true });
  const addon = calculateWeeklySalesPerformanceAddon(prepared, '2026-10', calculateQ1Q3Reports(prepared, '2026-10'), null, managerKpi);
  const audit = buildWeeklySalesActualAudit(prepared, '2026-10', addon, managerKpi, { retainedRetailers: { week1: '4' } });
  const rowsFor = (kpi, week) => audit.filter((item) => item.KPI === kpi && item.Week.startsWith(week));
  const sum = (items, field) => items.reduce((total, item) => total + (Number(item[field]) || 0), 0);
  for (const week of ['WEEK-1', 'WEEK-2', 'WEEK-3', 'WEEK-4']) {
    assert.equal(sum(rowsFor('TOTAL NO. OF SSP (SENIOR SALES PERSON)', week), 'Employee Contribution'), addon.actualByRow.ssp[`week${week.at(-1)}`]);
    assert.equal(sum(rowsFor('TOTAL DAYS OF JOINT WORKING', week), 'Employee-Date Contribution'), addon.actualByRow.jointDays[`week${week.at(-1)}`]);
    assert.equal(sum(rowsFor('NO. OF RETAILERS VISITED', week), 'Retailer Visit Contribution'), addon.actualByRow.retailersVisited[`week${week.at(-1)}`]);
    assert.equal(sum(rowsFor('NO. OF ORDERS RECEIVED FROM THE RETAILER VISITED', week), 'Unique Order Retailer Contribution'), addon.actualByRow.orders[`week${week.at(-1)}`]);
    const amount = rowsFor('TOTAL ORDER AMOUNT', week);
    assert.equal(Math.ceil(sum(amount, 'Order Amount Contribution')), addon.actualByRow.orderAmount[`week${week.at(-1)}`]);
    const average = rowsFor('AVERAGE ORDER VALUE', week);
    const amountValue = sum(average, 'Order Amount Contribution');
    const retailerCount = sum(average, 'Unique Order Retailer Contribution');
    assert.equal(retailerCount, addon.actualByRow.orders[`week${week.at(-1)}`]);
    if (retailerCount) assert.equal(Math.ceil(amountValue / retailerCount), addon.actualByRow.averageOrderValue[`week${week.at(-1)}`]);
  }
  assert.equal(rowsFor('OLD RETAILER RETAINED', 'WEEK-1')[0]['Reported Weekly Actual'], 4);
  assert.ok(rowsFor('NEW RETAILER ADDED', 'WEEK-1')[0]['Source Rule'].includes('Manual weekly actual'));
  assert.ok(audit.some((item) => item.KPI === 'NO. OF RETAILERS VISITED' && item['Source Row'] === 2));
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
  const future = getWeeklySalesPlanMonthOptions(['2026-10'], new Date(2026, 9, 27));
  assert.ok(future.includes('2026-10'));
  assert.ok(future.includes('2026-11'), 'next-month plan should be selectable without next-month source data');
  const priorMonthPlans = { '2026-10': { ssp: { week1: 60 } } };
  const withNextMonth = saveWeeklySalesPlanOverrides(priorMonthPlans, '2026-11', { ssp: { week1: 70 } });
  assert.deepEqual(withNextMonth['2026-10'], { ssp: { week1: 60 } }, 'saving a next-month plan must preserve October');
  assert.deepEqual(withNextMonth['2026-11'], { ssp: { week1: 70 } });
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
