import * as XLSX from 'xlsx';
import { getKpiBuckets } from './jointWorkingKpi.js';

const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase();

// This reference report has its own eligibility set. It intentionally includes
// the Manager/Senior and Territory designations from the reference workbook;
// it is independent of both Joint Working KPI designation configurations.
export const Q2_WEEKLY_DISTRIBUTOR_RULES = Object.freeze({
  designations: Object.freeze([
    'AGM-SALES',
    'ASSISTANT MANAGER-SALES',
    'ASSISTANT MANAGER-SALES (4)',
    'ASSISTANT MANAGER-SALES (NBD) (4)',
    'DEPUTY MANAGER-SALES',
    'DEPUTY MANAGER-SALES (4)',
    'DGM-SALES',
    'MANAGER-SALES',
    'MANAGER-SALES (4)',
    'SR.MANAGER-SALES (9)',
    'TERRITORY SALES INCHARGE',
    'TERRITORY SALES MANAGER',
    'TERRITORY SALES MANAGER (4)',
    'TERRITORY SALES OFFICER',
    'TERRITORY SALES OFFICER (4)',
  ]),
  type: 'CHANNEL PARTNER',
  referenceMonth: '2026-10',
  expectedByBucket: Object.freeze({ week1: 179, week2: 232, week3: null, week4: null }),
  confirmedExpectedSubtotal: 411,
});

const eligibleDesignations = new Set(Q2_WEEKLY_DISTRIBUTOR_RULES.designations.map(normalize));
const excludedZonalManagers = new Set(['SHOBHIT GOEL', 'OTHERS', 'ARCHIT GARG', 'SHANTANU ATTARY'].map(normalize));

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
    const month = Number(match[2]) - 1;
    const date = new Date(year, month, Number(match[1]));
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === Number(match[1]) ? date : null;
  }
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = Number(match[1]); const month = Number(match[2]) - 1; const day = Number(match[3]);
    const date = new Date(year, month, day);
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
  }
  return null;
}

function requiredColumns(headers = []) {
  const normalized = new Set(headers.map(normalize));
  if (!headers.length) return [];
  const required = ['Date', 'Sales User Name', 'Designation', 'Type', 'Zonal Manager'];
  const missing = required.filter((column) => !normalized.has(normalize(column)));
  if (!['Dealer Channel Partner Code', 'Dealer Channel Partner', 'Company Name'].some((column) => normalized.has(normalize(column)))) {
    missing.push('Dealer Channel Partner Code / Dealer Channel Partner / Company Name');
  }
  return missing;
}

function normalizeRecord(record, index) {
  const date = parseDate(record.date);
  const employee = String(record.salesUserName ?? '').trim().replace(/\s+/g, ' ');
  const empId = String(record.empId ?? '').trim();
  const designation = normalize(record.designation);
  const type = normalize(record.type);
  const zonalManager = normalize(record.zonalManager);
  const distributorCode = String(record.dealerChannelPartnerCode ?? '').trim().replace(/\s+/g, ' ');
  const distributorName = String(record.dealerChannelPartner ?? '').trim().replace(/\s+/g, ' ');
  const companyName = String(record.companyName ?? '').trim().replace(/\s+/g, ' ');
  const distributorIdentifier = distributorCode || distributorName || companyName;
  const identifierSource = distributorCode ? 'Dealer Channel Partner Code' : distributorName ? 'Dealer Channel Partner' : companyName ? 'Company Name' : 'None';
  const sourceRow = Number.isInteger(record.sourceIndex) ? record.sourceIndex + 2 : index + 2;
  return {
    sourceRow, date, employee, empId, designation, designationLabel: String(record.designation ?? '').trim().replace(/\s+/g, ' '),
    type, typeLabel: String(record.type ?? '').trim().replace(/\s+/g, ' '), zonalManager,
    distributorIdentifier, distributorKey: normalize(distributorIdentifier), identifierSource,
    dateKey: date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '',
    month: date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : '',
    day: date?.getDate() ?? null,
  };
}

/** One selected-month pass; group identity mirrors the reference pivot columns. */
export function calculateQ2WeeklyDistributorGroups(records = [], month, headers = []) {
  const buckets = getKpiBuckets(month).filter(({ key }) => key.startsWith('week'));
  const sourceMissingColumns = requiredColumns(headers);
  const bucketData = Object.fromEntries(buckets.map(({ key }) => [key, {
    rawRows: 0, filteredRows: 0, blankIdentifierRows: 0, missingSeniorRows: 0,
    groups: new Map(), sourceRows: [], typeBreakdown: new Map(), designationBreakdown: new Map(),
    groupsThroughDay14: new Set(), groupsOnDay15: new Set(),
  }]));
  const invalidDateRows = [];
  let selectedMonthRows = 0;

  for (const [index, record] of records.entries()) {
    const row = normalizeRecord(record, index);
    if (!row.date) {
      invalidDateRows.push({ sourceRow: row.sourceRow, employee: row.employee || '(blank)', rawDate: String(record.date ?? ''), reason: 'Date is blank or invalid' });
      continue;
    }
    if (row.month !== month) continue;
    selectedMonthRows++;
    const bucket = buckets.find(({ from, to }) => row.day >= from && row.day <= to);
    if (!bucket) continue;
    const stats = bucketData[bucket.key];
    stats.rawRows++;

    const designationEligible = eligibleDesignations.has(row.designation);
    const typeEligible = row.type === Q2_WEEKLY_DISTRIBUTOR_RULES.type;
    const zonalExcluded = excludedZonalManagers.has(row.zonalManager);
    const seniorKey = row.employee ? `NAME:${normalize(row.employee)}` : row.empId ? `ID:${normalize(row.empId)}` : '';
    const seniorEligible = Boolean(seniorKey);
    const eligible = designationEligible && typeEligible && seniorEligible && !zonalExcluded;
    const reasons = [];
    if (!designationEligible) reasons.push('Sales User Designation is not in the Q2 reference list');
    if (!typeEligible) reasons.push('Type is not CHANNEL PARTNER');
    if (!seniorEligible) reasons.push('Senior Sales User name and Emp ID are blank');
    if (zonalExcluded) reasons.push('Excluded by configured Zonal Manager rule');
    if (designationEligible && typeEligible && !seniorEligible && !zonalExcluded) stats.missingSeniorRows++;
    if (eligible) stats.filteredRows++;

    const base = {
      bucket: bucket.label, sourceRow: row.sourceRow,
      date: row.date.toLocaleDateString('en-GB'), employee: row.employee || '(blank)', empId: row.empId,
      designation: row.designationLabel || '(blank)', type: row.typeLabel || '(blank)',
      distributorIdentifier: row.distributorIdentifier || '(blank)', identifierSource: row.identifierSource,
      eligible: eligible && Boolean(row.distributorKey), uniqueContribution: false,
      reason: reasons.join('; '),
    };
    if (eligible && !row.distributorKey) {
      stats.blankIdentifierRows++;
      base.reason = 'Distributor identifier is blank after Code → Dealer Channel Partner → Company Name fallback';
    }
    if (eligible && row.distributorKey) {
      const groupKey = [seniorKey, row.designation, row.distributorKey, row.type].join('\u0000');
      let group = stats.groups.get(groupKey);
      if (!group) {
        group = {
          groupKey, seniorSalesUser: row.employee || row.empId, empId: row.empId,
          designation: row.designationLabel || '(blank)', distributorIdentifier: row.distributorIdentifier,
          identifier: row.distributorKey, identifierSource: row.identifierSource,
          type: row.typeLabel || '(blank)', sourceRows: [],
        };
        stats.groups.set(groupKey, group);
      }
      group.sourceRows.push(row.sourceRow);
      if (row.day <= 14) stats.groupsThroughDay14.add(groupKey);
      if (row.day === 15) stats.groupsOnDay15.add(groupKey);
      stats.typeBreakdown.set(row.typeLabel || '(blank)', (stats.typeBreakdown.get(row.typeLabel || '(blank)') || 0) + 1);
      const designationKey = row.designationLabel || '(blank)';
      stats.designationBreakdown.set(designationKey, (stats.designationBreakdown.get(designationKey) || 0) + 1);
      base.groupKey = groupKey;
      base.reason = 'Included in Senior Sales User + Designation + Distributor Identifier + Type group';
    }
    stats.sourceRows.push(base);
  }

  const summaries = {};
  const groupRowsByBucket = {};
  const sourceRowsByBucket = {};
  for (const bucket of buckets) {
    const stats = bucketData[bucket.key];
    const groups = [...stats.groups.values()].map((group) => ({
      ...group, rowCount: group.sourceRows.length, sourceRows: group.sourceRows.join(', '),
    })).sort((a, b) => a.seniorSalesUser.localeCompare(b.seniorSalesUser) || a.distributorIdentifier.localeCompare(b.distributorIdentifier));
    const firstGroupRows = new Set();
    sourceRowsByBucket[bucket.key] = stats.sourceRows.map((row) => {
      if (!row.groupKey) return row;
      const uniqueContribution = !firstGroupRows.has(row.groupKey);
      firstGroupRows.add(row.groupKey);
      return { ...row, uniqueContribution, reason: uniqueContribution ? 'Counted once for this Senior + Designation + Distributor + Type group' : 'Duplicate row mapped to the existing group' };
    });
    const duplicateExamples = groups.filter((group) => group.rowCount > 1).slice(0, 20);
    const uniqueCount = groups.length;
    const referenceBoundaryUniqueGroups = bucket.key === 'week2' ? stats.groupsThroughDay14.size : null;
    const uniqueGroupsAddedOnDay15 = bucket.key === 'week2'
      ? [...stats.groupsOnDay15].filter((groupKey) => !stats.groupsThroughDay14.has(groupKey)).length
      : null;
    const expected = month === Q2_WEEKLY_DISTRIBUTOR_RULES.referenceMonth ? Q2_WEEKLY_DISTRIBUTOR_RULES.expectedByBucket[bucket.key] : null;
    const actual = sourceMissingColumns.length ? null : uniqueCount;
    const difference = expected == null || actual == null ? null : actual - expected;
    const status = sourceMissingColumns.length ? 'SOURCE DATA MISSING' : expected == null ? 'EXPECTED PENDING' : actual === expected ? 'MATCHED' : 'MISMATCH';
    summaries[bucket.key] = {
      bucket: bucket.label, expected, actual, difference, status,
      rawSourceRowCount: stats.rawRows, rowsAfterEligibilityFilters: stats.filteredRows,
      blankOrInvalidIdentifierRows: stats.blankIdentifierRows, missingSeniorRows: stats.missingSeniorRows,
      duplicateRowsRemoved: Math.max(0, stats.filteredRows - stats.blankIdentifierRows - uniqueCount),
      uniqueDistributorGroups: uniqueCount, duplicateExamples,
      referenceBoundaryUniqueGroups, uniqueGroupsAddedOnDay15,
      typeBreakdown: [...stats.typeBreakdown].map(([type, rows]) => ({ type, rows })).sort((a, b) => a.type.localeCompare(b.type)),
      designationBreakdown: [...stats.designationBreakdown].map(([designation, rows]) => ({ designation, rows })).sort((a, b) => a.designation.localeCompare(b.designation)),
    };
    groupRowsByBucket[bucket.key] = groups;
  }
  return {
    month, buckets, summaries, groupRowsByBucket, sourceRowsByBucket, invalidDateRows,
    sourceMissingColumns, selectedMonthRows,
    confirmedExpectedSubtotal: Q2_WEEKLY_DISTRIBUTOR_RULES.confirmedExpectedSubtotal,
    referenceMonth: Q2_WEEKLY_DISTRIBUTOR_RULES.referenceMonth,
  };
}

export function getQ2WeeklyDistributorSummaryRows(result, monthLabel) {
  if (!result) return [];
  return [
    ['Month', 'WEEKLY SOURCE', 'EXPECTED UNIQUE DISTRIBUTOR GROUPS', 'ACTUAL UNIQUE DISTRIBUTOR GROUPS', 'DIFFERENCE', 'STATUS', 'RAW SOURCE ROWS', 'ELIGIBLE ROWS', 'BLANK / INVALID IDENTIFIERS', 'DUPLICATE ROWS REMOVED', 'WEEK-2 UNIQUE GROUPS THROUGH DAY 14', 'WEEK-2 NEW GROUPS ON DAY 15'],
    ...result.buckets.map(({ key }) => {
      const row = result.summaries[key];
      return [monthLabel, row.bucket, row.expected ?? 'Pending', row.actual ?? 'N/A', row.difference ?? 'N/A', row.status, row.rawSourceRowCount, row.rowsAfterEligibilityFilters, row.blankOrInvalidIdentifierRows, row.duplicateRowsRemoved, row.referenceBoundaryUniqueGroups ?? 'N/A', row.uniqueGroupsAddedOnDay15 ?? 'N/A'];
    }),
    [monthLabel, 'CONFIRMED EXPECTED SUBTOTAL (WEEK-1 + WEEK-2)', result.confirmedExpectedSubtotal, '', '', 'REFERENCE ONLY', '', '', '', '', '', ''],
  ];
}
