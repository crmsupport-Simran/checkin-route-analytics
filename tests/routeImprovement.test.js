import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRouteImprovement } from '../src/services/routeImprovementService.js';

test('a longer road-routed candidate is rejected and the chronological route remains authoritative', () => {
  const actual = { km: 230.4443, source: 'road' };
  const candidate = { km: 238.6418, source: 'road' };
  const chronologicalVisits = ['recorded-order'];
  const optimizedVisits = ['haversine-order'];
  const actualPoints = [[1, 1], [2, 2]];
  const optimizedPoints = [[1, 1], [2, 2], [1, 1]];
  const result = selectRouteImprovement({ actual, candidate, chronologicalVisits, optimizedVisits, actualPoints, optimizedPoints });

  assert.equal(result.comparable, true);
  assert.equal(result.improved, false);
  assert.equal(result.route, actual);
  assert.equal(result.visits, chronologicalVisits);
  assert.equal(result.points, actualPoints);
});

test('a candidate only replaces the recorded route when it is shorter using the same distance source', () => {
  const actual = { km: 230.4443, source: 'road' };
  const candidate = { km: 220, source: 'road' };
  const visits = ['recorded-order'];
  const optimizedVisits = ['improved-order'];
  const points = [[1, 1], [2, 2]];
  const optimizedPoints = [[1, 1], [1.5, 1.5], [2, 2]];
  const result = selectRouteImprovement({ actual, candidate, chronologicalVisits: visits, optimizedVisits, actualPoints: points, optimizedPoints });
  assert.equal(result.improved, true);
  assert.equal(result.route, candidate);
  assert.equal(result.visits, optimizedVisits);
  assert.equal(result.points, optimizedPoints);
});

test('routes with different distance sources are not treated as comparable improvements', () => {
  const result = selectRouteImprovement({
    actual: { km: 230, source: 'road' },
    candidate: { km: 200, source: 'straight' },
    chronologicalVisits: [], optimizedVisits: ['candidate'], actualPoints: [], optimizedPoints: [[1, 2]],
  });
  assert.equal(result.comparable, false);
  assert.equal(result.improved, false);
});
