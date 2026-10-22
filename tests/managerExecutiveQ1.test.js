import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateManagerExecutiveQ1, getManagerExecutiveQ1ExportRows, MANAGER_EXECUTIVE_Q1_RULES, prepareManagerExecutiveQ1Rows } from '../src/services/managerExecutiveQ1Service.js';

const row = (overrides = {}) => ({
  date: '01/10/2026', salesUserName: 'Manager A', empId: 'M-1', designation: 'MANAGER-SALES',
  jointWorking: 'YES', jointWorkingName: 'Executive A', jointWorkingDesignation: 'EXECUTIVE-SALES (4)', type: 'OFFICE',
  zonalManager: 'Zonal A', ...overrides,
});
const calculate = (records, month = '2026-10') => calculateManagerExecutiveQ1(prepareManagerExecutiveQ1Rows(records), month);

test('new Q1 accepts every approved Manager-only designation, without automatically adding territory titles', () => {
  const records = MANAGER_EXECUTIVE_Q1_RULES.managerDesignations.map((designation, index) => row({
    sourceIndex: index, empId: `M-${index}`, salesUserName: `Manager ${index}`, designation,
  }));
  records.push(row({ sourceIndex: records.length, empId: 'TSO-1', designation: 'TERRITORY SALES OFFICER' }));
  records.push(row({ sourceIndex: records.length, empId: 'TSI-1', designation: 'TERRITORY SALES INCHARGE' }));
  records.push(row({ sourceIndex: records.length, empId: 'TSM-1', designation: 'TERRITORY SALES MANAGER' }));
  const result = calculate(records);
  assert.equal(result.values.week1, MANAGER_EXECUTIVE_Q1_RULES.managerDesignations.length);
  assert.equal(result.details.qualifyingSourceRows, MANAGER_EXECUTIVE_Q1_RULES.managerDesignations.length);
});

test('Q1 token-matches mixed Joint Working Designation cells and counts unique Manager + date', () => {
  const designationCases = [
    'EXECUTIVE-SALES', 'EXECUTIVE-SALES (4)', 'SR. EXECUTIVE-SALES (4)',
    'SR. EXECUTIVE-BACKOFFICE', 'BUSINESS DEVELOPMENT OFFICER',
    'EXECUTIVE-SALES (4), EXECUTIVE-SALES (4)', 'EXECUTIVE-SALES (4), AGM-SALES',
    'AGM-SALES, EXECUTIVE-SALES', 'AGM-SALES, EXECUTIVE-SALES (4)',
    'TERRITORY SALES MANAGER, EXECUTIVE-SALES',
  ];
  const records = designationCases.map((designation, index) => row({ sourceIndex: index, jointWorkingDesignation: designation }));
  records.push(row({ sourceIndex: 10, jointWorkingDesignation: 'AGM-SALES' }));
  records.push(row({ sourceIndex: 11, jointWorkingDesignation: 'TERRITORY SALES MANAGER' }));
  records.push(row({ sourceIndex: 12, jointWorkingDesignation: '  executive-sales (4) ,  agm-sales  ', date: '02/10/2026' }));
  const result = calculate(records);
  assert.equal(result.values.week1, 2, 'two distinct dates for the same manager count as two, despite multiple check-ins and matches');
  assert.equal(result.details.qualifyingSourceRows, 11);
  const included = result.details.sourceRowsByBucket.week1.filter((source) => source.eligible);
  assert.equal(included.filter((source) => source.uniqueContribution).length, 2);
  assert.equal(result.details.sourceRowsByBucket.week1.find((source) => source.jointWorkingDesignation === 'AGM-SALES').eligible, false);
  assert.equal(result.details.sourceRowsByBucket.week1.find((source) => source.jointWorkingDesignation === 'TERRITORY SALES MANAGER').eligible, false);
});

test('Q1 enforces YES, named partner, zonal exclusions and date boundaries', () => {
  const records = [
    row({ sourceIndex: 0, date: '07/10/2026' }),
    row({ sourceIndex: 1, date: '08/10/2026', empId: 'M-2', salesUserName: 'Manager B' }),
    row({ sourceIndex: 2, date: '15/10/2026', empId: 'M-3', salesUserName: 'Manager C' }),
    row({ sourceIndex: 3, date: '16/10/2026', empId: 'M-4', salesUserName: 'Manager D' }),
    row({ sourceIndex: 4, date: '23/10/2026', empId: 'M-5', salesUserName: 'Manager E' }),
    row({ sourceIndex: 5, date: '24/10/2026', empId: 'M-6', salesUserName: 'Manager F' }),
    row({ sourceIndex: 6, jointWorking: 'NO', empId: 'M-7' }),
    row({ sourceIndex: 7, jointWorkingName: ' ', empId: 'M-8' }),
    row({ sourceIndex: 8, zonalManager: ' shobhIt   goel ', empId: 'M-9' }),
  ];
  const result = calculate(records);
  assert.deepEqual([result.values.week1, result.values.week2, result.values.week3, result.values.week4], [1, 2, 2, 1]);
  assert.equal(result.details.excludedZonalRows.length, 1);
});

test('Q1 week four ends at each selected month’s actual last day, including leap February', () => {
  const february = calculate([
    row({ date: '23/02/2024' }), row({ sourceIndex: 1, date: '24/02/2024', empId: 'M-2', salesUserName: 'Manager B' }),
    row({ sourceIndex: 2, date: '29/02/2024', empId: 'M-3', salesUserName: 'Manager C' }),
    row({ sourceIndex: 3, date: '30/02/2024', empId: 'M-4', salesUserName: 'Manager D' }),
  ], '2024-02');
  assert.deepEqual(february.buckets.map(({ label }) => label), ['WEEK-1', 'WEEK-2 (8-15)', 'WEEK-3 (16-23)', 'WEEK-4 (24-29)']);
  assert.deepEqual([february.values.week3, february.values.week4], [1, 2]);
  assert.equal(february.details.invalidDateRows.length, 1, 'the impossible February 30 date is reported instead of being assigned to a week');
});

test('Q1 export uses the same four weekly results and total as the dashboard', () => {
  const result = calculate([
    row({ date: '07/10/2026' }), row({ sourceIndex: 1, date: '08/10/2026', empId: 'M-2', salesUserName: 'Manager B' }),
    row({ sourceIndex: 2, date: '16/10/2026', empId: 'M-3', salesUserName: 'Manager C' }),
  ]);
  const exported = getManagerExecutiveQ1ExportRows(result, 'October 2026')[1];
  assert.deepEqual(exported.slice(2, 6), [result.values.week1, result.values.week2, result.values.week3, result.values.week4]);
  assert.equal(exported[6], result.total);
});

