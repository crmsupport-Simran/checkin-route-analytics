import { Q1_Q3_REPORT_DESIGNATION_RULES } from './q1Q3ReportsService.js';

export const WEEKLY_SALES_PERFORMANCE_ROWS = Object.freeze([
  { key: 'ssp', label: 'TOTAL NO. OF SSP (SENIOR SALES PERSON)', plan: 55, actualSource: 'Distinct eligible Senior Sales Users with Check-In rows' },
  { key: 'jointDays', label: 'TOTAL DAYS OF JOINT WORKING', plan: 165, actualSource: 'Q1 eligible Manager + date visit-days' },
  { key: 'retailersVisited', label: 'NO. OF RETAILERS VISITED', plan: 990, actualSource: 'Q2 qualifying Dealer + Other source rows' },
  { key: 'orders', label: 'NO. OF ORDERS RECEIVED FROM THE RETAILER VISITED', plan: 495, actualSource: 'Secondary Sales Report order count' },
  { key: 'orderAmount', label: 'TOTAL ORDER AMOUNT', plan: 9900000, actualSource: 'Secondary Sales Report · Basic order value (column V) only' },
  { key: 'averageOrderValue', label: 'AVERAGE ORDER VALUE', plan: 10000, actualSource: 'Manual actual; not auto-calculated' },
  { key: 'retainedRetailers', label: 'OLD RETAILER RETAINED', plan: 55, actualSource: 'Source data required' },
  { key: 'newRetailers', label: 'NEW RETAILER ADDED', plan: 55, actualSource: 'Source data required' },
]);

export const WEEKLY_SALES_PERFORMANCE_STORAGE_KEY = 'weekly-sales-performance-manual-actuals-v1';
export const WEEKLY_SALES_PLAN_STORAGE_KEY = 'weekly-sales-performance-plan-overrides-v1';
export const WEEKLY_SALES_PERFORMANCE_WEEKS = Object.freeze([
  { key: 'week1', label: 'WEEK-1 (1–8)' },
  { key: 'week2', label: 'WEEK-2 (9–16)' },
  { key: 'week3', label: 'WEEK-3 (17–24)' },
  { key: 'week4', label: 'WEEK-4 (25–month end)' },
]);

const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase();
const allowedSenior = new Set(Q1_Q3_REPORT_DESIGNATION_RULES.managerTsoTsiTsm.map(normalize));
const excludedZonal = new Set(Q1_Q3_REPORT_DESIGNATION_RULES.excludedZonalManagers.map(normalize));

export function getWeeklySalesPerformanceBucket(dateKey, selectedMonth) {
  const match = String(dateKey ?? '').match(/^(\d{4}-\d{2})-(\d{2})$/);
  if (!match || match[1] !== selectedMonth) return null;
  const day = Number(match[2]);
  const lastDay = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate();
  if (day < 1 || day > lastDay) return null;
  if (day <= 8) return 'week1';
  if (day <= 16) return 'week2';
  if (day <= 24) return 'week3';
  return 'week4';
}

function newWeekSets() {
  return Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, new Set()]));
}

export function calculateWeeklySalesPerformanceAddon(prepared, month, q1Q3Result, secondaryOrders = null) {
  const ssp = newWeekSets();
  const jointDays = newWeekSets();
  const retailers = newWeekSets();
  const orders = newWeekSets();
  const basicAmountByWeek = Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, 0]));
  const incompleteAmountWeeks = new Set();
  for (const row of prepared.rowsByMonth?.get(month) || []) {
    const bucket = getWeeklySalesPerformanceBucket(row.dateKey, month);
    if (!bucket || !allowedSenior.has(normalize(row.designation)) || excludedZonal.has(normalize(row.zonalManager))) continue;
    const identity = row.empId ? `ID:${normalize(row.empId)}` : (row.salesUserKey ? `NAME:${normalize(row.salesUserKey)}` : '');
    if (identity) ssp[bucket].add(identity);
  }
  for (const row of q1Q3Result?.details?.q1SourceRows || []) {
    if (!row.eligible) continue;
    const bucket = getWeeklySalesPerformanceBucket(row.dateKey, month);
    if (bucket) jointDays[bucket].add(`${row.managerIdentityKey}|${row.dateKey}`);
  }
  for (const row of q1Q3Result?.details?.q2SourceRows || []) {
    if (!row.eligible) continue;
    const bucket = getWeeklySalesPerformanceBucket(row.dateKey, month);
    if (bucket) retailers[bucket].add(String(row.sourceRow));
  }
  for (const row of secondaryOrders?.records || []) {
    if (!row.dateKey?.startsWith(`${month}-`)) continue;
    const bucket = getWeeklySalesPerformanceBucket(row.dateKey, month);
    if (!bucket) continue;
    orders[bucket].add(row.orderId ? `ORDER:${normalize(row.orderId)}` : `ROW:${row.sourceRow}`);
    if (row.basicAmount === null || !Number.isFinite(Number(row.basicAmount))) incompleteAmountWeeks.add(bucket);
    else basicAmountByWeek[bucket] += Number(row.basicAmount);
  }
  const actualByRow = {
    ssp: Object.fromEntries(Object.keys(ssp).map((key) => [key, ssp[key].size])),
    jointDays: Object.fromEntries(Object.keys(jointDays).map((key) => [key, jointDays[key].size])),
    retailersVisited: Object.fromEntries(Object.keys(retailers).map((key) => [key, retailers[key].size])),
    orders: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, secondaryOrders ? orders[key].size : null])),
    orderAmount: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, secondaryOrders && !incompleteAmountWeeks.has(key) ? basicAmountByWeek[key] : null])),
    averageOrderValue: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, null])),
    retainedRetailers: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, null])),
    newRetailers: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, null])),
  };
  return { month, weeks: WEEKLY_SALES_PERFORMANCE_WEEKS, rows: WEEKLY_SALES_PERFORMANCE_ROWS, actualByRow,
    statuses: {
      orders: secondaryOrders ? Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, 'Calculated from secondary order rows'])) : Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, 'PENDING · Upload secondary sales report'])),
      orderAmount: secondaryOrders ? Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, incompleteAmountWeeks.has(key) ? 'DATA INCOMPLETE · Basic order value missing' : 'Basic order value sum'])) : Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, 'PENDING · Upload secondary sales report'])),
    },
  };
}

export function readManualActuals(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return {};
    const parsed = JSON.parse(target.getItem(WEEKLY_SALES_PERFORMANCE_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readWeeklySalesPlanOverrides(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return {};
    const parsed = JSON.parse(target.getItem(WEEKLY_SALES_PLAN_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function isValidPlanValue(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export function isValidManualActual(value) {
  if (value === '' || value === null || value === undefined) return true;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

export function displayManualActual(value) {
  if (value === '' || value === null || value === undefined) return 'Pending';
  if (!isValidManualActual(value)) return 'INVALID VALUE';
  return Number(value);
}

export function buildWeeklySalesPerformanceExportRows(addon, manualActualsForMonth = {}, planOverridesForMonth = {}) {
  if (!addon) return [];
  const actualFor = (row, weekKey) => {
    if (row.key === 'averageOrderValue') return displayManualActual(manualActualsForMonth[row.key]?.[weekKey]);
    if (row.key === 'orders' || row.key === 'orderAmount') return addon.actualByRow[row.key][weekKey] ?? addon.statuses[row.key][weekKey];
    if (row.key === 'retainedRetailers' || row.key === 'newRetailers') return 'SOURCE DATA REQUIRED';
    return addon.actualByRow[row.key][weekKey];
  };
  return [
    ['KPI', ...addon.weeks.flatMap((week) => [`${week.label} PLAN`, `${week.label} ACTUAL`])],
    ...addon.rows.map((row) => [row.label, ...addon.weeks.flatMap((week) => [Number(planOverridesForMonth[row.key]?.[week.key] ?? row.plan), actualFor(row, week.key)])]),
  ];
}
