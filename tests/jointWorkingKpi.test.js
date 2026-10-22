import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateJointWorkingKpis,
  getJointWorkingKpiDetailExportRows,
  getJointWorkingKpiExportRows,
  prepareJointWorkingRows,
} from '../src/services/jointWorkingKpi.js';

function makeRows(month) {
  const [year, monthNumber] = month.split('-');
  const date = (day) => `${day}-${monthNumber}-${year}`;
  const rows = [];
  for (const day of [1, 8, 15, 16, 23]) {
    rows.push({
      date: date(day), salesUserName: 'Manager A', empId: '100', designation: 'MANAGER-SALES',
      jointWorking: 'YES', jointWorkingName: 'Executive A', jointWorkingDesignation: 'EXECUTIVE-SALES (4)',
      type: 'DEALER',
    });
    rows.push({
      date: date(day), salesUserName: 'Manager A', empId: '100', designation: 'MANAGER-SALES',
      type: 'CHANNEL PARTNER', dealerChannelPartnerCode: 'CP-001', companyName: 'Partner One',
    });
    rows.push({
      date: date(day), salesUserName: 'Manager A', empId: '100', designation: 'MANAGER-SALES',
      jointWorking: 'YES', jointWorkingName: 'Executive A', jointWorkingDesignation: 'EXECUTIVE-SALES (4)',
      type: 'OTHER',
    });
  }
  return rows;
}

test('1-15TH adds the two weekly KPI totals, detail summaries, and CSV values', () => {
  // Include variable month lengths and leap February to guard calendar buckets.
  for (const month of ['2026-10', '2026-09', '2026-02', '2024-02']) {
    const prepared = prepareJointWorkingRows(makeRows(month));
    const result = calculateJointWorkingKpis(prepared, month);

    for (const kpi of ['q1', 'q2', 'q3']) {
      assert.equal(result.values[kpi].firstHalf, result.values[kpi].week1 + result.values[kpi].week2, `${month} ${kpi}`);
      assert.equal(result.values[kpi].secondHalf, result.values[kpi].week3 + result.values[kpi].week4, `${month} ${kpi} second half`);
    }
    assert.equal(result.values.q1.week1, 1);
    assert.equal(result.values.q1.week2, 2);
    assert.equal(result.values.q1.firstHalf, 3);
    assert.equal(result.values.q2.week2, 4);
    assert.equal(result.values.q2.firstHalf, 6);
    assert.equal(result.values.q3.firstHalf, 2);
    assert.equal(result.values.q1.secondHalf, 2);
    assert.equal(result.values.q2.secondHalf, 4);
    // Day 16 and day 23 are in the same WEEK-3 (16-23) bucket, so the
    // distributor is counted once in the second-half weekly subtotal.
    assert.equal(result.values.q3.secondHalf, 1);
    assert.equal(result.details.q1ManagerSummariesByBucket.week1[0].visitDays, result.values.q1.week1);
    assert.equal(result.details.q1ManagerSummariesByBucket.week1[0].types, 'DEALER, OTHER');
    assert.equal(result.details.q1ManagerSummariesByBucket.firstHalf[0].visitDays, result.values.q1.firstHalf);
    assert.equal(result.details.q1ManagerSummariesByBucket.secondHalf[0].visitDays, result.values.q1.secondHalf);
    assert.deepEqual(result.details.q3UniqueByBucket.firstHalf.map((row) => row.sourceWeek), ['WEEK-1', 'WEEK-2']);
    assert.equal(result.details.q3UniqueByBucket.secondHalf.length, result.values.q3.secondHalf);

    const csvRows = getJointWorkingKpiExportRows(result, 'October 2026');
    for (const [index, kpi] of ['q1', 'q2', 'q3'].entries()) {
      assert.equal(csvRows[index + 1][4], result.values[kpi].firstHalf, `${month} exported ${kpi}`);
      assert.equal(csvRows[index + 1][7], result.values[kpi].secondHalf, `${month} exported ${kpi} second half`);
    }
    assert.equal(getJointWorkingKpiDetailExportRows(result, 'q1', 'October 2026')[0][4], 'Unique Visit Days');
    assert.equal(getJointWorkingKpiDetailExportRows(result, 'q2', 'October 2026').length - 1, Object.values(result.values.q2).reduce((sum, value) => sum + value, 0));
    assert.equal(getJointWorkingKpiDetailExportRows(result, 'q3', 'October 2026').length - 1, Object.values(result.values.q3).reduce((sum, value) => sum + value, 0));
  }
});

test('existing Joint Working KPI retains its pre-dashboard Manager calculation and exports', () => {
  const records = [
    { date: '01/10/2026', salesUserName: 'Manager A', empId: '100', designation: 'MANAGER-SALES', jointWorking: 'YES', jointWorkingName: 'Executive A', jointWorkingDesignation: 'EXECUTIVE-SALES', type: 'DEALER' },
    { date: '01/10/2026', salesUserName: 'Manager A', empId: '100', designation: 'MANAGER-SALES', jointWorking: 'YES', jointWorkingName: 'Executive A', jointWorkingDesignation: 'EXECUTIVE-SALES', type: 'DEALER' },
    { date: '09/10/2026', salesUserName: 'Manager A', empId: '100', designation: 'MANAGER-SALES', jointWorking: 'YES', jointWorkingName: 'Executive A', jointWorkingDesignation: 'EXECUTIVE-SALES', type: 'OTHER' },
  ];
  const result = calculateJointWorkingKpis(prepareJointWorkingRows(records), '2026-10');
  assert.equal(result.values.q1.week1, 1);
  assert.equal(result.values.q1.week2, 1);
  assert.equal(result.values.q1.firstHalf, 2);
  assert.equal(result.values.q2.week1, 2);
  assert.equal(result.values.q2.week2, 1);
  assert.equal(result.values.q2.firstHalf, 3);
  const exportRows = getJointWorkingKpiExportRows(result, 'October 2026');
  assert.equal(exportRows[1][4], 2);
  assert.equal(exportRows[2][4], 3);
});

test('territory-inclusive copy adds Territory roles while the original KPI remains manager-only', () => {
  const records = [
    { date: '02/10/2026', salesUserName: 'Manager A', empId: '100', designation: 'MANAGER-SALES', jointWorking: 'YES', jointWorkingName: 'Executive A', jointWorkingDesignation: 'EXECUTIVE-SALES', type: 'DEALER', dealerChannelPartnerCode: 'M-CP' },
    { date: '02/10/2026', salesUserName: 'Manager A', empId: '100', designation: 'MANAGER-SALES', type: 'CHANNEL PARTNER', dealerChannelPartnerCode: 'M-CP' },
    { date: '02/10/2026', salesUserName: 'Territory Officer', empId: '200', designation: 'TERRITORY SALES OFFICER', jointWorking: 'YES', jointWorkingName: 'Executive B', jointWorkingDesignation: 'EXECUTIVE-SALES (4)', type: 'DEALER', dealerChannelPartnerCode: 'T-CP' },
    { date: '02/10/2026', salesUserName: 'Territory Officer', empId: '200', designation: 'TERRITORY SALES OFFICER', type: 'CHANNEL PARTNER', dealerChannelPartnerCode: 'T-CP' },
  ];
  const prepared = prepareJointWorkingRows(records);
  const managersOnly = calculateJointWorkingKpis(prepared, '2026-10');
  const managersAndTerritory = calculateJointWorkingKpis(prepared, '2026-10', { includeTerritory: true });

  assert.equal(managersOnly.values.q1.week1, 1);
  assert.equal(managersOnly.values.q2.week1, 1);
  assert.equal(managersOnly.values.q3.week1, 1);
  assert.equal(managersAndTerritory.values.q1.week1, 2);
  assert.equal(managersAndTerritory.values.q2.week1, 2);
  assert.equal(managersAndTerritory.values.q3.week1, 2);
  for (const question of ['q1', 'q2', 'q3']) {
    for (const bucket of Object.keys(managersOnly.values[question])) {
      assert.ok(managersAndTerritory.values[question][bucket] >= managersOnly.values[question][bucket], `${question} ${bucket} must not drop when Territory roles are added`);
    }
  }
});
