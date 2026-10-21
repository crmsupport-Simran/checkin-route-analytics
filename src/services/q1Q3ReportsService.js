import * as XLSX from 'xlsx';
import { getKpiBuckets } from './jointWorkingKpi.js';

const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase();
const normalizeDesignation = normalize;
export const Q1_Q3_REPORT_DESIGNATION_RULES = Object.freeze({
  managerTsoTsiTsm: Object.freeze([
    'GM - SALES', 'DGM-SALES', 'AGM-SALES', 'SR.MANAGER-SALES (9)',
    'MANAGER-SALES', 'MANAGER-SALES (4)', 'DEPUTY MANAGER-SALES', 'DEPUTY MANAGER-SALES (4)',
    'ASSISTANT MANAGER-SALES', 'ASSISTANT MANAGER-SALES (4)', 'ASSISTANT MANAGER-SALES (NBD)',
    'ASSISTANT MANAGER-SALES (NBD) (4)', 'SR. ASSISTANT MANAGER-SALES',
    'SR. TERRITORY SALES INCHARGE (4)', 'TERRITORY SALES INCHARGE', 'TERRITORY SALES INCHARGE (4)',
    'TERRITORY SALES MANAGER', 'TERRITORY SALES MANAGER (4)', 'TERRITORY SALES OFFICER',
    'TERRITORY SALES OFFICER (4)', 'TERRITORY SALES OFFICER (NBD) (4)',
  ]),
  executiveBdo: Object.freeze([
  'EXECUTIVE-SALES', 'EXECUTIVE-SALES (4)',
  'BUSINESS DEVELOPMENT OFFICER', 'BUSINESS DEVELOPMENT OFFICER (4)',
  'SR. EXECUTIVE-SALES', 'SR. EXECUTIVE-SALES (4)',
  ]),
  seniorQ3: Object.freeze([
  'DEPUTY MANAGER-SALES (4)', 'DEPUTY MANAGER-SALES', 'MANAGER-SALES',
  'ASSISTANT MANAGER-SALES', 'ASSISTANT MANAGER-SALES (4)', 'MANAGER-SALES (4)',
  'ASSISTANT MANAGER-SALES (NBD) (4)', 'AGM-SALES', 'SR.MANAGER-SALES (9)', 'DGM-SALES',
  ]),
  excludedZonalManagers: Object.freeze([
  'SHOBHIT GOEL',
  'OTHERS',
  'ARCHIT GARG',
  'SHANTANU ATTARY',
  ]),
});
const REPORT_BDO_DESIGNATIONS = new Set(Q1_Q3_REPORT_DESIGNATION_RULES.executiveBdo);
const REPORT_MANAGER_GROUP = new Set(Q1_Q3_REPORT_DESIGNATION_RULES.managerTsoTsiTsm);
const REPORT_Q3_SENIORS = new Set(Q1_Q3_REPORT_DESIGNATION_RULES.seniorQ3);
const REPORT_EXCLUDED_ZONAL_MANAGERS = new Set(Q1_Q3_REPORT_DESIGNATION_RULES.excludedZonalManagers);

function hasApprovedDesignation(value, approvedDesignations) {
  const designations = normalizeDesignation(value).split(',').map((designation) => designation.trim()).filter(Boolean);
  return designations.length > 0 && designations.every((designation) => approvedDesignations.has(designation));
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && value > 0) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? new Date(parsed.y, parsed.m - 1, parsed.d) : null;
  }
  const text = String(value ?? '').trim();
  let match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (match) {
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const result = new Date(year, Number(match[2]) - 1, Number(match[1]));
    return result.getFullYear() === year && result.getMonth() === Number(match[2]) - 1 && result.getDate() === Number(match[1]) ? result : null;
  }
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const result = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return result.getFullYear() === Number(match[1]) && result.getMonth() === Number(match[2]) - 1 && result.getDate() === Number(match[3]) ? result : null;
  }
  return null;
}

export function prepareQ1Q3ReportRows(records = []) {
  const months = new Set();
  const rows = [];
  const invalidDateRows = [];
  const rowsByMonth = new Map();
  for (const [index, record] of records.entries()) {
    // The report's Date column is authoritative. dateKey may fall back to a
    // Check-In timestamp in the parser and must not turn a blank Date into a visit date.
    const date = parseDate(record.date);
    if (!date) {
      invalidDateRows.push({ sourceRow: Number.isInteger(record.sourceIndex) ? record.sourceIndex + 2 : index + 2, employee: String(record.salesUserName ?? '').trim(), empId: String(record.empId ?? '').trim(), rawDate: String(record.date ?? '').trim(), reason: 'Date is blank or could not be parsed' });
      continue;
    }
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.add(month);
    const preparedRow = {
      sourceRow: Number.isInteger(record.sourceIndex) ? record.sourceIndex + 2 : index + 2,
      sourceId: String(record.id ?? ''),
      month,
      day: date.getDate(),
      dateKey: `${month}-${String(date.getDate()).padStart(2, '0')}`,
      dateLabel: date.toLocaleDateString('en-GB'),
      salesUserName: String(record.salesUserName ?? '').trim().replace(/\s+/g, ' '),
      salesUserKey: normalize(record.salesUserName),
      empId: String(record.empId ?? '').trim(),
      managerIdentityKey: String(record.empId ?? '').trim() ? `ID:${normalize(record.empId)}` : `NAME:${normalize(record.salesUserName)}`,
      designation: normalizeDesignation(record.designation),
      designationLabel: String(record.designation ?? '').trim().replace(/\s+/g, ' '),
      jointWorkingDesignation: normalizeDesignation(record.jointWorkingDesignation),
      jointWorkingDesignationLabel: String(record.jointWorkingDesignation ?? '').trim().replace(/\s+/g, ' '),
      designationSalesType: normalize(record.designationSalesType),
      designationSalesTypeLabel: String(record.designationSalesType ?? '').trim().replace(/\s+/g, ' '),
      zonalManager: String(record.zonalManager ?? '').trim().replace(/\s+/g, ' '),
      zonalManagerKey: normalize(record.zonalManager),
      jointWorking: normalize(record.jointWorking),
      jointWorkingLabel: String(record.jointWorking ?? '').trim().replace(/\s+/g, ' '),
      seniorName: normalize(record.jointWorkingName),
      seniorLabel: String(record.jointWorkingName ?? '').trim().replace(/\s+/g, ' '),
      type: normalize(record.type),
      typeLabel: String(record.type ?? '').trim().replace(/\s+/g, ' '),
      distributor: normalize(record.dealerChannelPartnerCode) || normalize(record.dealerChannelPartner) || normalize(record.companyName),
      distributorLabel: String(record.dealerChannelPartnerCode || record.dealerChannelPartner || record.companyName || '').trim().replace(/\s+/g, ' '),
      companyName: String(record.companyName ?? '').trim().replace(/\s+/g, ' '),
      dealerChannelPartner: String(record.dealerChannelPartner ?? '').trim().replace(/\s+/g, ' '),
      dealerChannelPartnerCode: String(record.dealerChannelPartnerCode ?? '').trim(),
      mobile: String(record.mobile ?? '').trim(),
      checkIn: String(record.checkIn ?? '').trim(),
    };
    rows.push(preparedRow);
    if (!rowsByMonth.has(month)) rowsByMonth.set(month, []);
    rowsByMonth.get(month).push(preparedRow);
  }
  return { rows, rowsByMonth, months: [...months].sort(), invalidDateRows };
}

export function calculateQ1Q3Reports(prepared, month) {
  const buckets = getKpiBuckets(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const q1VisitDaysByBucket = Object.fromEntries(buckets.map(({ key }) => [key, new Map()]));
  const q1ManagerDaysByBucket = Object.fromEntries(buckets.map(({ key }) => [key, new Map()]));
  const q1SeniorNameDays = new Set();
  const q1JuniorDesignationExcludedRows = [];
  const q3Sets = Object.fromEntries(buckets.map(({ key }) => [key, new Set()]));
  const q3AuditByBucket = Object.fromEntries(buckets.map(({ key }) => [key, new Map()]));
  const q1SourceRows = [];
  const q2SourceRows = [];
  const q3SourceRowsByBucket = Object.fromEntries(buckets.map(({ key }) => [key, []]));
  const excludedZonalManagerSourceRows = [];
  const q2 = Object.fromEntries(buckets.map(({ key }) => [key, 0]));
  const q2SourceRowsByBucket = Object.fromEntries(buckets.map(({ key }) => [key, []]));
  let q1QualifyingRows = 0;
  let q2Dealer = 0;
  let q2Other = 0;
  let q3QualifyingRows = 0;
  let excludedZonalManagerRows = 0;
  const excludedZonalManagerBreakdown = new Map();
  const monthRows = prepared.rowsByMonth?.get(month) || [];
  const rawBreakdowns = {
    designations: new Map(),
    jointWorkingNames: new Map(),
    jointWorkingDesignations: new Map(),
    types: new Map(),
    designationJointType: new Map(),
    seniorType: new Map(),
  };
  const q2ByDesignationTypeSenior = new Map();
  const excludedQ2Rows = [];
  const q2ExclusionReasons = new Map();
  let yesRows = 0;
  let yesNamedRows = 0;
  let q2SeniorRows = 0;
  let q2JuniorRows = 0;
  let q2NamedRoleRows = 0;
  let q2TypeExcludedRows = 0;
  let q2JointNamedDealerOtherRows = 0;
  const increment = (map, key) => map.set(key, (map.get(key) || 0) + 1);

  for (const row of monthRows) {
    if (row.day > daysInMonth) continue;
    if (REPORT_EXCLUDED_ZONAL_MANAGERS.has(row.zonalManagerKey)) {
      excludedZonalManagerRows += 1;
      increment(excludedZonalManagerBreakdown, row.zonalManager || '(blank)');
      excludedZonalManagerSourceRows.push({ sourceRow: row.sourceRow, date: row.dateLabel, employee: row.salesUserName, empId: row.empId, designation: row.designationLabel || '(blank)', jointWorkingDesignation: row.jointWorkingDesignationLabel || '(blank)', jointWorking: row.jointWorkingLabel || '(blank)', jointWorkingName: row.seniorLabel || '(blank)', type: row.typeLabel || '(blank)', zonalManager: row.zonalManager || '(blank)', reason: 'Excluded by Zonal Manager rule' });
      continue;
    }
    const matchingBuckets = buckets.filter(({ from, to }) => row.day >= from && row.day <= to);
    increment(rawBreakdowns.types, row.typeLabel || '(blank)');
    if (row.jointWorking === 'YES') {
      yesRows += 1;
      increment(rawBreakdowns.designations, row.designationLabel || '(blank)');
      increment(rawBreakdowns.jointWorkingNames, row.seniorLabel || '(blank)');
      increment(rawBreakdowns.jointWorkingDesignations, row.jointWorkingDesignationLabel || '(blank)');
      increment(rawBreakdowns.designationJointType, `${row.designationLabel || '(blank)'} | ${row.jointWorkingLabel || '(blank)'} | ${row.typeLabel || '(blank)'}`);
      increment(rawBreakdowns.seniorType, `${row.seniorLabel || '(blank)'} | ${row.typeLabel || '(blank)'}`);
    }
    if (row.jointWorking === 'YES' && row.seniorName) yesNamedRows += 1;
    // Q1/Q2 roles come from the source row: Designation belongs to Sales User
    // (Manager), while Joint Working Designation belongs to Joint Working Name
    // (Executive/BDO).
    const isManagerByDesignation = hasApprovedDesignation(row.designation, REPORT_MANAGER_GROUP);
    const isBdoByJointDesignation = hasApprovedDesignation(row.jointWorkingDesignation, REPORT_BDO_DESIGNATIONS);
    const hasJointPartnerName = Boolean(row.seniorName);
    const isQualifyingJointWork = isManagerByDesignation && row.jointWorking === 'YES' && isBdoByJointDesignation && hasJointPartnerName;
    const isQualifyingQ1 = isQualifyingJointWork && row.type === 'DEALER';
    const q2Type = row.type === 'DEALER' || row.type === 'OTHER';
    const rowBase = { sourceRow: row.sourceRow, date: row.dateLabel, employee: row.salesUserName, empId: row.empId, designation: row.designationLabel || '(blank)', jointWorkingDesignation: row.jointWorkingDesignationLabel || '(blank)', jointWorking: row.jointWorkingLabel || '(blank)', jointWorkingName: row.seniorLabel || '(blank)', type: row.typeLabel || '(blank)', zonalManager: row.zonalManager || '(blank)', company: row.companyName || '(blank)', dealerChannelPartnerCode: row.dealerChannelPartnerCode || '(blank)', dealerChannelPartner: row.dealerChannelPartner || '(blank)' };
    const q1Reasons = [];
    if (!isManagerByDesignation) q1Reasons.push('Sales User Designation is not on the approved Q1/Q2 Senior list');
    if (row.jointWorking !== 'YES') q1Reasons.push('Joint Working is not YES');
    if (!hasJointPartnerName) q1Reasons.push('Joint Working Name is blank');
    if (!isBdoByJointDesignation) q1Reasons.push('Joint Working Designation is not an approved Executive/BDO designation');
    if (isQualifyingJointWork && row.type !== 'DEALER') q1Reasons.push('Type is not DEALER');
    q1SourceRows.push({ ...rowBase, eligible: isQualifyingQ1, reason: isQualifyingQ1 ? 'Included: Manager + date contributes once per bucket' : q1Reasons.join('; ') });
    const q2Reasons = [...q1Reasons];
    if (isQualifyingJointWork && !q2Type) q2Reasons.push('Type is not DEALER or OTHER');
    q2SourceRows.push({ ...rowBase, eligible: isQualifyingJointWork && q2Type, reason: isQualifyingJointWork && q2Type ? 'Included: qualifying source row counted once' : q2Reasons.join('; ') });
    if (row.jointWorking === 'YES' && isManagerByDesignation && hasJointPartnerName && row.type === 'DEALER') {
      q1SeniorNameDays.add(`${row.managerIdentityKey}\u0000${row.dateKey}`);
      if (!isBdoByJointDesignation) q1JuniorDesignationExcludedRows.push({ date: row.dateLabel, employee: row.salesUserName, empId: row.empId, designation: row.designationLabel || '(blank)', jointWorking: row.jointWorkingLabel || '(blank)', senior: row.seniorLabel || '(blank)', jointWorkingDesignation: row.jointWorkingDesignationLabel || '(blank)', type: row.typeLabel || '(blank)', reason: 'Joint Working Designation is not an approved Executive/BDO designation' });
    }
    if (isQualifyingJointWork && !q2Type) q2TypeExcludedRows += 1;
    if (row.jointWorking === 'YES' && isManagerByDesignation) q2SeniorRows += 1;
    if (row.jointWorking === 'YES' && isManagerByDesignation && isBdoByJointDesignation) q2JuniorRows += 1;
    if (row.jointWorking === 'YES' && isManagerByDesignation && isBdoByJointDesignation && hasJointPartnerName) q2NamedRoleRows += 1;
    if (row.jointWorking === 'YES' && row.seniorName && q2Type) {
      q2JointNamedDealerOtherRows += 1;
      const groupKey = `${row.designationLabel || '(blank)'}\u0000${row.jointWorkingDesignationLabel || '(blank)'}\u0000${row.designationSalesTypeLabel || '(blank)'}\u0000${row.typeLabel || '(blank)'}\u0000${row.seniorLabel || '(blank)'}`;
      const currentGroup = q2ByDesignationTypeSenior.get(groupKey) || { designation: row.designationLabel || '(blank)', jointWorkingDesignation: row.jointWorkingDesignationLabel || '(blank)', designationSalesType: row.designationSalesTypeLabel || '(blank)', type: row.typeLabel || '(blank)', senior: row.seniorLabel || '(blank)', count: 0, juniorDesignation: isManagerByDesignation && isBdoByJointDesignation };
      currentGroup.count += 1;
      q2ByDesignationTypeSenior.set(groupKey, currentGroup);
    }
    if (row.jointWorking === 'YES' && (!isQualifyingJointWork || !q2Type)) {
      const reasons = [];
      if (!isManagerByDesignation) reasons.push('Sales User Designation is not an approved Manager designation');
      if (!isBdoByJointDesignation) reasons.push('Joint Working Designation is not an approved Executive/BDO designation');
      if (!hasJointPartnerName) reasons.push('Joint Working Name is blank');
      if (isQualifyingJointWork && !q2Type) reasons.push('Type is not DEALER or OTHER');
      const reason = reasons.join('; ');
      increment(q2ExclusionReasons, reason);
      excludedQ2Rows.push({ date: row.dateLabel, employee: row.salesUserName, empId: row.empId, designation: row.designationLabel || '(blank)', jointWorkingDesignation: row.jointWorkingDesignationLabel || '(blank)', designationSalesType: row.designationSalesTypeLabel || '(blank)', type: row.typeLabel || '(blank)', jointWorking: row.jointWorkingLabel || '(blank)', senior: row.seniorLabel || '(blank)', company: row.companyName || row.dealerChannelPartner || '(blank)', reason });
    }
    if (isQualifyingQ1) {
      q1QualifyingRows += 1;
      for (const bucket of matchingBuckets) {
        const visitKey = `${row.managerIdentityKey}\u0000${row.dateKey}`;
        const visitDay = q1VisitDaysByBucket[bucket.key].get(visitKey) || { senior: row.salesUserName, empId: row.empId, date: row.dateKey, rawRows: 0, count: 1 };
        visitDay.rawRows += 1;
        q1VisitDaysByBucket[bucket.key].set(visitKey, visitDay);

        const managerDays = q1ManagerDaysByBucket[bucket.key].get(row.managerIdentityKey) || {
          manager: row.salesUserName,
          empId: row.empId,
          dates: new Set(),
          types: new Set(),
          qualifyingRows: 0,
        };
        managerDays.dates.add(row.dateKey);
        if (row.type) managerDays.types.add(row.typeLabel || row.type);
        managerDays.qualifyingRows += 1;
        q1ManagerDaysByBucket[bucket.key].set(row.managerIdentityKey, managerDays);
      }
    }
    if (isQualifyingJointWork && q2Type) {
        for (const bucket of matchingBuckets) {
          q2[bucket.key] += 1;
          q2SourceRowsByBucket[bucket.key].push({
            date: row.dateKey,
            employee: row.salesUserName,
            empId: row.empId,
            managerDesignation: row.designationLabel,
            juniorDesignation: row.jointWorkingDesignationLabel,
            jointWorkingName: row.seniorLabel,
            type: row.typeLabel,
            company: row.companyName,
            distributorCode: row.dealerChannelPartnerCode,
            distributor: row.dealerChannelPartner,
            zonalManager: row.zonalManager,
          });
        }
        if (row.type === 'DEALER') q2Dealer += 1;
        else q2Other += 1;
    }
    const q3DesignationApproved = REPORT_Q3_SENIORS.has(row.designation);
    const q3BusinessMatch = q3DesignationApproved && row.type === 'CHANNEL PARTNER';
    if (q3BusinessMatch) {
      q3QualifyingRows += 1;
      if (row.distributor) for (const bucket of matchingBuckets) {
        const isUnique = !q3Sets[bucket.key].has(row.distributor);
        q3Sets[bucket.key].add(row.distributor);
        q3SourceRowsByBucket[bucket.key].push({ ...rowBase, distributorIdentifier: row.distributorLabel, eligible: true, uniqueContribution: isUnique, reason: isUnique ? 'Included: first occurrence of this distributor in bucket' : 'Qualifying row; distributor already counted in this bucket' });
        const partner = q3AuditByBucket[bucket.key].get(row.distributor) || { senior: row.salesUserName || '(blank)', empId: row.empId, designation: row.designationLabel, identifier: row.distributorLabel, type: row.typeLabel, rawRows: 0 };
        partner.rawRows += 1;
        q3AuditByBucket[bucket.key].set(row.distributor, partner);
      }
      if (!row.distributor) for (const bucket of matchingBuckets) q3SourceRowsByBucket[bucket.key].push({ ...rowBase, distributorIdentifier: '(blank)', eligible: false, uniqueContribution: false, reason: 'Distributor identifier is blank (all identifier fields are blank)' });
    } else {
        const reasons = [];
        if (!q3DesignationApproved) reasons.push('Sales User Designation is not on the approved Q3 Senior list');
        if (row.type !== 'CHANNEL PARTNER') reasons.push('Type is not CHANNEL PARTNER');
        if (!row.distributor) reasons.push('Distributor identifier is blank (all identifier fields are blank)');
        const auditRow = { ...rowBase, distributorIdentifier: row.distributorLabel || '(blank)', eligible: false, uniqueContribution: false, reason: reasons.join('; ') || 'Row did not qualify' };
        for (const bucket of matchingBuckets) q3SourceRowsByBucket[bucket.key].push(auditRow);
    }
  }

  const q1BySeniorByBucket = Object.fromEntries(buckets.map(({ key }) => [key,
    [...q1VisitDaysByBucket[key].values()].sort((a, b) => a.date.localeCompare(b.date) || a.senior.localeCompare(b.senior)),
  ]));
  const q1ManagerSummariesByBucket = Object.fromEntries(buckets.map(({ key }) => [key,
    [...q1ManagerDaysByBucket[key]].map(([managerKey, { manager, empId, dates, types, qualifyingRows }]) => ({
      managerKey,
      manager,
      empId,
      visitDays: dates.size,
      types: [...types].sort().join(', '),
      qualifyingRows,
      dates: [...dates].sort().join(', '),
    })).sort((a, b) => a.manager.localeCompare(b.manager) || a.empId.localeCompare(b.empId)),
  ]));
  const q1Values = Object.fromEntries(buckets.map(({ key }) => [key,
    q1ManagerSummariesByBucket[key].reduce((total, manager) => total + manager.visitDays, 0),
  ]));
  // Half-month KPIs add their weekly subtotals, so repeat types/managers and
  // distributors are counted once in each week.
  q1Values.firstHalf = q1Values.week1 + q1Values.week2;
  q1Values.secondHalf = q1Values.week3 + q1Values.week4;
  // Q2 is a row count, so the existing row-by-row bucket pass already makes
  // both half totals equal the sum of their two weekly row counts.
  q2.firstHalf = q2.week1 + q2.week2;
  q2SourceRowsByBucket.firstHalf = [...q2SourceRowsByBucket.week1, ...q2SourceRowsByBucket.week2];
  q2SourceRowsByBucket.secondHalf = [...q2SourceRowsByBucket.week3, ...q2SourceRowsByBucket.week4];
  const combineManagerWeeks = (weekKeys) => {
    const grouped = new Map();
    for (const weekKey of weekKeys) {
      for (const manager of q1ManagerSummariesByBucket[weekKey]) {
        const summary = grouped.get(manager.managerKey) || {
          managerKey: manager.managerKey, manager: manager.manager, empId: manager.empId,
          qualifyingRows: 0, dates: new Set(), weeks: {},
        };
        summary.weeks[weekKey] = { visitDays: manager.visitDays, types: manager.types };
        summary.qualifyingRows += manager.qualifyingRows;
        manager.dates.split(', ').filter(Boolean).forEach((date) => summary.dates.add(date));
        grouped.set(manager.managerKey, summary);
      }
    }
    return [...grouped.values()].map((manager) => ({
      ...manager,
      visitDays: weekKeys.reduce((sum, key) => sum + (manager.weeks[key]?.visitDays || 0), 0),
      types: weekKeys.map((key) => `${buckets.find((bucket) => bucket.key === key)?.label || key}: ${manager.weeks[key]?.types || '—'}`).join('; '),
      dates: [...manager.dates].sort().join(', '),
    })).sort((a, b) => a.manager.localeCompare(b.manager) || a.empId.localeCompare(b.empId));
  };
  q1ManagerSummariesByBucket.firstHalf = combineManagerWeeks(['week1', 'week2']);
  q1ManagerSummariesByBucket.secondHalf = combineManagerWeeks(['week3', 'week4']);
  q1BySeniorByBucket.firstHalf = [...q1BySeniorByBucket.week1, ...q1BySeniorByBucket.week2];
  q1BySeniorByBucket.secondHalf = [...q1BySeniorByBucket.week3, ...q1BySeniorByBucket.week4];
  const q1UniqueManagerDateCount = q1ManagerSummariesByBucket.firstHalf.reduce((sum, manager) => sum + manager.visitDays, 0)
    + q1ManagerSummariesByBucket.secondHalf.reduce((sum, manager) => sum + manager.visitDays, 0);
  const q3UniqueByBucket = Object.fromEntries(buckets.map(({ key }) => [key,
    [...q3AuditByBucket[key]].map(([distributor, data]) => ({ distributor, ...data })).sort((a, b) => a.distributor.localeCompare(b.distributor)),
  ]));
  q3UniqueByBucket.week1 = q3UniqueByBucket.week1.map((partner) => ({ ...partner, sourceWeek: 'WEEK-1' }));
  q3UniqueByBucket.week2 = q3UniqueByBucket.week2.map((partner) => ({ ...partner, sourceWeek: 'WEEK-2' }));
  q3UniqueByBucket.week3 = q3UniqueByBucket.week3.map((partner) => ({ ...partner, sourceWeek: 'WEEK-3' }));
  q3UniqueByBucket.week4 = q3UniqueByBucket.week4.map((partner) => ({ ...partner, sourceWeek: buckets.find((bucket) => bucket.key === 'week4')?.label || 'WEEK-4' }));
  q3UniqueByBucket.firstHalf = [...q3UniqueByBucket.week1, ...q3UniqueByBucket.week2];
  q3UniqueByBucket.secondHalf = [...q3UniqueByBucket.week3, ...q3UniqueByBucket.week4];
  const q3Values = Object.fromEntries(buckets.map(({ key }) => [key, q3Sets[key].size]));
  q3Values.firstHalf = q3Values.week1 + q3Values.week2;
  q3Values.secondHalf = q3Values.week3 + q3Values.week4;
  const designationAuditMap = new Map();
  for (const row of monthRows) {
    for (const [field, label, value, approved] of [
      ['Sales User Designation', row.designationLabel || '(blank)', row.designation, REPORT_MANAGER_GROUP],
      ['Joint Working Designation', row.jointWorkingDesignationLabel || '(blank)', row.jointWorkingDesignation, REPORT_BDO_DESIGNATIONS],
    ]) {
      const key = `${field}\u0000${label}`;
      const item = designationAuditMap.get(key) || { field, designation: label, rows: 0, approved: false, q1q2Senior: false, q3Senior: false, executiveBdo: false, sampleEmployees: new Set(), sampleSourceRows: new Set() };
      item.rows += 1;
      item.q1q2Senior ||= field === 'Sales User Designation' && hasApprovedDesignation(value, REPORT_MANAGER_GROUP);
      item.q3Senior ||= field === 'Sales User Designation' && hasApprovedDesignation(value, REPORT_Q3_SENIORS);
      item.executiveBdo ||= field === 'Joint Working Designation' && hasApprovedDesignation(value, REPORT_BDO_DESIGNATIONS);
      item.approved = item.q1q2Senior || item.q3Senior || item.executiveBdo;
      if (row.salesUserName) item.sampleEmployees.add(row.salesUserName);
      item.sampleSourceRows.add(row.sourceRow);
      designationAuditMap.set(key, item);
    }
  }
  const designationAudit = [...designationAuditMap.values()].map((item) => ({
    ...item,
    sampleEmployees: [...item.sampleEmployees].slice(0, 5).join(', '),
    sampleSourceRows: [...item.sampleSourceRows].slice(0, 5).join(', '),
    approvalContext: [item.q1q2Senior && 'Q1/Q2 Senior', item.q3Senior && 'Q3 Senior', item.executiveBdo && 'Executive/BDO Joint Working'].filter(Boolean).join('; ') || 'Not on approved lists',
  })).sort((a, b) => Number(a.approved) - Number(b.approved) || b.rows - a.rows || a.designation.localeCompare(b.designation));
  const dataQualityAudit = [];
  for (const row of monthRows) {
    const base = { sourceRow: row.sourceRow, date: row.dateLabel, employee: row.salesUserName || '(blank)', empId: row.empId || '(blank)', designation: row.designationLabel || '(blank)', jointWorkingDesignation: row.jointWorkingDesignationLabel || '(blank)', jointWorking: row.jointWorkingLabel || '(blank)', jointWorkingName: row.seniorLabel || '(blank)', type: row.typeLabel || '(blank)' };
    if (!row.empId && !row.salesUserKey) dataQualityAudit.push({ ...base, issue: 'Manager identity is missing: both Emp ID and Sales User Name are blank' });
    else if (!row.empId) dataQualityAudit.push({ ...base, issue: 'Emp ID is blank; normalized Sales User Name is used as the identity fallback' });
    if (row.jointWorking === 'YES' && !row.seniorName) dataQualityAudit.push({ ...base, issue: 'Joint Working is YES but Joint Working Name is blank' });
    if (row.jointWorking === 'YES' && !row.jointWorkingDesignation) dataQualityAudit.push({ ...base, issue: 'Joint Working is YES but Joint Working Designation is blank' });
    if (REPORT_Q3_SENIORS.has(row.designation) && row.type === 'CHANNEL PARTNER' && !row.distributor) dataQualityAudit.push({ ...base, issue: 'Q3 role/type qualifies but all distributor identifier fields are blank' });
  }
  return {
    month,
    values: {
      q1: q1Values,
      q2,
      q3: q3Values,
    },
    details: {
      totalMonthRows: monthRows.filter((row) => row.day <= daysInMonth).length,
      excludedZonalManagerRows,
      excludedZonalManagerBreakdown: [...excludedZonalManagerBreakdown].map(([manager, count]) => ({ manager, count })).sort((a, b) => a.manager.localeCompare(b.manager)),
      excludedZonalManagerSourceRows,
      yesRows,
      yesNamedRows,
      q2SeniorRows,
      q2JuniorRows,
      q2NamedRoleRows,
      q2JointNamedDealerOtherRows,
      q2TypeExcludedRows,
      q2ByDesignationTypeSenior: [...q2ByDesignationTypeSenior.values()].sort((a, b) => a.designation.localeCompare(b.designation) || a.type.localeCompare(b.type) || a.senior.localeCompare(b.senior)),
      excludedQ2Rows: excludedQ2Rows.sort((a, b) => a.designation.localeCompare(b.designation) || a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee)),
      q2ExclusionReasons: [...q2ExclusionReasons].map(([reason, count]) => ({ reason, count })),
      rawBreakdowns: Object.fromEntries(Object.entries(rawBreakdowns).map(([key, map]) => [key, [...map].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))])),
      q1QualifyingRows,
      q1SourceRows,
      q1SeniorNameDayCeiling: q1SeniorNameDays.size,
      q1JuniorDesignationExcludedRows: q1JuniorDesignationExcludedRows.sort((a, b) => a.designation.localeCompare(b.designation) || a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee)),
      q1BySeniorByBucket,
      q1ManagerSummariesByBucket,
      q1UniqueManagerDateCount,
      q2QualifyingRows: q2Dealer + q2Other,
      q2Dealer,
      q2Other,
      q2SourceRowsByBucket,
      q2SourceRows,
      q3QualifyingRows,
      q3UniqueDistributors: q3Values.firstHalf + q3Values.secondHalf,
      q3UniqueByBucket,
      q3SourceRowsByBucket,
      invalidDateRows: prepared.invalidDateRows || [],
      designationAudit,
      dataQualityAudit,
      q3UniquenessScope: 'Global across all qualifying Senior users within each bucket; a distributor is counted once per bucket regardless of which Senior visited it.',
      approvedDesignationRules: Q1_Q3_REPORT_DESIGNATION_RULES,
    },
  };
}

export function getQ1Q3ExportRows(result, monthLabel) {
  if (!result) return [];
  const buckets = getKpiBuckets(result.month);
  return [
    ['Month', 'KPI', ...buckets.map(({ label }) => label)],
    [monthLabel, 'Q.1 TOTAL NO. OF VISIT DAYS OF JOINT WORKING (BDO WITH SENIOR PERSON)', ...buckets.map(({ key }) => result.values.q1[key])],
    [monthLabel, 'Q.2 NO. OF RETAILER VISITED, BDO WITH SENIOR SALES PERSON', ...buckets.map(({ key }) => result.values.q2[key])],
    [monthLabel, 'Q.3 NO. OF DISTRIBUTOR VISITED, PHYSICALLY BY SENIOR PERSON (UNIQUE NUMBER)', ...buckets.map(({ key }) => result.values.q3[key])],
  ];
}

export function getQ1Q3DetailExportRows(result, question, monthLabel) {
  if (!result) return [];
  const buckets = getKpiBuckets(result.month);
  if (question === 'q1') {
    const rows = [['Month', 'Bucket', 'Manager', 'Emp ID', 'Unique Visit Days', 'Dates', 'Qualifying Rows', 'Types']];
    for (const bucket of buckets) {
      for (const manager of result.details.q1ManagerSummariesByBucket[bucket.key]) {
        rows.push([monthLabel, bucket.label, manager.manager, manager.empId, manager.visitDays, manager.dates, manager.qualifyingRows, manager.types]);
      }
    }
    return rows;
  }
  if (question === 'q2') {
    return [
      ['Month', 'Bucket', 'Date', 'Sales User / Manager', 'Emp ID', 'Manager Designation', 'Joint Working Designation', 'Joint Working Name', 'Type', 'Company', 'Dealer Channel Partner Code', 'Dealer Channel Partner', 'Zonal Manager'],
      ...buckets.flatMap((bucket) => result.details.q2SourceRowsByBucket[bucket.key].map((row) => [monthLabel, bucket.label, row.date, row.employee, row.empId, row.managerDesignation, row.juniorDesignation, row.jointWorkingName, row.type, row.company, row.distributorCode, row.distributor, row.zonalManager])),
    ];
  }
  if (question === 'q3') {
    return [
      ['Month', 'Bucket', 'Senior Sales User', 'Emp ID', 'Designation', 'Unique Distributor Identifier', 'Type', 'Source Rows'],
      ...buckets.flatMap((bucket) => result.details.q3UniqueByBucket[bucket.key].map((row) => [monthLabel, bucket.label, row.senior, row.empId, row.designation, row.identifier, row.type, row.rawRows])),
    ];
  }
  return [];
}
