import * as XLSX from 'xlsx';
import { getKpiBuckets } from './jointWorkingKpi.js';

const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase();

// This report has its own Manager-only list. Territory Sales Officer,
// Territory Sales Incharge and Territory Sales Manager belong to the separate
// Manager + TSO/TSI/TSM report and are intentionally not included here.
export const MANAGER_EXECUTIVE_Q1_RULES = Object.freeze({
  managerDesignations: Object.freeze([
    'GM - SALES', 'DGM-SALES', 'AGM-SALES', 'SR.MANAGER-SALES (9)',
    'MANAGER-SALES', 'MANAGER-SALES (4)', 'DEPUTY MANAGER-SALES', 'DEPUTY MANAGER-SALES (4)',
    'ASSISTANT MANAGER-SALES', 'ASSISTANT MANAGER-SALES (4)', 'ASSISTANT MANAGER-SALES (NBD)',
    'ASSISTANT MANAGER-SALES (NBD) (4)', 'SR. ASSISTANT MANAGER-SALES',
  ]),
  executiveDesignations: Object.freeze([
    'EXECUTIVE-SALES', 'EXECUTIVE-SALES (4)', 'SR. EXECUTIVE-SALES (4)',
    'SR. EXECUTIVE-BACKOFFICE', 'BUSINESS DEVELOPMENT OFFICER',
  ]),
  excludedZonalManagers: Object.freeze(['SHOBHIT GOEL', 'OTHERS', 'ARCHIT GARG', 'SHANTANU ATTARY']),
});
const managerDesignations = new Set(MANAGER_EXECUTIVE_Q1_RULES.managerDesignations);
const executiveDesignations = new Set(MANAGER_EXECUTIVE_Q1_RULES.executiveDesignations);
const excludedZonalManagers = new Set(MANAGER_EXECUTIVE_Q1_RULES.excludedZonalManagers.map(normalize));

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  if (typeof value === 'number' && value > 0) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? new Date(parsed.y, parsed.m - 1, parsed.d) : null;
  }
  const text = String(value ?? '').trim();
  let match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (match) {
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const date = new Date(year, Number(match[2]) - 1, Number(match[1]));
    return date.getFullYear() === year && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[1]) ? date : null;
  }
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
  }
  return null;
}

function tokens(value) {
  return normalize(value).split(',').map((token) => token.trim()).filter(Boolean);
}

export function prepareManagerExecutiveQ1Rows(records = []) {
  const rowsByMonth = new Map();
  const months = new Set();
  const invalidDateRows = [];
  for (const [index, record] of records.entries()) {
    const date = parseDate(record.date);
    const sourceRow = Number.isInteger(record.sourceIndex) ? record.sourceIndex + 2 : index + 2;
    if (!date) {
      invalidDateRows.push({ sourceRow, employee: String(record.salesUserName ?? '').trim(), rawDate: String(record.date ?? ''), reason: 'Date is blank or invalid' });
      continue;
    }
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.add(month);
    const employee = String(record.salesUserName ?? '').trim().replace(/\s+/g, ' ');
    const empId = String(record.empId ?? '').trim();
    const row = {
      sourceRow, date: date.toLocaleDateString('en-GB'), dateKey: `${month}-${String(date.getDate()).padStart(2, '0')}`,
      month, day: date.getDate(), employee, empId,
      managerKey: empId ? `ID:${normalize(empId)}` : `NAME:${normalize(employee)}`,
      designation: normalize(record.designation), designationLabel: String(record.designation ?? '').trim().replace(/\s+/g, ' '),
      jointWorking: normalize(record.jointWorking), jointWorkingLabel: String(record.jointWorking ?? '').trim().replace(/\s+/g, ' '),
      jointWorkingName: String(record.jointWorkingName ?? '').trim().replace(/\s+/g, ' '),
      jointWorkingDesignation: String(record.jointWorkingDesignation ?? '').trim().replace(/\s+/g, ' '),
      zonalManager: String(record.zonalManager ?? '').trim().replace(/\s+/g, ' '),
      zonalManagerKey: normalize(record.zonalManager), type: String(record.type ?? '').trim().replace(/\s+/g, ' '),
    };
    if (!rowsByMonth.has(month)) rowsByMonth.set(month, []);
    rowsByMonth.get(month).push(row);
  }
  return { rowsByMonth, months: [...months].sort(), invalidDateRows };
}

export function calculateManagerExecutiveQ1(prepared, month) {
  const buckets = getKpiBuckets(month).filter(({ key }) => key.startsWith('week'));
  const values = Object.fromEntries(buckets.map(({ key }) => [key, 0]));
  const managerDates = Object.fromEntries(buckets.map(({ key }) => [key, new Map()]));
  const sourceRowsByBucket = Object.fromEntries(buckets.map(({ key }) => [key, []]));
  const excludedZonalRows = [];
  const monthRows = prepared.rowsByMonth.get(month) || [];

  for (const row of monthRows) {
    const jointTokens = tokens(row.jointWorkingDesignation);
    const matchedExecutiveDesignations = jointTokens.filter((token) => executiveDesignations.has(token));
    const managerEligible = managerDesignations.has(row.designation);
    const jointEligible = row.jointWorking === 'YES';
    const nameEligible = Boolean(row.jointWorkingName);
    const executiveEligible = matchedExecutiveDesignations.length > 0;
    const managerIdentityAvailable = Boolean(row.empId || normalize(row.employee));
    const zonalExcluded = excludedZonalManagers.has(row.zonalManagerKey);
    const reasons = [];
    if (!managerEligible) reasons.push('Sales User Designation is not an approved Manager designation');
    if (!jointEligible) reasons.push('Joint Working is not YES');
    if (!nameEligible) reasons.push('Joint Working Name is blank');
    if (!executiveEligible) reasons.push('Joint Working Designation contains no eligible Executive/BDO token');
    if (!managerIdentityAvailable) reasons.push('Sales User name and Emp ID are both blank');
    if (zonalExcluded) reasons.push('Excluded by Zonal Manager rule');
    const eligible = managerEligible && jointEligible && nameEligible && executiveEligible && managerIdentityAvailable && !zonalExcluded;
    const base = {
      sourceRow: row.sourceRow, date: row.date, employee: row.employee, empId: row.empId,
      dateKey: row.dateKey,
      designation: row.designationLabel || '(blank)', jointWorking: row.jointWorkingLabel || '(blank)',
      jointWorkingName: row.jointWorkingName || '(blank)', jointWorkingDesignation: row.jointWorkingDesignation || '(blank)',
      matchedExecutiveDesignations: matchedExecutiveDesignations.join(', '), type: row.type || '(blank)',
      zonalManager: row.zonalManager || '(blank)', eligible,
      reason: eligible ? 'Included: Manager + date contributes once per week' : reasons.join('; '),
    };
    if (zonalExcluded) excludedZonalRows.push(base);
    const bucket = buckets.find(({ from, to }) => row.day >= from && row.day <= to);
    if (!bucket) continue;
    sourceRowsByBucket[bucket.key].push({ ...base, bucket: bucket.label, uniqueContribution: false });
    if (!eligible) continue;
    const managerMap = managerDates[bucket.key];
    let manager = managerMap.get(row.managerKey);
    if (!manager) {
      manager = { managerKey: row.managerKey, manager: row.employee || '(blank)', empId: row.empId, dates: new Set(), sourceRows: new Map() };
      managerMap.set(row.managerKey, manager);
    }
    manager.dates.add(row.dateKey);
    if (!manager.sourceRows.has(row.dateKey)) manager.sourceRows.set(row.dateKey, []);
    manager.sourceRows.get(row.dateKey).push(row.sourceRow);
  }

  const managerSummariesByBucket = {};
  const q1AuditByBucket = {};
  for (const bucket of buckets) {
    managerSummariesByBucket[bucket.key] = [...managerDates[bucket.key].values()].map((manager) => {
      const dates = [...manager.dates].sort();
      values[bucket.key] += dates.length;
      return { managerKey: manager.managerKey, manager: manager.manager, empId: manager.empId, visitDays: dates.length, dates: dates.join(', '), sourceRows: [...manager.sourceRows.values()].flat().join(', ') };
    }).sort((a, b) => a.manager.localeCompare(b.manager));
    q1AuditByBucket[bucket.key] = sourceRowsByBucket[bucket.key];
  }

  // Mark the first source row for each Manager + Date as the counted row in the audit.
  for (const bucket of buckets) {
    const firstByManagerDate = new Set();
    q1AuditByBucket[bucket.key] = q1AuditByBucket[bucket.key].map((row) => {
      if (!row.eligible) return row;
      const key = `${row.empId ? `ID:${normalize(row.empId)}` : `NAME:${normalize(row.employee)}`}\u0000${row.dateKey}`;
      const uniqueContribution = !firstByManagerDate.has(key);
      firstByManagerDate.add(key);
      return { ...row, uniqueContribution };
    });
  }
  return {
    month, buckets, values,
    total: Object.values(values).reduce((sum, count) => sum + count, 0),
    details: { totalMonthRows: monthRows.length, qualifyingSourceRows: Object.values(sourceRowsByBucket).flat().filter((row) => row.eligible).length,
      managerSummariesByBucket, sourceRowsByBucket: q1AuditByBucket, excludedZonalRows, invalidDateRows: prepared.invalidDateRows },
  };
}

export function getManagerExecutiveQ1ExportRows(result, monthLabel) {
  if (!result) return [];
  return [['Month', 'KPI', ...result.buckets.map(({ label }) => label), 'Total'],
    [monthLabel, 'Q1 · Manager unique joint-working visit-days with Executive/BDO', ...result.buckets.map(({ key }) => result.values[key]), result.total]];
}
