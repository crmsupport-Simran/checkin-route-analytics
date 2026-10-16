import test from 'node:test';
import assert from 'node:assert/strict';
import { inferAttendanceBase } from '../src/services/baseInference.js';
import { getConfirmedAttendanceEndpoints } from '../src/services/routeEndpointService.js';

test('route endpoints only use same-day Attendance GPS and retain inferred history as reference metadata', () => {
  const anchor = { point: [29.76, 77.86], sourceDate: '2026-10-09' };
  const endpoints = getConfirmedAttendanceEndpoints({ startPoint: [29.7, 77.8], stopPoint: null }, anchor);

  assert.deepEqual(endpoints.startPoint, [29.7, 77.8]);
  assert.equal(endpoints.endPoint, null);
  assert.equal(endpoints.startSource, 'Attendance Start GPS');
  assert.equal(endpoints.endSource, 'Unavailable');
  assert.equal(endpoints.historicalAnchor, anchor);
});

test('inferred attendance anchor identifies source GPS and does not invent an averaged coordinate', () => {
  const attendance = { records: [
    { id: 'a-1', empId: '2818', dateKey: '2026-10-01', startPoint: [29.7644, 77.8671], stopPoint: [29.7645, 77.8672] },
    { id: 'a-2', empId: '2818', dateKey: '2026-10-02', startPoint: [29.7646, 77.8672], stopPoint: null },
    { id: 'a-3', empId: 'other', dateKey: '2026-10-03', startPoint: [29.7645, 77.8672], stopPoint: null },
  ] };
  const anchor = inferAttendanceBase(attendance, '2818');

  assert.equal(anchor.repeatedObservations, 3);
  assert.deepEqual(anchor.point, anchor.sourcePoint);
  assert.ok(anchor.supportingRecords.some((record) => record.recordId === anchor.sourceRecordId
    && record.dateKey === anchor.sourceDate
    && record.field === anchor.sourceField
    && JSON.stringify(record.point) === JSON.stringify(anchor.point)));
  assert.deepEqual(anchor.supportingDates, ['2026-10-01', '2026-10-02']);
});
