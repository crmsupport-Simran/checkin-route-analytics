import * as XLSX from 'xlsx';

export const KPI_BUCKETS = [
  { key: 'week1', label: 'WEEK-1', from: 1, to: 7 },
  { key: 'week2', label: 'WEEK-2', from: 8, to: 14 },
  { key: 'firstHalf', label: '1-15TH', from: 1, to: 15 },
  { key: 'week3', label: 'WEEK-3', from: 16, to: 22 },
  { key: 'week4', label: 'WEEK-4', from: 23, to: 30 },
  { key: 'secondHalf', label: '16-30TH', from: 16, to: 30 },
];

const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase();
const JUNIOR_DESIGNATIONS = new Set([
  'EXECUTIVE-SALES', 'EXECUTIVE-SALES (4)',
  'BUSINESS DEVELOPMENT OFFICER', 'BUSINESS DEVELOPMENT OFFICER (4)',
  'SR. EXECUTIVE-SALES', 'SR. EXECUTIVE-SALES (4)',
]);
const SENIOR_DESIGNATIONS = new Set([
  'DEPUTY MANAGER-SALES (4)', 'DEPUTY MANAGER-SALES', 'MANAGER-SALES',
  'ASSISTANT MANAGER-SALES', 'ASSISTANT MANAGER-SALES (4)', 'MANAGER-SALES (4)',
  'ASSISTANT MANAGER-SALES (NBD) (4)', 'AGM-SALES', 'SR.MANAGER-SALES (9)', 'DGM-SALES',
]);

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
      designation: normalize(record.designation),
      jointWorking: normalize(record.jointWorking),
      seniorName: normalize(record.jointWorkingName),
      seniorLabel: String(record.jointWorkingName ?? '').trim().replace(/\s+/g, ' '),
      type: normalize(record.type),
      distributor: normalize(record.dealerChannelPartnerCode) || normalize(record.dealerChannelPartner) || normalize(record.companyName),
    };
    rows.push(preparedRow);
    if (!rowsByMonth.has(month)) rowsByMonth.set(month, []);
    rowsByMonth.get(month).push(preparedRow);
  }
  return { rows, rowsByMonth, months: [...months].sort() };
}

const newCounts = () => Object.fromEntries(KPI_BUCKETS.map(({ key }) => [key, 0]));
const newMaps = () => Object.fromEntries(KPI_BUCKETS.map(({ key }) => [key, new Map()]));

export function calculateJointWorkingKpis(prepared, month) {
  const q1BucketTypesBySenior = newMaps();
  const q3Sets = Object.fromEntries(KPI_BUCKETS.map(({ key }) => [key, new Set()]));
  const q2 = newCounts();
  const q1SeniorLabels = new Map();
  let q1QualifyingRows = 0;
  let q2Dealer = 0;
  let q2Other = 0;
  let q3QualifyingRows = 0;

  for (const row of (prepared.rowsByMonth?.get(month) || [])) {
    if (row.day > 30) continue;
    const matchingBuckets = KPI_BUCKETS.filter(({ from, to }) => row.day >= from && row.day <= to);
    const isJuniorJoint = JUNIOR_DESIGNATIONS.has(row.designation) && row.jointWorking === 'YES' && Boolean(row.seniorName);
    if (isJuniorJoint) {
      q1QualifyingRows += 1;
      if (row.type) {
        if (!q1SeniorLabels.has(row.seniorName)) q1SeniorLabels.set(row.seniorName, row.seniorLabel);
        for (const bucket of matchingBuckets) {
          const managerTypes = q1BucketTypesBySenior[bucket.key].get(row.seniorName) || new Set();
          managerTypes.add(row.type);
          q1BucketTypesBySenior[bucket.key].set(row.seniorName, managerTypes);
        }
      }
      if (row.type === 'DEALER' || row.type === 'OTHER') {
        for (const bucket of matchingBuckets) q2[bucket.key] += 1;
        if (row.type === 'DEALER') q2Dealer += 1;
        else q2Other += 1;
      }
    }
    if (SENIOR_DESIGNATIONS.has(row.designation) && row.type === 'CHANNEL PARTNER') {
      q3QualifyingRows += 1;
      if (row.distributor) for (const bucket of matchingBuckets) q3Sets[bucket.key].add(row.distributor);
    }
  }

  const q1BySeniorByBucket = Object.fromEntries(KPI_BUCKETS.map(({ key }) => [key,
    [...q1BucketTypesBySenior[key]].map(([seniorKey, types]) => ({
      senior: q1SeniorLabels.get(seniorKey) || seniorKey,
      types: [...types].sort(),
      count: types.size,
    })).sort((a, b) => b.count - a.count || a.senior.localeCompare(b.senior)),
  ]));
  const q1Values = Object.fromEntries(KPI_BUCKETS.map(({ key }) => [key,
    [...q1BucketTypesBySenior[key].values()].reduce((total, types) => total + types.size, 0),
  ]));
  return {
    month,
    values: {
      q1: q1Values,
      q2,
      q3: Object.fromEntries(KPI_BUCKETS.map(({ key }) => [key, q3Sets[key].size])),
    },
    details: {
      q1QualifyingRows,
      q1BySeniorByBucket,
      q2QualifyingRows: q2Dealer + q2Other,
      q2Dealer,
      q2Other,
      q3QualifyingRows,
      q3UniqueDistributors: q3Sets.firstHalf.size + q3Sets.secondHalf.size,
    },
  };
}
