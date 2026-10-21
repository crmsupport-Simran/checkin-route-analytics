import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQ1Q3Reports, prepareQ1Q3ReportRows } from '../src/services/q1Q3ReportsService.js';

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
