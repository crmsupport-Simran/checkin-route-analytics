import * as XLSX from 'xlsx';

export function getKpiBuckets(month) {
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  const daysInMonth = year && monthNumber ? new Date(year, monthNumber, 0).getDate() : 31;
  return [
    { key: 'week1', label: 'WEEK-1', from: 1, to: 7 },
    { key: 'week2', label: 'WEEK-2', from: 8, to: 14 },
    { key: 'firstHalf', label: '1-15TH', from: 1, to: Math.min(15, daysInMonth) },
    { key: 'week3', label: 'WEEK-3', from: 16, to: 22 },
    { key: 'week4', label: `WEEK-4 (23-${daysInMonth})`, from: 23, to: daysInMonth },
    { key: 'secondHalf', label: `16-${daysInMonth}TH`, from: 16, to: daysInMonth },
  ];
}

const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase();
const normalizeDesignation = normalize;
const JUNIOR_DESIGNATIONS = new Set([
  'EXECUTIVE-SALES', 'EXECUTIVE-SALES (4)',
  'BUSINESS DEVELOPMENT OFFICER', 'BUSINESS DEVELOPMENT OFFICER (4)',
  'SR. EXECUTIVE-SALES', 'SR. EXECUTIVE-SALES (4)',
]);
const Q1_Q2_SENIOR_DESIGNATIONS = new Set([
  'GM - SALES', 'DGM-SALES', 'AGM-SALES', 'SR.MANAGER-SALES (9)',
  'MANAGER-SALES', 'MANAGER-SALES (4)', 'DEPUTY MANAGER-SALES', 'DEPUTY MANAGER-SALES (4)',
  'ASSISTANT MANAGER-SALES', 'ASSISTANT MANAGER-SALES (4)', 'ASSISTANT MANAGER-SALES (NBD)',
  'ASSISTANT MANAGER-SALES (NBD) (4)', 'SR. ASSISTANT MANAGER-SALES',
  'SR. TERRITORY SALES INCHARGE (4)', 'TERRITORY SALES INCHARGE', 'TERRITORY SALES INCHARGE (4)',
  'TERRITORY SALES MANAGER', 'TERRITORY SALES MANAGER (4)', 'TERRITORY SALES OFFICER',
  'TERRITORY SALES OFFICER (4)', 'TERRITORY SALES OFFICER (NBD) (4)',
]);
const SENIOR_DESIGNATIONS = new Set([
  'DEPUTY MANAGER-SALES (4)', 'DEPUTY MANAGER-SALES', 'MANAGER-SALES',
  'ASSISTANT MANAGER-SALES', 'ASSISTANT MANAGER-SALES (4)', 'MANAGER-SALES (4)',
  'ASSISTANT MANAGER-SALES (NBD) (4)', 'AGM-SALES', 'SR.MANAGER-SALES (9)', 'DGM-SALES',
]);
const EXCLUDED_ZONAL_MANAGERS = new Set([
  'SHOBHIT GOEL',
  'OTHERS',
  'ARCHIT GARG',
  'SHANTANU ATTARY',
]);

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

export function prepareJointWorkingRows(records = []) {
  const months = new Set();
  const rows = [];
  const rowsByMonth = new Map();
  for (const record of records) {
    const date = parseDate(record.date) || parseDate(record.dateKey);
    if (!date) continue;
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.add(month);
    const preparedRow = {
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
    };
    rows.push(preparedRow);
    if (!rowsByMonth.has(month)) rowsByMonth.set(month, []);
    rowsByMonth.get(month).push(preparedRow);
  }
  return { rows, rowsByMonth, months: [...months].sort() };
}

export function calculateJointWorkingKpis(prepared, month) {
  const buckets = getKpiBuckets(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const q1VisitDaysByBucket = Object.fromEntries(buckets.map(({ key }) => [key, new Map()]));
  const q1ManagerDaysByBucket = Object.fromEntries(buckets.map(({ key }) => [key, new Map()]));
  const q1SeniorNameDays = new Set();
  const q1JuniorDesignationExcludedRows = [];
  const q3Sets = Object.fromEntries(buckets.map(({ key }) => [key, new Set()]));
  const q3AuditByBucket = Object.fromEntries(buckets.map(({ key }) => [key, new Map()]));
  const q2 = Object.fromEntries(buckets.map(({ key }) => [key, 0]));
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
    if (EXCLUDED_ZONAL_MANAGERS.has(row.zonalManagerKey)) {
      excludedZonalManagerRows += 1;
      increment(excludedZonalManagerBreakdown, row.zonalManager || '(blank)');
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
    const isManagerByDesignation = hasApprovedDesignation(row.designation, Q1_Q2_SENIOR_DESIGNATIONS);
    const isBdoByJointDesignation = hasApprovedDesignation(row.jointWorkingDesignation, JUNIOR_DESIGNATIONS);
    const hasJointPartnerName = Boolean(row.seniorName);
    const isQualifyingJointWork = isManagerByDesignation && row.jointWorking === 'YES' && isBdoByJointDesignation && hasJointPartnerName;
    const q2Type = row.type === 'DEALER' || row.type === 'OTHER';
    if (row.jointWorking === 'YES' && isManagerByDesignation && hasJointPartnerName) {
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
    if (isQualifyingJointWork) {
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
      if (q2Type) {
        for (const bucket of matchingBuckets) q2[bucket.key] += 1;
        if (row.type === 'DEALER') q2Dealer += 1;
        else q2Other += 1;
      }
    }
    if (SENIOR_DESIGNATIONS.has(row.designation) && row.type === 'CHANNEL PARTNER') {
      q3QualifyingRows += 1;
      if (row.distributor) for (const bucket of matchingBuckets) {
        q3Sets[bucket.key].add(row.distributor);
        const partner = q3AuditByBucket[bucket.key].get(row.distributor) || { senior: row.salesUserName || '(blank)', designation: row.designationLabel, identifier: row.distributorLabel, type: row.typeLabel, rawRows: 0 };
        partner.rawRows += 1;
        q3AuditByBucket[bucket.key].set(row.distributor, partner);
      }
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
      typeCount: types.size,
      types: [...types].sort().join(', '),
      qualifyingRows,
      dates: [...dates].sort().join(', '),
    })).sort((a, b) => a.manager.localeCompare(b.manager) || a.empId.localeCompare(b.empId)),
  ]));
  const q1Values = Object.fromEntries(buckets.map(({ key }) => [key,
    q1ManagerSummariesByBucket[key].reduce((total, manager) => total + manager.typeCount, 0),
  ]));
  // The half-month KPI is intentionally additive: it represents both weekly
  // subtotals, so repeat types/managers are counted once in each week.
  q1Values.firstHalf = q1Values.week1 + q1Values.week2;
  q2.firstHalf = q2.week1 + q2.week2;
  const q1HalfManagers = new Map();
  for (const weekKey of ['week1', 'week2']) {
    for (const manager of q1ManagerSummariesByBucket[weekKey]) {
      const summary = q1HalfManagers.get(manager.managerKey) || {
        managerKey: manager.managerKey, manager: manager.manager, empId: manager.empId,
        week1TypeCount: 0, week2TypeCount: 0, week1Types: '', week2Types: '',
        qualifyingRows: 0, dates: new Set(),
      };
      summary[weekKey === 'week1' ? 'week1TypeCount' : 'week2TypeCount'] = manager.typeCount;
      summary[weekKey === 'week1' ? 'week1Types' : 'week2Types'] = manager.types;
      summary.qualifyingRows += manager.qualifyingRows;
      manager.dates.split(', ').filter(Boolean).forEach((date) => summary.dates.add(date));
      q1HalfManagers.set(manager.managerKey, summary);
    }
  }
  q1ManagerSummariesByBucket.firstHalf = [...q1HalfManagers.values()].map((manager) => ({
    ...manager,
    typeCount: manager.week1TypeCount + manager.week2TypeCount,
    types: `WEEK-1: ${manager.week1Types || '—'}; WEEK-2: ${manager.week2Types || '—'}`,
    dates: [...manager.dates].sort().join(', '),
  })).sort((a, b) => a.manager.localeCompare(b.manager) || a.empId.localeCompare(b.empId));
  const q1UniqueManagerDateCount = q1VisitDaysByBucket.firstHalf.size + q1VisitDaysByBucket.secondHalf.size;
  const q3UniqueByBucket = Object.fromEntries(buckets.map(({ key }) => [key,
    [...q3AuditByBucket[key]].map(([distributor, data]) => ({ distributor, ...data })).sort((a, b) => a.distributor.localeCompare(b.distributor)),
  ]));
  q3UniqueByBucket.week1 = q3UniqueByBucket.week1.map((partner) => ({ ...partner, sourceWeek: 'WEEK-1' }));
  q3UniqueByBucket.week2 = q3UniqueByBucket.week2.map((partner) => ({ ...partner, sourceWeek: 'WEEK-2' }));
  q3UniqueByBucket.firstHalf = [...q3UniqueByBucket.week1, ...q3UniqueByBucket.week2];
  const q3Values = Object.fromEntries(buckets.map(({ key }) => [key, q3Sets[key].size]));
  q3Values.firstHalf = q3Values.week1 + q3Values.week2;
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
      q1SeniorNameDayCeiling: q1SeniorNameDays.size,
      q1JuniorDesignationExcludedRows: q1JuniorDesignationExcludedRows.sort((a, b) => a.designation.localeCompare(b.designation) || a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee)),
      q1BySeniorByBucket,
      q1ManagerSummariesByBucket,
      q1UniqueManagerDateCount,
      q2QualifyingRows: q2Dealer + q2Other,
      q2Dealer,
      q2Other,
      q3QualifyingRows,
      q3UniqueDistributors: q3Values.firstHalf + q3Values.secondHalf,
      q3UniqueByBucket,
    },
  };
}

export function getJointWorkingKpiExportRows(result, monthLabel) {
  if (!result) return [];
  const buckets = getKpiBuckets(result.month);
  return [
    ['Month', 'KPI', ...buckets.map(({ label }) => label)],
    [monthLabel, 'Q.1 TOTAL NO. OF VISIT DAYS OF JOINT WORKING (BDO WITH SENIOR PERSON)', ...buckets.map(({ key }) => result.values.q1[key])],
    [monthLabel, 'Q.2 NO. OF RETAILER VISITED, BDO WITH SENIOR SALES PERSON', ...buckets.map(({ key }) => result.values.q2[key])],
    [monthLabel, 'Q.3 NO. OF DISTRIBUTOR VISITED, PHYSICALLY BY SENIOR PERSON (UNIQUE NUMBER)', ...buckets.map(({ key }) => result.values.q3[key])],
  ];
}
