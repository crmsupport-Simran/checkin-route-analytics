import { Q1_Q3_REPORT_DESIGNATION_RULES } from './q1Q3ReportsService.js';

export const WEEKLY_SALES_PERFORMANCE_ROWS = Object.freeze([
  { key: 'ssp', label: 'TOTAL NO. OF SSP (SENIOR SALES PERSON)', plan: 55, actualSource: 'Unique Manager + Territory employees with Joint Working = YES' },
  { key: 'jointDays', label: 'TOTAL DAYS OF JOINT WORKING', plan: 165, actualSource: 'Unique Manager + Territory employee/date pairs · Joint Working = YES, SECONDARY WITH BDO +SECONDARY WITH CP + SECONDARY WITH SENIOR = PLAN' },
  { key: 'retailersVisited', label: 'NO. OF RETAILERS VISITED', plan: 990, actualSource: 'Q.2 · Manager + Territory Joint Working KPI' },
  { key: 'orders', label: 'NO. OF ORDERS RECEIVED FROM THE RETAILER VISITED', plan: 495, actualSource: 'Unique retailer Type ID · Joint Working YES + Secondary sales type + positive order evidence' },
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

export function getWeeklySalesPlanMonthOptions(dataMonths = [], now = new Date(), futureMonths = 12) {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const validDataMonths = dataMonths.filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month));
  const lastAvailableMonth = [...validDataMonths, currentMonth].sort().at(-1) || currentMonth;
  const [year, month] = lastAvailableMonth.split('-').map(Number);
  const futureOptions = Array.from({ length: Math.max(0, futureMonths) + 1 }, (_, index) => {
    const date = new Date(year, month - 1 + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
  return [...new Set([...validDataMonths, ...futureOptions])].sort();
}

export function saveWeeklySalesPlanOverrides(currentOverrides = {}, month, monthPlans) {
  return { ...currentOverrides, [month]: monthPlans };
}

const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase();
const SECONDARY_ORDER_TYPES = new Set(['SECONDARY', 'SECONDARY ORDER COUNT']);
const isSecondarySalesType = (value) => normalize(value).split(',').some((token) => SECONDARY_ORDER_TYPES.has(token.trim()));
const parseAmount = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};
const roundUpToWhole = (value) => value === 0 ? 0 : Math.ceil(value - Number.EPSILON * Math.max(1, Math.abs(value)));
const allowedSenior = new Set(Q1_Q3_REPORT_DESIGNATION_RULES.managerTsoTsiTsm.map(normalize));

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

function collectWeeklyJointDayGroups(prepared, month) {
  const groups = new Map();
  for (const row of prepared.rowsByMonth?.get(month) || []) {
    const bucket = getWeeklySalesPerformanceBucket(row.dateKey, month);
    if (!bucket || row.jointWorking !== 'YES' || !allowedSenior.has(normalize(row.designation))) continue;
    const identity = row.empId ? `ID:${normalize(row.empId)}` : (row.salesUserKey ? `NAME:${normalize(row.salesUserKey)}` : '');
    if (!identity) continue;
    const pairKey = `${bucket}|${identity}|${row.dateKey}`;
    const group = groups.get(pairKey) || { bucket, identity, dateKey: row.dateKey, rows: [] };
    group.rows.push(row);
    groups.set(pairKey, group);
  }
  return [...groups.values()];
}

export function buildWeeklyJointDaysAudit(prepared, month, addon) {
  const groups = collectWeeklyJointDayGroups(prepared, month);
  const rawRows = [];
  for (const group of groups) {
    const sourceRows = [...group.rows].sort((a, b) => a.sourceRow - b.sourceRow);
    sourceRows.forEach((row, index) => rawRows.push({
      week: WEEKLY_SALES_PERFORMANCE_WEEKS.find(({ key }) => key === group.bucket)?.label || group.bucket,
      weekKey: group.bucket,
      weekActual: addon?.actualByRow?.jointDays?.[group.bucket] ?? groups.filter(({ bucket }) => bucket === group.bucket).length,
      uniqueEmployeeDatePairContribution: index === 0 ? 1 : 0,
      sourceRowsForPair: sourceRows.length,
      pairKey: `${group.identity}|${group.dateKey}`,
      date: row.dateLabel || row.dateKey,
      dateKey: row.dateKey,
      employee: row.salesUserName,
      employeeId: row.empId,
      employeeDesignation: row.designationLabel || row.designation,
      jointWorking: row.jointWorkingLabel || row.jointWorking,
      jointWorkingName: row.seniorLabel || row.seniorName || '',
      jointWorkingDesignation: row.jointWorkingDesignationLabel || row.jointWorkingDesignation || '',
      type: row.typeLabel || row.type || '',
      designationSalesType: row.designationSalesTypeLabel || row.designationSalesType || '',
      sourceRow: row.sourceRow,
    }));
  }
  return rawRows.sort((a, b) => a.weekKey.localeCompare(b.weekKey) || a.dateKey.localeCompare(b.dateKey) || a.employee.localeCompare(b.employee) || a.sourceRow - b.sourceRow);
}

export const WEEKLY_ACTUAL_AUDIT_COLUMNS = Object.freeze([
  'Record Type', 'KPI', 'Week', 'Reported Weekly Actual', 'Source Row', 'Date', 'Sales User', 'Employee ID', 'Sales User Designation',
  'Joint Working', 'Joint Working Name', 'Joint Working Designation', 'Type', 'Type ID', 'Designation Sales Type',
  'Secondary Order Count', 'Basic Order Value', 'Employee Contribution', 'Employee-Date Contribution',
  'Retailer Visit Contribution', 'Unique Order Retailer Contribution', 'Order Amount Contribution', 'Source Rule',
]);

const weeklyAuditRow = (kpi, weekKey, actual, row, measures, rule) => ({
  'Record Type': row ? 'SOURCE DETAIL' : 'MANUAL ACTUAL',
  KPI: kpi,
  Week: WEEKLY_SALES_PERFORMANCE_WEEKS.find(({ key }) => key === weekKey)?.label || weekKey,
  'Reported Weekly Actual': actual ?? '',
  'Source Row': row?.sourceRow ?? '',
  Date: row?.dateLabel || row?.dateKey || '',
  'Sales User': row?.salesUserName || '',
  'Employee ID': row?.empId || '',
  'Sales User Designation': row?.designationLabel || row?.designation || '',
  'Joint Working': row?.jointWorkingLabel || row?.jointWorking || '',
  'Joint Working Name': row?.seniorLabel || row?.seniorName || '',
  'Joint Working Designation': row?.jointWorkingDesignationLabel || row?.jointWorkingDesignation || '',
  Type: row?.typeLabel || row?.type || '',
  'Type ID': row?.typeId || '',
  'Designation Sales Type': row?.designationSalesTypeLabel || row?.designationSalesType || '',
  'Secondary Order Count': row?.secondaryOrderCount ?? '',
  'Basic Order Value': row?.basicOrderValue ?? '',
  'Employee Contribution': measures.employee ?? '',
  'Employee-Date Contribution': measures.employeeDate ?? '',
  'Retailer Visit Contribution': measures.retailerVisit ?? '',
  'Unique Order Retailer Contribution': measures.orderRetailer ?? '',
  'Order Amount Contribution': measures.orderAmount ?? '',
  'Source Rule': rule,
});

/** Raw Check-In rows and row-level contributions for every calculated weekly actual. */
export function buildWeeklySalesActualAudit(prepared, month, addon, managerKpiResult, manualActuals = {}) {
  if (!addon) return [];
  const sourceRows = prepared.rowsByMonth?.get(month) || [];
  const rows = [];
  const identityOf = (row) => row.empId ? `ID:${normalize(row.empId)}` : (row.salesUserKey ? `NAME:${normalize(row.salesUserKey)}` : '');
  const seenEmployee = new Set();
  const seenEmployeeDate = new Set();
  const eligibleSsp = new Set(Q1_Q3_REPORT_DESIGNATION_RULES.managerTsoTsiTsm.map(normalize));

  for (const row of sourceRows) {
    const week = getWeeklySalesPerformanceBucket(row.dateKey, month);
    const identity = identityOf(row);
    if (!week || row.jointWorking !== 'YES' || !eligibleSsp.has(normalize(row.designation)) || !identity) continue;
    const employeeKey = `${week}|${identity}`;
    const pairKey = `${employeeKey}|${row.dateKey}`;
    rows.push(weeklyAuditRow('TOTAL NO. OF SSP (SENIOR SALES PERSON)', week, addon.actualByRow.ssp[week], row, {
      employee: seenEmployee.has(employeeKey) ? 0 : 1,
    }, 'Unique eligible Manager + Territory employee identity with Joint Working = YES, counted once per week.'));
    seenEmployee.add(employeeKey);
    rows.push(weeklyAuditRow('TOTAL DAYS OF JOINT WORKING', week, addon.actualByRow.jointDays[week], row, {
      employeeDate: seenEmployeeDate.has(pairKey) ? 0 : 1,
    }, 'Unique eligible Manager + Territory employee identity/date pair with Joint Working = YES.'));
    seenEmployeeDate.add(pairKey);
  }

  const q2Rows = managerKpiResult?.details?.q2SourceRowsByBucket || {};
  const sourceByRow = new Map(sourceRows.map((row) => [row.sourceRow, row]));
  for (const week of addon.weeks) {
    for (const source of q2Rows[week.key] || []) {
      const sourceRow = sourceByRow.get(source.sourceRow);
      rows.push(weeklyAuditRow('NO. OF RETAILERS VISITED', week.key, addon.actualByRow.retailersVisited[week.key], sourceRow || source, {
        retailerVisit: 1,
      }, 'Every source row included by Q.2 · Manager + Territory Joint Working KPI.'));
    }
  }

  const seenRetailer = new Set();
  const seenAverageRetailer = new Set();
  const secondaryRowsByWeek = Object.fromEntries(addon.weeks.map(({ key }) => [key, []]));
  for (const row of sourceRows) {
    const week = getWeeklySalesPerformanceBucket(row.dateKey, month);
    if (!week || row.jointWorking !== 'YES' || !isSecondarySalesType(row.designationSalesType)) continue;
    secondaryRowsByWeek[week].push(row);
    const explicitOrderCount = parseAmount(row.secondaryOrderCount);
    const hasOrderEvidence = explicitOrderCount === null
      ? (parseAmount(row.basicOrderValue) ?? 0) > 0
      : explicitOrderCount > 0;
    const retailerId = normalize(row.typeId);
    const orderRetailerKey = `${week}|${retailerId}`;
    if (!hasOrderEvidence || !retailerId) continue;
    rows.push(weeklyAuditRow('NO. OF ORDERS RECEIVED FROM THE RETAILER VISITED', week, addon.actualByRow.orders[week], row, {
      orderRetailer: seenRetailer.has(orderRetailerKey) ? 0 : 1,
    }, 'Distinct nonblank Type ID for Joint Working = YES + Secondary sales type + positive Secondary Order Count; if that field is absent, positive Basic Order Value.'));
    seenRetailer.add(orderRetailerKey);
  }

  for (const week of addon.weeks) {
    const orderCount = addon.actualByRow.orders[week.key];
    for (const row of secondaryRowsByWeek[week.key]) {
      const typeId = normalize(row.typeId);
      const explicitOrderCount = parseAmount(row.secondaryOrderCount);
      const hasOrderEvidence = explicitOrderCount === null
        ? (parseAmount(row.basicOrderValue) ?? 0) > 0
        : explicitOrderCount > 0;
      const amount = parseAmount(row.basicOrderValue) ?? 0;
      const hasOrderRetailer = hasOrderEvidence && Boolean(typeId);
      rows.push(weeklyAuditRow('TOTAL ORDER AMOUNT', week.key, addon.actualByRow.orderAmount[week.key], row, {
        orderAmount: amount,
      }, 'Basic Order Value from each Joint Working = YES + Secondary sales type Check-In row; displayed weekly amount is rounded upward to whole rupees.'));
      rows.push(weeklyAuditRow('AVERAGE ORDER VALUE', week.key, addon.actualByRow.averageOrderValue[week.key], row, {
        orderRetailer: hasOrderRetailer && !seenAverageRetailer.has(`${week.key}|${typeId}`) ? 1 : 0,
        orderAmount: amount,
      }, `Calculated as weekly Total Order Amount ÷ ${orderCount ?? 0} distinct order Type IDs; sum Order Amount Contribution and divide by the unique retailer contributions, then round upward.`));
      if (hasOrderRetailer) seenAverageRetailer.add(`${week.key}|${typeId}`);
    }
  }

  for (const row of addon.rows.filter(({ key }) => ['retainedRetailers', 'newRetailers'].includes(key))) {
    for (const week of addon.weeks) {
      const value = manualActuals[row.key]?.[week.key];
      const manualValue = value === '' || value === undefined || value === null ? 'PENDING' : isValidManualActual(value) ? Number(value) : 'INVALID VALUE';
      rows.push(weeklyAuditRow(row.label, week.key, manualValue, null, {},
        'Manual weekly actual entered by the user and saved in this browser; there are no Check-In source rows for this value.'));
    }
  }
  return rows.sort((a, b) => String(a.Week).localeCompare(String(b.Week)) || String(a.KPI).localeCompare(String(b.KPI)) || (Number(a['Source Row']) || 0) - (Number(b['Source Row']) || 0));
}

export function calculateWeeklySalesPerformanceAddon(prepared, month, q1Q3Result, secondaryOrders = null, managerKpiResult = null) {
  const ssp = newWeekSets();
  const jointDays = newWeekSets();
  const orderRetailersByWeek = newWeekSets();
  const basicAmountByWeek = Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, 0]));
  const jointDayGroups = collectWeeklyJointDayGroups(prepared, month);
  for (const group of jointDayGroups) jointDays[group.bucket].add(`${group.identity}|${group.dateKey}`);
  for (const row of prepared.rowsByMonth?.get(month) || []) {
    const bucket = getWeeklySalesPerformanceBucket(row.dateKey, month);
    if (!bucket || row.jointWorking !== 'YES' || !allowedSenior.has(normalize(row.designation))) continue;
    const identity = row.empId ? `ID:${normalize(row.empId)}` : (row.salesUserKey ? `NAME:${normalize(row.salesUserKey)}` : '');
    if (identity) {
      ssp[bucket].add(identity);
    }
  }
  for (const row of prepared.rowsByMonth?.get(month) || []) {
    if (row.jointWorking !== 'YES' || !isSecondarySalesType(row.designationSalesType)) continue;
    const bucket = getWeeklySalesPerformanceBucket(row.dateKey, month);
    if (!bucket) continue;
    const explicitOrderCount = parseAmount(row.secondaryOrderCount);
    // Some Check-In exports omit Secondary Order Count altogether. In those
    // files a positive Basic Order Value is the available evidence of an order.
    const hasSecondaryOrder = explicitOrderCount === null
      ? (parseAmount(row.basicOrderValue) ?? 0) > 0
      : explicitOrderCount > 0;
    const retailerId = normalize(row.typeId);
    if (hasSecondaryOrder && retailerId) orderRetailersByWeek[bucket].add(retailerId);
    basicAmountByWeek[bucket] += parseAmount(row.basicOrderValue) ?? 0;
  }
  const orderAmount = Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, roundUpToWhole(basicAmountByWeek[key])]));
  const actualByRow = {
    ssp: Object.fromEntries(Object.keys(ssp).map((key) => [key, ssp[key].size])),
    jointDays: Object.fromEntries(Object.keys(jointDays).map((key) => [key, jointDays[key].size])),
    retailersVisited: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, managerKpiResult?.values?.q2?.[key] ?? (prepared.rowsByMonth?.has(month) ? 0 : null)])),
    orders: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, prepared.rowsByMonth?.has(month) ? orderRetailersByWeek[key].size : null])),
    orderAmount: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, prepared.rowsByMonth?.has(month) ? orderAmount[key] : null])),
    averageOrderValue: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, orderRetailersByWeek[key].size > 0 ? roundUpToWhole(basicAmountByWeek[key] / orderRetailersByWeek[key].size) : null])),
    retainedRetailers: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, null])),
    newRetailers: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, null])),
  };
  return { month, weeks: WEEKLY_SALES_PERFORMANCE_WEEKS, rows: WEEKLY_SALES_PERFORMANCE_ROWS, actualByRow,
    statuses: {
      orders: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, 'Unique Check-In Type ID · Joint Working YES + Secondary sales type + positive Secondary Order Count (or Basic Order Value when count is absent)'])),
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
