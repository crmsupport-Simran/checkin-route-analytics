import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQ2WeeklyDistributorGroups, getQ2WeeklyDistributorSummaryRows, Q2_WEEKLY_DISTRIBUTOR_RULES } from '../src/services/q2WeeklyDistributorGroups.js';

const headers = ['Date', 'Sales User Name', 'Emp ID', 'Designation', 'Type', 'Company Name', 'Dealer Channel Partner', 'Dealer Channel Partner Code', 'Zonal Manager'];
const row = (overrides = {}) => ({
  date: '01/10/2026', salesUserName: 'Manager A', empId: 'M-1', designation: 'AGM-SALES',
  type: 'CHANNEL PARTNER', companyName: 'Partner A', dealerChannelPartner: '', dealerChannelPartnerCode: '', zonalManager: 'ZONE A',
  ...overrides,
});
const calculate = (records, month = '2026-10', cols = headers) => calculateQ2WeeklyDistributorGroups(records, month, cols);

test('uses reference composite identity and counts the same partner separately for separate Senior Sales Users', () => {
  const result = calculate([
    row({ sourceIndex: 0, companyName: '  Partner   A ' }),
    row({ sourceIndex: 1, companyName: 'partner a' }),
    row({ sourceIndex: 2, salesUserName: 'Manager B', empId: 'M-2', companyName: 'PARTNER A' }),
    row({ sourceIndex: 3, type: 'DEALER', companyName: 'Dealer Row' }),
    row({ sourceIndex: 4, designation: 'TERRITORY SALES OFFICER (4)', companyName: 'Partner TSO' }),
  ]);
  const week1 = result.summaries.week1;
  assert.equal(week1.actual, 3);
  assert.equal(week1.rawSourceRowCount, 5);
  assert.equal(week1.rowsAfterEligibilityFilters, 4);
  assert.equal(week1.duplicateRowsRemoved, 1);
  assert.equal(result.groupRowsByBucket.week1[0].rowCount, 2);
  assert.equal(result.groupRowsByBucket.week1.length, 3);
  assert.equal(result.summaries.week2.actual, 0);
  assert.equal(result.summaries.week2.status, 'MISMATCH');
});

test('uses Code then Dealer Channel Partner then Company Name and audits blank identifiers', () => {
  const result = calculate([
    row({ sourceIndex: 0, dealerChannelPartnerCode: ' CP-7 ', dealerChannelPartner: 'Other Name', companyName: 'Company' }),
    row({ sourceIndex: 1, date: '08/10/2026', dealerChannelPartner: ' Partner B ', companyName: 'Other Company' }),
    row({ sourceIndex: 2, date: '15/10/2026', companyName: ' Partner C ' }),
    row({ sourceIndex: 3, date: '16/10/2026', companyName: '   ' }),
  ]);
  assert.equal(result.groupRowsByBucket.week1[0].identifier, 'CP-7');
  assert.equal(result.groupRowsByBucket.week2[0].identifier, 'PARTNER B');
  assert.equal(result.summaries.week2.actual, 2, 'day 15 belongs to WEEK-2');
  assert.equal(result.summaries.week3.blankOrInvalidIdentifierRows, 1);
  assert.equal(result.summaries.week3.actual, 0);
});

test('respects calendar boundaries including February and dynamic week four end', () => {
  const october = calculate([
    row({ date: '07/10/2026' }), row({ sourceIndex: 1, date: '08/10/2026', companyName: 'B' }),
    row({ sourceIndex: 2, date: '15/10/2026', companyName: 'C' }), row({ sourceIndex: 3, date: '16/10/2026', companyName: 'D' }),
    row({ sourceIndex: 4, date: '23/10/2026', companyName: 'E' }), row({ sourceIndex: 5, date: '24/10/2026', companyName: 'F' }),
    row({ sourceIndex: 6, date: '31/10/2026', companyName: 'G' }),
  ]);
  assert.deepEqual(october.buckets.map(({ key }) => october.summaries[key].actual), [1, 2, 2, 2]);
  const leapFebruary = calculate([row({ date: '23/02/2024', companyName: 'Feb 23' }), row({ sourceIndex: 1, date: '24/02/2024', companyName: 'Feb 24' }), row({ sourceIndex: 2, date: '29/02/2024', companyName: 'Feb 29' })], '2024-02');
  assert.deepEqual(leapFebruary.buckets.map(({ key }) => leapFebruary.summaries[key].actual), [0, 0, 1, 2]);
  assert.equal(leapFebruary.summaries.week1.status, 'EXPECTED PENDING');
});

test('October expected-reference statuses and confirmed subtotal are configured, not hardcoded outputs', () => {
  const records = [];
  for (const [prefix, count, date] of [['W1', 179, '01/10/2026'], ['W2', 232, '08/10/2026']]) {
    for (let index = 0; index < count; index++) records.push(row({ sourceIndex: records.length, date, salesUserName: `${prefix} Manager ${index}`, empId: `${prefix}-${index}`, companyName: `Partner ${index}` }));
  }
  const result = calculate(records);
  assert.deepEqual([result.summaries.week1.actual, result.summaries.week2.actual], [179, 232]);
  assert.deepEqual([result.summaries.week1.difference, result.summaries.week2.difference], [0, 0]);
  assert.deepEqual([result.summaries.week1.status, result.summaries.week2.status, result.summaries.week3.status, result.summaries.week4.status], ['MATCHED', 'MATCHED', 'EXPECTED PENDING', 'EXPECTED PENDING']);
  assert.equal(result.confirmedExpectedSubtotal, 411);
  assert.equal(Q2_WEEKLY_DISTRIBUTOR_RULES.confirmedExpectedSubtotal, 411);
  const exportRows = getQ2WeeklyDistributorSummaryRows(result, 'October 2026');
  assert.deepEqual(exportRows.slice(1, 3).map((line) => [line[2], line[3], line[4], line[5]]), [[179, 179, 0, 'MATCHED'], [232, 232, 0, 'MATCHED']]);
  assert.equal(exportRows.at(-1)[2], 411);
});

test('preserves Oct 15 in WEEK-2 and explains a reference mismatch caused by the older 8–14 boundary', () => {
  const records = [];
  for (let index = 0; index < 232; index++) records.push(row({ sourceIndex: records.length, date: '08/10/2026', salesUserName: `Through 14 ${index}`, empId: `A-${index}`, companyName: `Partner ${index}` }));
  for (let index = 0; index < 35; index++) records.push(row({ sourceIndex: records.length, date: '15/10/2026', salesUserName: `Day 15 ${index}`, empId: `B-${index}`, companyName: `New Partner ${index}` }));
  const week2 = calculate(records).summaries.week2;
  assert.equal(week2.referenceBoundaryUniqueGroups, 232);
  assert.equal(week2.uniqueGroupsAddedOnDay15, 35);
  assert.equal(week2.actual, 267);
  assert.equal(week2.difference, 35);
  assert.equal(week2.status, 'MISMATCH');
});

test('reports missing Q2 source columns instead of presenting a false zero', () => {
  const result = calculate([row()], '2026-10', ['Date', 'Sales User Name', 'Emp ID']);
  assert.deepEqual(result.sourceMissingColumns, ['Designation', 'Type', 'Zonal Manager', 'Dealer Channel Partner Code / Dealer Channel Partner / Company Name']);
  assert.equal(result.summaries.week1.actual, null);
  assert.equal(result.summaries.week1.status, 'SOURCE DATA MISSING');
});

test('applies the configured Zonal Manager exclusion and uses Emp ID only when Senior Sales User is blank', () => {
  const result = calculate([
    row({ sourceIndex: 0, salesUserName: 'Excluded manager', zonalManager: ' shObhit   Goel ' }),
    row({ sourceIndex: 1, salesUserName: '', empId: 'M-FALLBACK', companyName: 'Fallback partner' }),
    row({ sourceIndex: 2, salesUserName: '', empId: '', companyName: 'No senior identity' }),
  ]);
  assert.equal(result.summaries.week1.actual, 1);
  assert.equal(result.summaries.week1.rowsAfterEligibilityFilters, 1);
  assert.equal(result.summaries.week1.missingSeniorRows, 1);
  assert.equal(result.sourceRowsByBucket.week1[0].reason, 'Excluded by configured Zonal Manager rule');
});

test('summary export retains pending expectations as text, never zero', () => {
  const result = calculate([row()], '2026-10');
  const exportRows = getQ2WeeklyDistributorSummaryRows(result, 'October 2026');
  assert.equal(exportRows[3][2], 'Pending');
  assert.equal(exportRows[4][2], 'Pending');
  assert.equal(exportRows[3][5], 'EXPECTED PENDING');
});
