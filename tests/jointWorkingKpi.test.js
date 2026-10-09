import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateJointWorkingKpis,
  getJointWorkingKpiExportRows,
  prepareJointWorkingRows,
} from '../src/services/jointWorkingKpi.js';

function makeRows(month) {
  const [year, monthNumber] = month.split('-');
  const date = (day) => `${day}-${monthNumber}-${year}`;
  const rows = [];
  for (const day of [1, 8, 16, 23]) {
    rows.push({
      date: date(day), salesUserName: 'Manager A', empId: '100', designation: 'MANAGER-SALES',
      jointWorking: 'YES', jointWorkingName: 'Executive A', jointWorkingDesignation: 'EXECUTIVE-SALES (4)',
      type: 'DEALER',
    });
    rows.push({
      date: date(day), salesUserName: 'Manager A', empId: '100', designation: 'MANAGER-SALES',
      type: 'CHANNEL PARTNER', dealerChannelPartnerCode: 'CP-001', companyName: 'Partner One',
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
    assert.equal(result.values.q1.week2, 1);
    assert.equal(result.values.q1.firstHalf, 2);
    assert.equal(result.values.q2.firstHalf, 2);
    assert.equal(result.values.q3.firstHalf, 2);
    assert.equal(result.values.q1.secondHalf, 2);
    assert.equal(result.values.q2.secondHalf, 2);
    assert.equal(result.values.q3.secondHalf, 2);
    assert.equal(result.details.q1ManagerSummariesByBucket.firstHalf[0].typeCount, result.values.q1.firstHalf);
    assert.equal(result.details.q1ManagerSummariesByBucket.secondHalf[0].typeCount, result.values.q1.secondHalf);
    assert.deepEqual(result.details.q3UniqueByBucket.firstHalf.map((row) => row.sourceWeek), ['WEEK-1', 'WEEK-2']);
    assert.equal(result.details.q3UniqueByBucket.secondHalf.length, result.values.q3.secondHalf);

    const csvRows = getJointWorkingKpiExportRows(result, 'October 2026');
    for (const [index, kpi] of ['q1', 'q2', 'q3'].entries()) {
      assert.equal(csvRows[index + 1][4], result.values[kpi].firstHalf, `${month} exported ${kpi}`);
      assert.equal(csvRows[index + 1][7], result.values[kpi].secondHalf, `${month} exported ${kpi} second half`);
    }
  }
});
