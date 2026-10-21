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

test('Q1 uses Manager Sales User identity and Q3 is globally unique per bucket', () => {
  const source = [
    { sourceIndex: 0, id: '0-10', date: '01/10/2026', salesUserName: 'Manager A', empId: '10', designation: ' manager-sales ', jointWorking: ' yes ', jointWorkingName: 'Executive A', jointWorkingDesignation: 'EXECUTIVE-SALES (4)', type: 'DEALER' },
    { sourceIndex: 1, id: '1-10', date: '01/10/2026', salesUserName: 'Manager A', empId: '10', designation: 'MANAGER-SALES', jointWorking: 'YES', jointWorkingName: 'Executive B', jointWorkingDesignation: 'EXECUTIVE-SALES', type: 'OTHER' },
    { sourceIndex: 2, id: '2-20', date: '01/10/2026', salesUserName: 'Manager B', empId: '20', designation: 'AGM-SALES', jointWorking: 'YES', jointWorkingName: 'Executive C', jointWorkingDesignation: 'BUSINESS DEVELOPMENT OFFICER', type: 'DEALER' },
    { sourceIndex: 3, id: '3-30', date: '01/10/2026', salesUserName: 'Senior A', empId: '30', designation: 'MANAGER-SALES', type: 'CHANNEL PARTNER', dealerChannelPartnerCode: ' cp-01 ' },
    { sourceIndex: 4, id: '4-40', date: '02/10/2026', salesUserName: 'Senior B', empId: '40', designation: 'DEPUTY MANAGER-SALES', type: 'CHANNEL PARTNER', dealerChannelPartner: 'CP-01' },
    { sourceIndex: 5, id: '5-50', date: '01/10/2026', salesUserName: 'Manager C', empId: '50', designation: 'MANAGER-SALES', jointWorking: 'YES', jointWorkingName: 'Executive D', jointWorkingDesignation: 'EXECUTIVE-SALES', type: 'DEALER', zonalManager: ' ShobhIt   Goel ' },
    { sourceIndex: 6, id: '6-60', date: '', dateKey: '2026-10-01', salesUserName: 'No Date', empId: '60', checkIn: new Date('2026-10-01T10:00:00'), designation: 'MANAGER-SALES' },
  ];
  const prepared = prepareJointWorkingRows(source);
  const result = calculateJointWorkingKpis(prepared, '2026-10');
  assert.equal(result.values.q1.week1, 2, 'same manager and date is one, separate Emp IDs count separately');
  assert.equal(result.values.q2.week1, 3, 'all eligible Dealer/Other source rows count');
  assert.equal(result.values.q3.week1, 1, 'same normalized distributor is counted once across different Seniors');
  assert.equal(result.details.excludedZonalManagerSourceRows.length, 1);
  assert.equal(result.details.invalidDateRows.length, 1, 'a Check-In timestamp/dateKey cannot substitute for a blank Date');
  assert.equal(result.details.q1SourceRows[0].sourceRow, 2);
  assert.equal(result.details.q3UniquenessScope.includes('Global'), true);
  assert.equal(result.details.q3UniqueByBucket.week1[0].rawRows, 2);
});
