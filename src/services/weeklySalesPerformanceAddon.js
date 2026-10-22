import { Q1_Q3_REPORT_DESIGNATION_RULES } from './q1Q3ReportsService.js';

export const WEEKLY_SALES_PERFORMANCE_ROWS = Object.freeze([
  { key: 'ssp', label: 'TOTAL NO. OF SSP (SENIOR SALES PERSON)', plan: 55, actualSource: 'Distinct eligible Senior Sales Users with Check-In rows' },
  { key: 'jointDays', label: 'TOTAL DAYS OF JOINT WORKING', plan: 165, actualSource: 'Q1 eligible Manager + date visit-days' },
  { key: 'retailersVisited', label: 'NO. OF RETAILERS VISITED', plan: 990, actualSource: 'Q.2 · Manager-only Joint Working KPI' },
  { key: 'orders', label: 'NO. OF ORDERS RECEIVED FROM THE RETAILER VISITED', plan: 495, actualSource: 'Check-In · Joint Working YES + Secondary sales type · Secondary Order Count' },
  { key: 'orderAmount', label: 'TOTAL ORDER AMOUNT', plan: 9900000, actualSource: 'Check-In · Joint Working YES + Secondary sales type · Basic Order Value' },
  { key: 'averageOrderValue', label: 'AVERAGE ORDER VALUE', plan: 10000, actualSource: 'Calculated · Total Order Amount ÷ No. of Orders Received' },
  { key: 'retainedRetailers', label: 'OLD RETAILER RETAINED', plan: 55, actualSource: 'Manual actual' },
  { key: 'newRetailers', label: 'NEW RETAILER ADDED', plan: 55, actualSource: 'Manual actual' },
]);

export const WEEKLY_SALES_PERFORMANCE_STORAGE_KEY = 'weekly-sales-performance-manual-actuals-v1';
export const WEEKLY_SALES_PLAN_STORAGE_KEY = 'weekly-sales-performance-plan-overrides-v1';
export const WEEKLY_SALES_PERFORMANCE_WEEKS = Object.freeze([
  { key: 'week1', label: 'WEEK-1 (1–7)' },
  { key: 'week2', label: 'WEEK-2 (8–15)' },
  { key: 'week3', label: 'WEEK-3 (16–23)' },
  { key: 'week4', label: 'WEEK-4 (24–month end)' },
]);

const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase();
const SECONDARY_ORDER_TYPES = new Set(['SECONDARY', 'SECONDARY ORDER COUNT']);
const isSecondarySalesType = (value) => normalize(value).split(',').some((token) => SECONDARY_ORDER_TYPES.has(token.trim()));
const parseAmount = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};
const allowedSenior = new Set(Q1_Q3_REPORT_DESIGNATION_RULES.managerTsoTsiTsm.map(normalize));
const excludedZonal = new Set(Q1_Q3_REPORT_DESIGNATION_RULES.excludedZonalManagers.map(normalize));

export function getWeeklySalesPerformanceBucket(dateKey, selectedMonth) {
  const match = String(dateKey ?? '').match(/^(\d{4}-\d{2})-(\d{2})$/);
  if (!match || match[1] !== selectedMonth) return null;
  const day = Number(match[2]);
  const lastDay = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate();
  if (day < 1 || day > lastDay) return null;
  if (day <= 7) return 'week1';
  if (day <= 15) return 'week2';
  if (day <= 23) return 'week3';
  return 'week4';
}

function newWeekSets() {
  return Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, new Set()]));
}

export function calculateWeeklySalesPerformanceAddon(prepared, month, q1Q3Result, secondaryOrders = null, managerKpiResult = null) {
  const ssp = newWeekSets();
  const jointDays = newWeekSets();
  const orderCountByWeek = Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, 0]));
  const orderRowsByWeek = Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, 0]));
  const basicAmountByWeek = Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, 0]));
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
  for (const row of prepared.rowsByMonth?.get(month) || []) {
    if (row.jointWorking !== 'YES' || !isSecondarySalesType(row.designationSalesType)) continue;
    const bucket = getWeeklySalesPerformanceBucket(row.dateKey, month);
    if (!bucket) continue;
    orderRowsByWeek[bucket] += 1;
    orderCountByWeek[bucket] += parseAmount(row.secondaryOrderCount) ?? 1;
    basicAmountByWeek[bucket] += parseAmount(row.basicOrderValue) ?? 0;
  }
  const orderAmount = Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, basicAmountByWeek[key]]));
  const actualByRow = {
    ssp: Object.fromEntries(Object.keys(ssp).map((key) => [key, ssp[key].size])),
    jointDays: Object.fromEntries(Object.keys(jointDays).map((key) => [key, jointDays[key].size])),
    retailersVisited: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, managerKpiResult?.values?.q2?.[key] ?? (prepared.rowsByMonth?.has(month) ? 0 : null)])),
    orders: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, orderRowsByWeek[key] ? orderCountByWeek[key] : (prepared.rowsByMonth?.has(month) ? 0 : null)])),
    orderAmount: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, prepared.rowsByMonth?.has(month) ? orderAmount[key] : null])),
    averageOrderValue: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, orderCountByWeek[key] > 0 ? basicAmountByWeek[key] / orderCountByWeek[key] : null])),
    retainedRetailers: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, null])),
    newRetailers: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, null])),
  };
  return { month, weeks: WEEKLY_SALES_PERFORMANCE_WEEKS, rows: WEEKLY_SALES_PERFORMANCE_ROWS, actualByRow,
    statuses: {
      orders: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, 'Check-In · Joint Working YES + Secondary order count'])),
      orderAmount: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, 'Check-In · Joint Working YES + Secondary Basic Order Value'])),
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
    if (row.key === 'retainedRetailers' || row.key === 'newRetailers') return displayManualActual(manualActualsForMonth[row.key]?.[weekKey]);
    if (row.key === 'orders' || row.key === 'orderAmount') return addon.actualByRow[row.key][weekKey] ?? addon.statuses[row.key][weekKey];
    if (row.key === 'averageOrderValue') return addon.actualByRow.averageOrderValue[weekKey] ?? 'Pending';
    return addon.actualByRow[row.key][weekKey];
  };
  return [
    ['KPI', ...addon.weeks.flatMap((week) => [`${week.label} PLAN`, `${week.label} ACTUAL`])],
    ...addon.rows.map((row) => [row.label, ...addon.weeks.flatMap((week) => [Number(planOverridesForMonth[row.key]?.[week.key] ?? row.plan), actualFor(row, week.key)])]),
  ];
}
