import { Q1_Q3_REPORT_DESIGNATION_RULES } from './q1Q3ReportsService.js';

export const WEEKLY_SALES_PERFORMANCE_ROWS = Object.freeze([
  { key: 'ssp', label: 'TOTAL NO. OF SSP (SENIOR SALES PERSON)', plan: 55, actualSource: 'Unique Manager + Territory employees with Joint Working = YES' },
  { key: 'jointDays', label: 'TOTAL DAYS OF JOINT WORKING', plan: 165, actualSource: 'Unique Manager + Territory employee/date pairs represented by qualifying Q.2 Check-Ins' },
  { key: 'retailersVisited', label: 'NO. OF RETAILERS VISITED', plan: 990, actualSource: 'Q.2 · Manager + Territory Joint Working KPI' },
  { key: 'orders', label: 'NO. OF ORDERS RECEIVED FROM THE RETAILER VISITED', plan: 495, actualSource: 'Unique matched Visit Order ID · same employee and date · Approved or Pending' },
  { key: 'orderAmount', label: 'TOTAL ORDER AMOUNT', plan: 9900000, actualSource: 'Secondary Order Report · matched Visit Order · Basic Order Value' },
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
const normalizeOrderToken = (value) => normalize(value).replace(/[^A-Z0-9]/g, '');
const isAcceptedVisitOrder = (record) => normalizeOrderToken(record?.orderType) === 'VISITORDER'
  && ['APPROVED', 'PENDING'].includes(normalizeOrderToken(record?.status));
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

export function buildWeeklyJointDaysAudit(prepared, month, addon) {
  const rawRows = [];
  const q2Rows = addon?.q2SourceRowsByBucket || {};
  const sourceByRow = new Map((prepared.rowsByMonth?.get(month) || []).map((row) => [row.sourceRow, row]));
  for (const week of WEEKLY_SALES_PERFORMANCE_WEEKS) {
    const seenPairs = new Set();
    const rows = q2Rows[week.key] || [];
    for (const source of rows) {
      const row = sourceByRow.get(source.sourceRow) || source;
      const identity = row.empId ? `ID:${normalize(row.empId)}` : `NAME:${normalize(row.salesUserName || source.employee)}`;
      if (!identity.replace('NAME:', '')) continue;
      const dateKey = row.dateKey || source.date;
      const pairKey = `${identity}|${dateKey}`;
      const previouslyCounted = seenPairs.has(pairKey);
      seenPairs.add(pairKey);
      rawRows.push({
        week: week.label,
        weekKey: week.key,
        weekActual: addon?.actualByRow?.jointDays?.[week.key] ?? seenPairs.size,
        uniqueEmployeeDatePairContribution: previouslyCounted ? 0 : 1,
        sourceRowsForPair: rows.filter((candidate) => {
          const candidateRow = sourceByRow.get(candidate.sourceRow) || candidate;
          const candidateIdentity = candidateRow.empId ? `ID:${normalize(candidateRow.empId)}` : `NAME:${normalize(candidateRow.salesUserName || candidate.employee)}`;
          return candidateIdentity === identity && (candidateRow.dateKey || candidate.date) === dateKey;
        }).length,
        pairKey,
        date: row.dateLabel || row.dateKey || source.date,
        dateKey,
        employee: row.salesUserName || source.employee,
        employeeId: row.empId || source.empId,
        employeeDesignation: row.designationLabel || row.designation || source.managerDesignation,
        jointWorking: row.jointWorkingLabel || row.jointWorking,
        jointWorkingName: row.seniorLabel || row.seniorName || source.jointWorkingName || '',
        jointWorkingDesignation: row.jointWorkingDesignationLabel || row.jointWorkingDesignation || source.juniorDesignation || '',
        type: row.typeLabel || row.type || source.type || '',
        designationSalesType: row.designationSalesTypeLabel || row.designationSalesType || '',
        sourceRow: row.sourceRow || source.sourceRow,
      });
    }
  }
  return rawRows.sort((a, b) => a.weekKey.localeCompare(b.weekKey) || a.dateKey.localeCompare(b.dateKey) || a.employee.localeCompare(b.employee) || a.sourceRow - b.sourceRow);
}

export const WEEKLY_ACTUAL_AUDIT_COLUMNS = Object.freeze([
  'Record Type', 'KPI', 'Week', 'Reported Weekly Actual', 'Source Row', 'Date', 'Sales User', 'Employee ID', 'Sales User Designation',
  'Joint Working', 'Joint Working Name', 'Joint Working Designation', 'Type', 'Type ID', 'Designation Sales Type',
  'Secondary Order Count', 'Basic Order Value', 'Secondary Order Source Row', 'Check-In Source Row', 'Order ID', 'Order Type', 'Order Status', 'Dealer ID', 'Employee Contribution', 'Employee-Date Contribution',
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
  'Secondary Order Source Row': row?.secondaryOrderSourceRow ?? '',
  'Check-In Source Row': row?.checkInSourceRow ?? '',
  'Order ID': row?.orderId || '',
  'Order Type': row?.orderType || '',
  'Order Status': row?.orderStatus || '',
  'Dealer ID': row?.dealerId || '',
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
  const seenJointDayPairs = new Set();
  const eligibleSsp = new Set(Q1_Q3_REPORT_DESIGNATION_RULES.managerTsoTsiTsm.map(normalize));

  for (const row of sourceRows) {
    const week = getWeeklySalesPerformanceBucket(row.dateKey, month);
    const identity = identityOf(row);
    if (!week || row.jointWorking !== 'YES' || !eligibleSsp.has(normalize(row.designation)) || !identity) continue;
    const employeeKey = `${week}|${identity}`;
    rows.push(weeklyAuditRow('TOTAL NO. OF SSP (SENIOR SALES PERSON)', week, addon.actualByRow.ssp[week], row, {
      employee: seenEmployee.has(employeeKey) ? 0 : 1,
    }, 'Unique eligible Manager + Territory employee identity with Joint Working = YES, counted once per week.'));
    seenEmployee.add(employeeKey);
  }

  const q2Rows = managerKpiResult?.details?.q2SourceRowsByBucket || {};
  const sourceByRow = new Map(sourceRows.map((row) => [row.sourceRow, row]));
  for (const week of addon.weeks) {
    for (const source of q2Rows[week.key] || []) {
      const sourceRow = sourceByRow.get(source.sourceRow);
      const identity = source.empId ? `ID:${normalize(source.empId)}` : (sourceRow?.salesUserKey ? `NAME:${normalize(sourceRow.salesUserKey)}` : `NAME:${normalize(source.employee)}`);
      const pairKey = `${week.key}|${identity}|${source.date}`;
      rows.push(weeklyAuditRow('TOTAL DAYS OF JOINT WORKING', week.key, addon.actualByRow.jointDays[week.key], sourceRow || source, {
        employeeDate: seenJointDayPairs.has(pairKey) ? 0 : 1,
      }, 'Unique Manager + Territory employee/date pair among Check-Ins qualifying under the Q.2 retailer rules.'));
      seenJointDayPairs.add(pairKey);
      rows.push(weeklyAuditRow('NO. OF RETAILERS VISITED', week.key, addon.actualByRow.retailersVisited[week.key], sourceRow || source, {
        retailerVisit: 1,
      }, 'Every source row included by Q.2 · Manager + Territory Joint Working KPI.'));
    }
  }

  for (const week of addon.weeks) {
    for (const order of addon.matchedSecondaryOrdersByWeek?.[week.key] || []) {
      const checkIn = order.matchedCheckIn || {};
      const auditRecord = {
        ...checkIn,
        sourceRow: order.sourceRow,
        checkInSourceRow: checkIn.sourceRow,
        secondaryOrderSourceRow: order.sourceRow,
        dateKey: order.dateKey,
        dateLabel: order.dateLabel,
        salesUserName: order.salesUserName || checkIn.salesUserName,
        empId: order.empId || checkIn.empId,
        basicOrderValue: order.basicAmount,
        orderId: order.orderId,
        orderType: order.orderType,
        orderStatus: order.status,
        dealerId: order.dealerId,
      };
      rows.push(weeklyAuditRow('NO. OF ORDERS RECEIVED FROM THE RETAILER VISITED', week.key, addon.actualByRow.orders[week.key], auditRecord, {
        orderRetailer: 1,
      }, 'Unique Order ID from the Secondary Order Report; Order Type is Visit Order, status is Approved or Pending, and employee ID (name fallback) + date match a Joint Working = YES + Secondary sales Check-In.'));
      rows.push(weeklyAuditRow('TOTAL ORDER AMOUNT', week.key, addon.actualByRow.orderAmount[week.key], auditRecord, {
        orderAmount: order.basicAmount,
      }, 'Basic Order Value from each qualifying, unique matched Visit Order in the Secondary Order Report.'));
      rows.push(weeklyAuditRow('AVERAGE ORDER VALUE', week.key, addon.actualByRow.averageOrderValue[week.key], auditRecord, {
        orderRetailer: 1,
        orderAmount: order.basicAmount,
      }, `Calculated as weekly Total Order Amount ÷ ${addon.actualByRow.orders[week.key] ?? 0} qualifying unique Order IDs; Basic Order Value and order count use the same matched Visit Orders.`));
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
  const ordersByWeek = newWeekSets();
  const basicAmountByWeek = Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, 0]));
  const missingOrderAmountsByWeek = newWeekSets();
  const matchedSecondaryOrdersByWeek = Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, []]));
  const q2SourceRowsByBucket = managerKpiResult?.details?.q2SourceRowsByBucket || {};
  for (const week of WEEKLY_SALES_PERFORMANCE_WEEKS) {
    const seenPairs = new Set();
    for (const source of q2SourceRowsByBucket[week.key] || []) {
      const identity = source.empId ? `ID:${normalize(source.empId)}` : `NAME:${normalize(source.employee)}`;
      if (!identity.replace('NAME:', '') || !source.date) continue;
      seenPairs.add(`${identity}|${source.date}`);
    }
    jointDays[week.key] = seenPairs;
  }
  for (const row of prepared.rowsByMonth?.get(month) || []) {
    const bucket = getWeeklySalesPerformanceBucket(row.dateKey, month);
    if (!bucket || row.jointWorking !== 'YES' || !allowedSenior.has(normalize(row.designation))) continue;
    const identity = row.empId ? `ID:${normalize(row.empId)}` : (row.salesUserKey ? `NAME:${normalize(row.salesUserKey)}` : '');
    if (identity) {
      ssp[bucket].add(identity);
    }
  }
  const eligibleCheckInsByEmployeeDay = new Map();
  for (const row of prepared.rowsByMonth?.get(month) || []) {
    if (row.jointWorking !== 'YES' || !isSecondarySalesType(row.designationSalesType)) continue;
    const identity = row.empId ? `ID:${normalize(row.empId)}` : (row.salesUserKey ? `NAME:${normalize(row.salesUserKey)}` : '');
    if (!identity || !row.dateKey) continue;
    const key = `${identity}|${row.dateKey}`;
    const matches = eligibleCheckInsByEmployeeDay.get(key) || [];
    matches.push(row);
    eligibleCheckInsByEmployeeDay.set(key, matches);
  }
  const seenOrderIds = new Set();
  for (const order of secondaryOrders?.records || []) {
    if (!isAcceptedVisitOrder(order) || !order.orderId || !order.dateKey) continue;
    const bucket = getWeeklySalesPerformanceBucket(order.dateKey, month);
    if (!bucket) continue;
    const identity = order.empId ? `ID:${normalize(order.empId)}` : (normalize(order.salesUserName) ? `NAME:${normalize(order.salesUserName)}` : '');
    if (!identity || seenOrderIds.has(normalize(order.orderId))) continue;
    const matches = eligibleCheckInsByEmployeeDay.get(`${identity}|${order.dateKey}`);
    if (!matches?.length) continue;
    seenOrderIds.add(normalize(order.orderId));
    ordersByWeek[bucket].add(normalize(order.orderId));
    if (order.basicAmount === null || order.basicAmount === undefined || !Number.isFinite(Number(order.basicAmount))) missingOrderAmountsByWeek[bucket].add(normalize(order.orderId));
    else basicAmountByWeek[bucket] += Number(order.basicAmount);
    matchedSecondaryOrdersByWeek[bucket].push({ ...order, matchedCheckIn: matches[0] });
  }
  const hasSecondaryOrderReport = Array.isArray(secondaryOrders?.records);
  const orderAmount = Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key,
    !hasSecondaryOrderReport ? null : missingOrderAmountsByWeek[key].size ? null : roundUpToWhole(basicAmountByWeek[key]),
  ]));
  const actualByRow = {
    ssp: Object.fromEntries(Object.keys(ssp).map((key) => [key, ssp[key].size])),
    jointDays: Object.fromEntries(Object.keys(jointDays).map((key) => [key, jointDays[key].size])),
    retailersVisited: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, managerKpiResult?.values?.q2?.[key] ?? (prepared.rowsByMonth?.has(month) ? 0 : null)])),
    orders: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, hasSecondaryOrderReport ? ordersByWeek[key].size : null])),
    orderAmount,
    averageOrderValue: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, !hasSecondaryOrderReport || orderAmount[key] === null || ordersByWeek[key].size === 0 ? null : roundUpToWhole(basicAmountByWeek[key] / ordersByWeek[key].size)])),
    retainedRetailers: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, null])),
    newRetailers: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, null])),
  };
  return { month, weeks: WEEKLY_SALES_PERFORMANCE_WEEKS, rows: WEEKLY_SALES_PERFORMANCE_ROWS, actualByRow, q2SourceRowsByBucket, matchedSecondaryOrdersByWeek,
    statuses: {
      orders: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, hasSecondaryOrderReport ? 'No qualifying matched Visit Orders' : 'UPLOAD SECONDARY ORDER REPORT'])),
      orderAmount: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, !hasSecondaryOrderReport ? 'UPLOAD SECONDARY ORDER REPORT' : missingOrderAmountsByWeek[key].size ? 'MISSING BASIC ORDER VALUE' : 'No qualifying matched Visit Orders'])),
      averageOrderValue: Object.fromEntries(WEEKLY_SALES_PERFORMANCE_WEEKS.map(({ key }) => [key, !hasSecondaryOrderReport ? 'UPLOAD SECONDARY ORDER REPORT' : missingOrderAmountsByWeek[key].size ? 'MISSING BASIC ORDER VALUE' : 'PENDING'])),
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
    if (row.key === 'averageOrderValue') return addon.actualByRow.averageOrderValue[weekKey] ?? addon.statuses.averageOrderValue[weekKey] ?? 'PENDING';
    return addon.actualByRow[row.key][weekKey];
  };
  return [
    ['KPI', ...addon.weeks.flatMap((week) => [`${week.label} PLAN`, `${week.label} ACTUAL`])],
    ...addon.rows.map((row) => [row.label, ...addon.weeks.flatMap((week) => [Number(planOverridesForMonth[row.key]?.[week.key] ?? row.plan), actualFor(row, week.key)])]),
  ];
}
