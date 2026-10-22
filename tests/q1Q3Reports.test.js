import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQ1Q3Reports, getQ1WeeklyReconciliationRows, prepareQ1Q3ReportRows, Q1_WEEKLY_RECONCILIATION } from '../src/services/q1Q3ReportsService.js';
import { calculateManagerExecutiveQ1, prepareManagerExecutiveQ1Rows } from '../src/services/managerExecutiveQ1Service.js';

const managerRow = (overrides = {}) => ({
  date: '01/10/2026', salesUserName: 'Manager A', empId: '100', designation: 'MANAGER-SALES',
  jointWorking: 'YES', jointWorkingName: 'Executive A', jointWorkingDesignation: 'EXECUTIVE-SALES (4)', type: 'DEALER',
  ...overrides,
});

test('new Q1–Q3 report has its own Manager + TSO/TSI/TSM rules and Q1 is Dealer-only', () => {
  const records = [
    managerRow({ sourceIndex: 0 }),
    managerRow({ sourceIndex: 1 }), // same Manager/date: Q1 still one visit-day, Q2 counts the second source row
    managerRow({ sourceIndex: 2, type: 'OTHER' }), // Q2 only; not a Q1 Dealer visit-day
    managerRow({ sourceIndex: 3, empId: '200', salesUserName: 'Territory Sales Officer', designation: ' territory   sales officer (4) ' }),
    managerRow({ sourceIndex: 4, empId: '300', salesUserName: 'Territory Sales Manager', designation: 'TERRITORY SALES MANAGER' }),
    managerRow({ sourceIndex: 5, empId: '400', salesUserName: 'Territory Sales Incharge', designation: 'TERRITORY SALES INCHARGE' }),
    managerRow({ sourceIndex: 6, empId: '500', salesUserName: 'Non BDO partner', jointWorkingDesignation: 'DEPUTY MANAGER-SALES' }),
  ];
  const prepared = prepareQ1Q3ReportRows(records);
  const result = calculateQ1Q3Reports(prepared, '2026-10');

  assert.equal(result.values.q1.week1, 4, 'Manager and TSO/TSM/TSI group are eligible; duplicate same Manager/date counts once; OTHER and invalid BDO role do not count for Q1');
  assert.equal(result.values.q2.week1, 6, 'Q2 counts each eligible Dealer/Other Check-In source row');
  assert.equal(result.details.q1SourceRows.filter((row) => row.eligible).length, 5, 'source audit eligibility is row-based while Q1 subtotal is Manager/date-based');
  assert.equal(result.details.q2SourceRows.filter((row) => row.eligible).length, 6);
});

test('Q1–Q3 calculations use a separate service and keep half totals additive', () => {
  const records = [
    managerRow({ sourceIndex: 0, date: '07/10/2026' }),
    managerRow({ sourceIndex: 1, date: '08/10/2026', empId: '200', salesUserName: 'Territory Sales Officer', designation: 'TERRITORY SALES OFFICER' }),
    managerRow({ sourceIndex: 2, date: '16/10/2026', type: 'CHANNEL PARTNER', dealerChannelPartnerCode: 'CP-1' }),
    { sourceIndex: 3, date: '17/10/2026', salesUserName: 'Senior B', empId: '300', designation: 'DEPUTY MANAGER-SALES', type: 'CHANNEL PARTNER', dealerChannelPartner: 'cp-1' },
  ];
  const result = calculateQ1Q3Reports(prepareQ1Q3ReportRows(records), '2026-10');
  for (const kpi of ['q1', 'q2', 'q3']) {
    assert.equal(result.values[kpi].firstHalf, result.values[kpi].week1 + result.values[kpi].week2);
    assert.equal(result.values[kpi].secondHalf, result.values[kpi].week3 + result.values[kpi].week4);
  }
  assert.equal(result.values.q3.week3, 1, 'same normalized distributor across two Senior users is globally unique within the week');
  assert.equal(result.details.q3UniquenessScope.startsWith('Global'), true);
});

test('Q1 accepts a qualifying Executive/BDO token in mixed Joint Working Designation values', () => {
  const records = [
    managerRow({ sourceIndex: 0, jointWorkingDesignation: 'EXECUTIVE-SALES (4), AGM-SALES' }),
    managerRow({ sourceIndex: 1, date: '02/10/2026', empId: '200', salesUserName: 'Manager B', jointWorkingDesignation: 'AGM-SALES, EXECUTIVE-SALES' }),
    managerRow({ sourceIndex: 2, date: '03/10/2026', empId: '300', salesUserName: 'Manager C', jointWorkingDesignation: 'TERRITORY SALES MANAGER' }),
  ];
  const result = calculateQ1Q3Reports(prepareQ1Q3ReportRows(records), '2026-10');
  assert.equal(result.values.q1.week1, 2);
  const eligible = result.details.q1SourceRows.filter((row) => row.eligible);
  assert.equal(eligible.length, 2);
  assert.equal(eligible[0].matchedExecutiveBdoTokens, 'EXECUTIVE-SALES (4)');
  assert.equal(eligible[1].matchedExecutiveBdoTokens, 'EXECUTIVE-SALES');
  assert.equal(result.details.q1SourceRows.find((row) => row.sourceRow === 4).eligible, false);
});

test('Q1 tokenizes mixed designations exactly and accepts approved senior Executive/BDO tokens', () => {
  const allowed = [
    'EXECUTIVE-SALES', 'EXECUTIVE-SALES (4)', 'SR. EXECUTIVE-SALES (4)',
    'SR. EXECUTIVE-BACKOFFICE', 'BUSINESS DEVELOPMENT OFFICER',
    'EXECUTIVE-SALES (4), AGM-SALES', 'AGM-SALES, EXECUTIVE-SALES',
    'AGM-SALES, EXECUTIVE-SALES (4)', 'TERRITORY SALES MANAGER, EXECUTIVE-SALES',
  ];
  const records = allowed.map((jointWorkingDesignation, index) => managerRow({
    sourceIndex: index, date: `${String(index + 1).padStart(2, '0')}/10/2026`,
    empId: `TOKEN-${index}`, salesUserName: `Token Manager ${index}`, jointWorkingDesignation,
  })).concat([
    managerRow({ sourceIndex: allowed.length, date: '10/10/2026', empId: 'ONLY-AGM', jointWorkingDesignation: 'AGM-SALES' }),
    managerRow({ sourceIndex: allowed.length + 1, date: '11/10/2026', empId: 'ONLY-TSM', jointWorkingDesignation: 'TERRITORY SALES MANAGER' }),
    managerRow({ sourceIndex: allowed.length + 2, date: '12/10/2026', empId: '', salesUserName: '' }),
  ]);
  const result = calculateQ1Q3Reports(prepareQ1Q3ReportRows(records), '2026-10');
  assert.equal(result.values.q1.week1 + result.values.q1.week2, allowed.length);
  assert.equal(result.details.q1SourceRows.find((row) => row.empId === 'ONLY-AGM').eligible, false);
  assert.equal(result.details.q1SourceRows.find((row) => row.empId === 'ONLY-TSM').eligible, false);
  assert.equal(result.details.q1SourceRows.find((row) => row.sourceRow === allowed.length + 4).reason.includes('both blank'), true);
});

test('Q1 stage diagnostics reconcile week boundaries, qualifying rows, duplicates and final KPI', () => {
  const records = [
    managerRow({ sourceIndex: 0, date: '07/10/2026' }),
    managerRow({ sourceIndex: 1, date: '07/10/2026' }), // duplicate same Manager/date
    managerRow({ sourceIndex: 2, date: '08/10/2026', empId: 'W2A' }),
    managerRow({ sourceIndex: 3, date: '15/10/2026', empId: 'W2B' }),
    managerRow({ sourceIndex: 4, date: '16/10/2026', empId: 'W3A' }),
    managerRow({ sourceIndex: 5, date: '23/10/2026', empId: 'W3B' }),
    managerRow({ sourceIndex: 6, date: '24/10/2026', empId: 'W4A' }),
    managerRow({ sourceIndex: 7, date: '31/10/2026', empId: 'W4B' }),
  ];
  const result = calculateQ1Q3Reports(prepareQ1Q3ReportRows(records), '2026-10');
  assert.deepEqual(['week1', 'week2', 'week3', 'week4'].map((key) => result.values.q1[key]), [1, 2, 2, 2]);
  assert.deepEqual(['week1', 'week2', 'week3', 'week4'].map((key) => {
    const diagnostic = result.details.q1WeeklyDiagnostics[key];
    assert.equal(diagnostic.qualifyingSourceRows - diagnostic.duplicateSourceRowsRemoved, diagnostic.finalUniqueManagerDays);
    assert.equal(diagnostic.finalUniqueManagerDays, result.values.q1[key]);
    return [diagnostic.rowsInBucket, diagnostic.qualifyingSourceRows, diagnostic.duplicateSourceRowsRemoved];
  }), [[2, 2, 1], [2, 2, 0], [2, 2, 0], [2, 2, 0]]);
  assert.equal(result.details.q1SourceRows.length, records.length);
  assert.equal(result.details.q1SourceRows.filter((row) => row.uniqueContribution).length, 7);
  const duplicateGroup = result.details.q1SourceRows.filter((row) => row.date === '07/10/2026');
  assert.deepEqual(duplicateGroup.map((row) => row.groupingKey), ['ID:100 | 2026-10-07', 'ID:100 | 2026-10-07']);
  assert.deepEqual(duplicateGroup.map((row) => row.uniqueContribution), [true, false]);
});

test('existing Manager-only Q1 stays separate while the new Q1 report includes TSO/TSI/TSM', () => {
  const records = [
    managerRow({ sourceIndex: 0, empId: 'MGR' }),
    managerRow({ sourceIndex: 1, empId: 'TSO', salesUserName: 'Territory Officer', designation: 'TERRITORY SALES OFFICER' }),
  ];
  const newReport = calculateQ1Q3Reports(prepareQ1Q3ReportRows(records), '2026-10');
  const managerOnly = calculateManagerExecutiveQ1(prepareManagerExecutiveQ1Rows(records), '2026-10');
  assert.equal(managerOnly.values.week1, 1, 'existing KPI retains its Manager-only filter');
  assert.equal(newReport.values.q1.week1, 2, 'new Q1 includes both Manager and TSO rows');
});

test('Q1 October expected references reconcile with actual weekly values and total in exports', () => {
  const records = [
    managerRow({ sourceIndex: 0, date: '01/10/2026' }),
    managerRow({ sourceIndex: 1, date: '08/10/2026', empId: '200', salesUserName: 'Manager B' }),
    managerRow({ sourceIndex: 2, date: '16/10/2026', empId: '300', salesUserName: 'Manager C' }),
  ];
  const result = calculateQ1Q3Reports(prepareQ1Q3ReportRows(records), '2026-10');
  const rows = getQ1WeeklyReconciliationRows(result, 'October 2026');
  assert.deepEqual(rows[0], ['Month', 'WEEKLY SOURCE', 'EXPECTED', 'ACTUAL', 'DIFFERENCE', 'STATUS']);
  assert.deepEqual(rows.slice(1).map(([, bucket, expected, actual, difference, status]) => [bucket, expected, actual, difference, status]), [
    ['WEEK-1', 61, 1, -60, 'MISMATCH'],
    ['WEEK-2 (8-15)', 81, 1, -80, 'MISMATCH'],
    ['WEEK-3 (16-23)', 58, 1, -57, 'MISMATCH'],
    ['WEEK-4 (24-31)', 0, 0, 0, 'MATCHED'],
    ['TOTAL', 200, 3, -197, 'MISMATCH'],
  ]);
  assert.equal(Q1_WEEKLY_RECONCILIATION.expectedTotal, 200);
});

test('Q1 reproduces the supplied October weekly reference when the source has those distinct Manager-days', () => {
  const records = [];
  const addDays = (firstDay, lastDay, count) => {
    for (let index = 0; index < count; index += 1) {
      const day = firstDay + (index % (lastDay - firstDay + 1));
      records.push(managerRow({
        sourceIndex: records.length,
        date: `${String(day).padStart(2, '0')}/10/2026`,
        empId: `M-${records.length}`,
        salesUserName: `Manager ${records.length}`,
      }));
    }
  };
  addDays(1, 7, 61);
  addDays(8, 15, 81);
  addDays(16, 23, 58);
  const result = calculateQ1Q3Reports(prepareQ1Q3ReportRows(records), '2026-10');
  const rows = getQ1WeeklyReconciliationRows(result, 'October 2026');
  assert.deepEqual([result.values.q1.week1, result.values.q1.week2, result.values.q1.week3, result.values.q1.week4], [61, 81, 58, 0]);
  assert.deepEqual(rows.slice(1).map(([, , , , , status]) => status), ['MATCHED', 'MATCHED', 'MATCHED', 'MATCHED', 'MATCHED']);
});
