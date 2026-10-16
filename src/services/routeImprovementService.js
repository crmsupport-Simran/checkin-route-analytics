export function selectRouteImprovement({
  actual,
  candidate,
  chronologicalVisits,
  optimizedVisits,
  actualPoints,
  optimizedPoints,
  toleranceKm = 0.01,
}) {
  const comparable = actual?.source === candidate?.source
    && Number.isFinite(actual?.km)
    && Number.isFinite(candidate?.km);
  const improved = comparable && candidate.km + toleranceKm < actual.km;
  return {
    comparable,
    improved,
    route: improved ? candidate : actual,
    visits: improved ? optimizedVisits : chronologicalVisits,
    points: improved ? optimizedPoints : actualPoints,
  };
}
