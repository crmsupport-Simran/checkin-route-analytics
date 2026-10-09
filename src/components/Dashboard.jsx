import React, { useEffect, useMemo, useState } from 'react';
import { displayTime } from '../utils/dateUtils';
import { csvValue, duration, money, num } from '../utils/formatUtils';
import { routePoints } from '../services/routingService';
import { analyzeRoute } from '../services/routeAnalysisService';
import { inferAttendanceBase } from '../services/baseInference';
import { haversine, isValidCoordinate } from '../utils/coordinateUtils';
import EmployeeSummary from './EmployeeSummary';
import MapView from './MapView';
import VisitTable from './VisitTable';
import DayRouteRules from './DayRouteRules';

const routePointList = (visits) => visits.flatMap((visit) => [visit.start, visit.end].filter(Boolean));
const visitPoint = (visit) => (visit.start && isValidCoordinate(...visit.start) ? visit.start : visit.end && isValidCoordinate(...visit.end) ? visit.end : null);
const normalizedEmpId = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/\.0+$/, '');
const routeKey = (visit) => `${visit.empId}|${visit.dateKey}`;
const localRouteKm = (points) => points.slice(1).reduce((sum, point, index) => sum + haversine(points[index], point), 0);
const excelDateTime = (value) => value instanceof Date && !Number.isNaN(value.getTime())
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')} ${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`
  : '';

function kpis(rows, route) {
  return [
    { label: 'Total Employees', value: new Set(rows.map((row) => row.empId)).size },
    { label: 'Total Check-Ins', value: rows.filter((row) => row.start).length },
    { label: 'Total Visits', value: rows.length },
    { label: 'Total Route KM', value: route ? `${num(route.km, 2)} km` : 'Select employee + date' },
    { label: 'Visit Time', value: duration(rows.reduce((total, row) => total + row.durationMinutes, 0)) },
    { label: 'Order Value', value: money(rows.reduce((total, row) => total + row.basicOrderValue, 0)) },
  ];
}

function CheckpointOrderTable({ title, hint, stops, route, tone = 'actual' }) {
  return <section className={`card order-card ${tone}`}>
    <span className="eyebrow">{tone === 'suggested' ? 'ADVISORY ONLY' : 'HISTORICAL DATA'}</span>
    <h3>{title}</h3>
    <p>{hint}</p>
    <div className="table-scroll">
      <table className="order-table"><thead><tr><th>#</th><th>Type</th><th>From</th><th>To</th><th>Time</th><th>Distance KM</th><th>Distance source</th><th>Coordinate source</th></tr></thead>
        <tbody>{stops.map((row, index) => <tr key={row.key}>
          <td>{index + 1}</td>
          <td><span className={`event-dot ${row.kind === 'checkin' ? 'in' : row.kind === 'attendance-start' ? 'attendance-start-dot' : 'attendance-stop-dot'}`}/>{row.type}</td>
          <td>{index === 0 ? 'Route start' : stops[index - 1].label}</td>
          <td><b>{row.label}</b><small>{row.location || 'GPS location'}</small></td>
          <td>{displayTime(row.time) || '—'}</td>
          <td>{index === 0 ? '—' : `${num(route?.segmentKm?.[index - 1] || 0, 2)} km`}</td>
          <td>{index === 0 ? '—' : route?.source === 'road' ? 'Road routing' : route?.source === 'straight' ? 'ESTIMATED (straight-line)' : 'Unavailable'}</td>
          <td>{row.source}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function ComparisonPanel({ analysis, actualRoute, suggestedRoute }) {
  if (!analysis) return null;
  const reduction = analysis.actualKm ? (analysis.saving / analysis.actualKm) * 100 : 0;
  return <aside className="card comparison-panel">
    <span className="eyebrow">ROUTE COMPARISON</span><h2>Route intelligence</h2>
    <dl>
      <div><dt>Actual distance</dt><dd>{num(actualRoute?.km || analysis.actualKm, 2)} km</dd></div>
      <div><dt>Suggested distance</dt><dd>{num(suggestedRoute?.km || analysis.suggestedKm, 2)} km</dd></div>
      <div><dt>Potential saving</dt><dd className="good">{num(analysis.saving, 2)} km</dd></div>
      <div><dt>Distance reduction</dt><dd>{num(reduction, 1)}%</dd></div>
      <div><dt>Route quality</dt><dd><span className={`quality ${analysis.quality.toLowerCase().replaceAll(' ', '-')}`}>{analysis.quality}</span></dd></div>
      <div><dt>Route pattern</dt><dd>{analysis.pattern}</dd></div>
      <div><dt>Backtracking</dt><dd>{analysis.backtracking}</dd></div>
      <div><dt>Direction changes</dt><dd>{analysis.reversals}</dd></div>
    </dl>
    <div className="suggestion-copy"><b>AI Suggestion</b><p>{analysis.explanation}</p></div>
  </aside>;
}

export default function Dashboard({ report, filters, setFilters, attendance, dealers }) {
  const { records, indexes } = report;
  const [actualRoute, setActualRoute] = useState(null);
  const [suggestedRoute, setSuggestedRoute] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisCache, setAnalysisCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [showSuggested, setShowSuggested] = useState(true);
  const [mapMode, setMapMode] = useState('both');
  const [order, setOrder] = useState('asc');
  const [active, setActive] = useState(0);
  const [exportScope, setExportScope] = useState('selected');
  const [showDealers, setShowDealers] = useState(false);

  const filtered = useMemo(() => {
    let ids = null;
    const applyIndex = (list) => {
      if (!list) return;
      const next = new Set(list);
      ids = ids === null ? next : new Set([...ids].filter((id) => next.has(id)));
    };
    if (filters.empId) applyIndex(indexes.byEmployee[filters.empId]);
    if (filters.date) applyIndex(indexes.byDate[filters.date]);
    if (filters.manager) applyIndex(indexes.byManager[filters.manager]);
    if (filters.type) applyIndex(indexes.byType[filters.type]);
    let rows = ids ? [...ids].map((id) => records[id]) : records;
    if (filters.search) {
      const query = filters.search.toLowerCase();
      rows = rows.filter((row) => [row.salesUserName, row.empId, row.companyName, row.dealerChannelPartner, row.dealerChannelPartnerCode, row.checkInLocation, row.checkOutLocation].join(' ').toLowerCase().includes(query));
    }
    return rows;
  }, [records, indexes, filters]);

  // A map is intentionally limited to one employee + one date; this prevents thousands of pins.
  const selectedVisits = useMemo(() => {
    if (!filters.empId || !filters.date) return [];
    return (indexes.byEmployeeDate[`${filters.empId}|${filters.date}`] || [])
      .map((id) => records[id])
      .sort((a, b) => {
        const at = a.checkIn?.getTime(), bt = b.checkIn?.getTime();
        if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
        if (Number.isFinite(at) !== Number.isFinite(bt)) return Number.isFinite(at) ? -1 : 1;
        return (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0);
      });
  }, [filters.empId, filters.date, indexes.byEmployeeDate, records]);
  const routeVisits = useMemo(() => selectedVisits.filter((visit) => visitPoint(visit)), [selectedVisits]);
  const displayedVisits = order === 'asc' ? selectedVisits : [...selectedVisits].reverse();
  const attendanceRows = useMemo(() => {
    if (!attendance || !filters.empId || !filters.date) return [];
    const exact = attendance.byEmployeeDate?.[`${filters.empId}|${filters.date}`];
    if (exact?.length) return exact;
    const wantedId = normalizedEmpId(filters.empId);
    return (attendance.records || []).filter((row) => normalizedEmpId(row.empId) === wantedId && row.dateKey === filters.date);
  }, [attendance, filters.empId, filters.date]);
  const attendanceDay = useMemo(() => {
    if (!attendanceRows.length) return null;
    const startRow = attendanceRows.find((row) => row.startPoint) || attendanceRows[0];
    const stopRow = [...attendanceRows].reverse().find((row) => row.stopPoint) || attendanceRows.at(-1);
    return { ...startRow, startPoint: attendanceRows.find((row) => row.startPoint)?.startPoint || null, startLatitude: startRow.startLatitude, startLongitude: startRow.startLongitude, startAddress: attendanceRows.find((row) => row.startAddress)?.startAddress || startRow.startAddress, stopPoint: [...attendanceRows].reverse().find((row) => row.stopPoint)?.stopPoint || null, stopLatitude: stopRow.stopLatitude, stopLongitude: stopRow.stopLongitude, stopAddress: [...attendanceRows].reverse().find((row) => row.stopAddress)?.stopAddress || stopRow.stopAddress };
  }, [attendanceRows]);
  const inferredAttendanceBase = useMemo(() => inferAttendanceBase(attendance, filters.empId), [attendance, filters.empId]);
  const attendanceEndpoints = useMemo(() => ({
    startPoint: attendanceDay?.startPoint || inferredAttendanceBase?.point || null,
    endPoint: attendanceDay?.stopPoint || inferredAttendanceBase?.point || null,
    startSource: attendanceDay?.startPoint ? 'Attendance Start GPS' : inferredAttendanceBase?.point ? 'Inferred Attendance Anchor' : 'Unavailable',
    endSource: attendanceDay?.stopPoint ? 'Attendance Stop GPS' : inferredAttendanceBase?.point ? 'Inferred Attendance Anchor' : 'Unavailable',
  }), [attendanceDay, inferredAttendanceBase]);
  const routeStops = useMemo(() => routeVisits.map((visit) => ({ ...visit, start: visitPoint(visit), end: null, coordinateSource: visit.start && isValidCoordinate(...visit.start) ? 'Check-In GPS' : 'Check-Out GPS fallback' })), [routeVisits]);
  const routePointSequence = useMemo(() => [...(attendanceEndpoints.startPoint ? [attendanceEndpoints.startPoint] : []), ...routeStops.map((visit) => visit.start).filter(Boolean), ...(attendanceEndpoints.endPoint ? [attendanceEndpoints.endPoint] : [])], [attendanceEndpoints, routeStops]);
  const eligible = Boolean(filters.empId && filters.date && routePointSequence.length >= 2);
  const routeAuditStops = useMemo(() => [
    ...(attendanceEndpoints.startPoint ? [{ key: 'attendance-start', kind: attendanceEndpoints.startSource === 'Inferred Attendance Anchor' ? 'inferred-anchor' : 'attendance-start', type: 'START ATTENDANCE', label: attendanceEndpoints.startSource, location: attendanceDay?.startAddress, source: attendanceEndpoints.startSource, point: attendanceEndpoints.startPoint, time: attendanceDay?.start }] : []),
    ...routeStops.map((visit) => ({ key: visit.id, kind: 'checkin', type: 'CHECK-IN', label: visit.companyName || visit.dealerChannelPartner || 'Unnamed visit', location: visit.checkInLocation, source: visit.coordinateSource, point: visit.start, time: visit.checkIn })),
    ...(attendanceEndpoints.endPoint ? [{ key: 'attendance-stop', kind: attendanceEndpoints.endSource === 'Inferred Attendance Anchor' ? 'inferred-anchor' : 'attendance-stop', type: 'ATTENDANCE STOP', label: attendanceEndpoints.endSource, location: attendanceDay?.stopAddress, source: attendanceEndpoints.endSource, point: attendanceEndpoints.endPoint, time: attendanceDay?.stop }] : []),
  ], [attendanceEndpoints, attendanceDay, routeStops]);
  const suggestedAuditStops = useMemo(() => [
    ...(attendanceEndpoints.startPoint ? [{ key: 'attendance-start-suggested', kind: attendanceEndpoints.startSource === 'Inferred Attendance Anchor' ? 'inferred-anchor' : 'attendance-start', type: 'START ATTENDANCE', label: attendanceEndpoints.startSource, location: attendanceDay?.startAddress, source: attendanceEndpoints.startSource, time: attendanceDay?.start }] : []),
    ...(analysis?.suggestedVisits || routeStops).map((visit) => ({ key: `suggested-${visit.id}`, kind: 'checkin', type: 'CHECK-IN', label: visit.companyName || visit.dealerChannelPartner || 'Unnamed visit', location: visit.checkInLocation, source: visit.coordinateSource || 'Check-In GPS', time: visit.checkIn })),
    ...(attendanceEndpoints.endPoint ? [{ key: 'attendance-stop-suggested', kind: attendanceEndpoints.endSource === 'Inferred Attendance Anchor' ? 'inferred-anchor' : 'attendance-stop', type: 'ATTENDANCE STOP', label: attendanceEndpoints.endSource, location: attendanceDay?.stopAddress, source: attendanceEndpoints.endSource, time: attendanceDay?.stop }] : []),
  ], [analysis, routeStops, attendanceEndpoints, attendanceDay]);
  const visitDistanceKm = useMemo(() => Object.fromEntries(routeStops.map((visit, index) => {
    const segmentIndex = index + (attendanceEndpoints.startPoint ? 0 : -1);
    return [visit.id, segmentIndex >= 0 ? actualRoute?.segmentKm?.[segmentIndex] ?? null : null];
  })), [routeStops, attendanceEndpoints, actualRoute]);
  const attendanceStatus = !attendance ? 'Attendance data not available — route starts/ends from available Check-In points.' : !attendanceDay ? (attendanceEndpoints.startPoint && attendanceEndpoints.endPoint ? 'No matching Attendance row for this date — both endpoints use this employee’s inferred historical Attendance anchor.' : 'Attendance endpoint unavailable — no matching Employee ID + date record or valid historical anchor.') : [
    !attendanceDay?.startPoint && (attendanceEndpoints.startPoint ? 'Start uses inferred historical Attendance anchor' : 'Attendance start GPS unavailable; no historical anchor found'),
    !attendanceDay?.stopPoint && (attendanceEndpoints.endPoint ? 'Stop uses inferred historical Attendance anchor' : 'Attendance stop GPS unavailable; no historical anchor found'),
  ].filter(Boolean).join(' · ');
  const routeCoverageLabel = attendanceEndpoints.startPoint && attendanceEndpoints.endPoint
    ? `Attendance start (${attendanceEndpoints.startSource}) → chronological Check-Ins → Attendance stop (${attendanceEndpoints.endSource})`
    : `Available points · ${attendanceEndpoints.startPoint ? attendanceEndpoints.startSource : 'Start unavailable'} → chronological Check-Ins → ${attendanceEndpoints.endPoint ? attendanceEndpoints.endSource : 'Stop unavailable'}`;
  const assignedDealers = useMemo(() => dealers?.indexes?.byEmployeeId?.[filters.empId]?.filter((dealer) => dealer.point).slice(0, 400) || [], [dealers, filters.empId]);
  const dealerMatches = useMemo(() => routeVisits.map((visit) => {
    if (!visit.start || !assignedDealers.length) return null;
    let nearest = null; let distanceKm = Infinity;
    assignedDealers.forEach((dealer) => { const km = haversine(visit.start, dealer.point); if (km < distanceKm) { nearest = dealer; distanceKm = km; } });
    return nearest && distanceKm <= .5 ? { visitId: visit.id, dealer: nearest, distanceKm } : null;
  }).filter(Boolean), [routeVisits, assignedDealers]);

  useEffect(() => {
    let activeRequest = true;
    setActualRoute(null); setSuggestedRoute(null); setAnalysis(null); setActive(0); setShowSuggested(true); setMapMode('both');
    if (!eligible) return undefined;
    if (routePointSequence.length < 2) return undefined;
    setLoading(true);
    (async () => {
      const actual = await routePoints(routePointSequence);
      const localPlan = analyzeRoute(routeStops, actual.km, undefined, attendanceEndpoints);
      const suggestedPoints = [...(attendanceEndpoints.startPoint ? [attendanceEndpoints.startPoint] : []), ...localPlan.suggestedVisits.map((visit) => visit.start).filter(Boolean), ...(attendanceEndpoints.endPoint ? [attendanceEndpoints.endPoint] : [])];
      const suggested = await routePoints(suggestedPoints);
      const finalAnalysis = analyzeRoute(routeStops, actual.km, suggested.km, attendanceEndpoints);
      if (!activeRequest) return;
      setActualRoute(actual); setSuggestedRoute(suggested); setAnalysis(finalAnalysis);
      setAnalysisCache((cache) => ({ ...cache, [`${filters.empId}|${filters.date}`]: finalAnalysis }));
    })().finally(() => activeRequest && setLoading(false));
    return () => { activeRequest = false; };
  }, [eligible, routePointSequence, routeStops, attendanceEndpoints]);

  const summaries = useMemo(() => indexes.summaries.filter((row) =>
    (!filters.date || row.dateKey === filters.date) && (!filters.manager || row.manager === filters.manager)
    && (!filters.type || row.type === filters.type) && (!filters.empId || row.empId === filters.empId)), [indexes.summaries, filters]);

  const exportCsv = () => {
    const exportVisits = exportScope === 'all' ? records : exportScope === 'filtered' ? filtered : selectedVisits;
    // For bulk exports, calculate each employee/day locally once. This avoids a large batch of OSRM calls.
    const bulkMetrics = new Map();
    if (exportScope !== 'selected') {
      const byEmployeeDate = new Map();
      exportVisits.forEach((visit) => { const key = routeKey(visit); const list = byEmployeeDate.get(key) || []; list.push(visit); byEmployeeDate.set(key, list); });
      byEmployeeDate.forEach((visits, key) => {
        const ordered = visits.filter((visit) => visit.start || visit.end).sort((a, b) => (a.checkIn?.getTime() || 0) - (b.checkIn?.getTime() || 0));
        const actualKm = localRouteKm(routePointList(ordered));
        const plan = analyzeRoute(ordered, actualKm);
        bulkMetrics.set(key, { actualKm, suggestedKm: plan.suggestedKm, quality: plan.quality, pattern: plan.pattern });
      });
    }
    const suggestedArrivalKm = new Map();
    const actualArrivalKm = new Map();
    if (exportScope === 'selected') {
      routeStops.forEach((visit, index) => {
        const segmentIndex = index + (attendanceEndpoints.startPoint ? 0 : -1);
        actualArrivalKm.set(visit.id, segmentIndex < 0 || actualRoute?.segmentKm?.[segmentIndex] == null ? '' : num(actualRoute.segmentKm[segmentIndex], 2));
      });
      (analysis?.suggestedVisits || []).forEach((visit, index) => {
        const segmentIndex = index + (attendanceEndpoints.startPoint ? 0 : -1);
        suggestedArrivalKm.set(visit.id, segmentIndex < 0 || suggestedRoute?.segmentKm?.[segmentIndex] == null ? '' : num(suggestedRoute.segmentKm[segmentIndex], 2));
      });
    }
    const rows = exportVisits.map((visit, index) => [
      index + 1,
      visit.salesUserName,
      visit.empId,
      visit.companyName || visit.dealerChannelPartner || '',
      excelDateTime(visit.checkIn),
      excelDateTime(visit.checkOut),
      num(visit.durationMinutes, 2),
      exportScope === 'selected' ? (actualArrivalKm.get(visit.id) ?? '') : num(bulkMetrics.get(routeKey(visit))?.actualKm || 0, 2),
      exportScope === 'selected' ? (suggestedArrivalKm.get(visit.id) ?? '') : num(bulkMetrics.get(routeKey(visit))?.suggestedKm || 0, 2),
      num(visit.basicOrderValue, 2),
      exportScope === 'selected' ? (analysis?.quality || '') : (bulkMetrics.get(routeKey(visit))?.quality || ''),
      exportScope === 'selected' ? (analysis?.pattern || '') : (bulkMetrics.get(routeKey(visit))?.pattern || ''),
    ]);
    if (exportScope === 'selected') rows.push(['', 'ROUTE TOTAL', '', '', '', '', '', num(actualRoute?.km || 0, 2), num(suggestedRoute?.km || 0, 2), num(selectedVisits.reduce((total, visit) => total + visit.basicOrderValue, 0), 2), analysis?.quality || '', analysis?.pattern || '']);
    const data = [['#', 'Employee', 'Emp ID', 'Company', 'Check In', 'Check Out', 'Duration (Minutes)', 'Actual KMs', 'Suggested KMs', 'Order Value on Check-In', 'Route Quality', 'Route Pattern'], ...rows]
      .map((row) => row.map(csvValue).join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8' })); link.download = `checkin-${exportScope}-export-${filters.date || 'all-dates'}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };

  const playRoute = () => {
    let index = 0;
    const timer = setInterval(() => { setActive(index++); if (index >= routeVisits.length) clearInterval(timer); }, 850);
  };

  return <main>
    <section className="kpis">{kpis(filtered, actualRoute).map((kpi) => <div className="card kpi" key={kpi.label}><span>{kpi.label}</span><strong>{kpi.value}</strong></div>)}</section>
    <EmployeeSummary rows={summaries} analysis={analysisCache} onSelect={(row) => setFilters((current) => ({ ...current, user: row.name, empId: row.empId, date: row.dateKey }))}/>
    <section className="card export-report"><div><span className="eyebrow">EXPORT REPORT</span><h2>Download selected, filtered, or complete Excel data</h2></div><select className="export-select" value={exportScope} onChange={(event) => setExportScope(event.target.value)}><option value="selected">Selected employee + date</option><option value="filtered">All filtered data</option><option value="all">All Excel data</option></select><button className="secondary" onClick={exportCsv}>Export CSV</button></section>

    {filters.empId && filters.date && <section className="enrichment-grid"><article className="card enrichment-card"><span className="eyebrow">FIELD ATTENDANCE</span>{attendanceDay ? <><h3>{attendanceDay.employee || filters.user}</h3><dl><div><dt>Field start</dt><dd>{displayTime(attendanceDay.start) || '—'}<small>{attendanceDay.startAddress || 'Address unavailable'}</small></dd></div><div><dt>Field end</dt><dd>{displayTime(attendanceDay.stop) || 'Not recorded'}<small>{attendanceDay.stopAddress || 'Address unavailable'}</small></dd></div><div><dt>Working time</dt><dd>{attendanceDay.workingTime || '—'}</dd></div><div><dt>Attendance Google KM</dt><dd>{num(attendanceDay.googleKm, 2)} km</dd></div></dl><small>Attendance Google KM is separate from Check-In GPS route KM.</small></> : <p>Upload an Attendance Report to see field start/end, working time, and Google KM for this employee/date.</p>}</article><article className="card enrichment-card"><span className="eyebrow">ASSIGNED DEALERS</span><h3>{assignedDealers.length.toLocaleString()} mapped dealers</h3><p>Blue markers are optional and only use Employee ID assignments from the dealer master.</p><dl><div><dt>Check-ins matched within 500 m</dt><dd>{dealerMatches.length} / {routeVisits.length}</dd></div><div><dt>Unmatched / other locations</dt><dd>{Math.max(0, routeVisits.length - dealerMatches.length)}</dd></div><div><dt>Route planning layer</dt><dd>Estimated dealer route</dd></div></dl>{assignedDealers.length > 0 && <button className="secondary" onClick={() => setShowDealers((value) => !value)}>{showDealers ? 'Hide assigned dealers' : 'Show assigned dealers on map'}</button>}<small>Dealer master is not treated as a Tour Plan.</small></article></section>}
    {eligible ? <DayRouteRules empId={filters.empId} date={filters.date} visits={routeStops} localMarketKm={localRouteKm(routePointList(routeVisits))} attendance={attendance} attendanceDay={attendanceDay} attendanceEndpoints={attendanceEndpoints}/> : null}
    {filters.empId && filters.date && <section className="card performance-report"><div className="section-head"><div><span className="eyebrow">ROUTE PERFORMANCE REPORT</span><h2>Selected employee/day performance</h2></div><span>Tour Plan not uploaded — estimated/planned fields remain unavailable.</span></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Employee</th><th>Emp ID</th><th>Reporting Manager</th><th>Zonal Manager</th><th>Estimated / Planned KM</th><th>Actual KM</th><th>Optimized KM</th><th>Potential Saving</th><th>Visits Completed</th><th>Attendance Google KM</th><th>Working Time</th><th>Route Pattern</th><th>Route Quality</th></tr></thead><tbody><tr><td>{filters.date}</td><td>{filters.user || attendanceDay?.employee || '—'}</td><td>{filters.empId}</td><td>{attendanceDay?.reportingManager || routeVisits[0]?.reportingManager || '—'}</td><td>{attendanceDay?.zonalManager || routeVisits[0]?.zonalManager || '—'}</td><td>—</td><td>{actualRoute ? `${num(actualRoute.km, 2)} km` : '—'}</td><td>{suggestedRoute ? `${num(suggestedRoute.km, 2)} km` : '—'}</td><td>{analysis ? `${num(analysis.saving, 2)} km` : '—'}</td><td>{selectedVisits.length}</td><td>{attendanceDay ? `${num(attendanceDay.googleKm, 2)} km` : '—'}</td><td>{attendanceDay?.workingTime || '—'}</td><td>{analysis?.pattern || '—'}</td><td>{analysis?.quality || '—'}</td></tr></tbody></table></div></section>}

    {!eligible && <section className="notice">{filters.empId && filters.date ? 'At least two valid GPS points are needed to calculate a route. Attendance endpoints or Check-In GPS coordinates are unavailable for this employee/date.' : 'Select both a sales user and a single date to view a route. This keeps large reports responsive and never draws thousands of map pins at once.'}</section>}

    {eligible && <section className="route-comparison">
      <div className="comparison-head"><div><span className="eyebrow">ROUTE COMPARISON</span><h2>Actual journey vs. optimized visit order</h2></div><div className="map-controls"><button className={mapMode === 'actual' ? 'selected' : ''} onClick={() => setMapMode('actual')}>Actual</button><button className={mapMode === 'suggested' ? 'selected' : ''} onClick={() => { setMapMode('suggested'); setShowSuggested(true); }}>Suggested</button><button className={mapMode === 'both' ? 'selected' : ''} onClick={() => { setMapMode('both'); setShowSuggested(true); }}>Both</button></div></div>
      {attendanceStatus && <div className="notice route-attendance-status">{attendanceStatus}</div>}
      {actualRoute?.source === 'straight' && <div className="notice route-attendance-status">ESTIMATED — road routing is unavailable; these distances use straight-line GPS calculation.</div>}
      <div className={`comparison-layout ${mapMode}`}>
        {mapMode !== 'suggested' && <section className="card map-card actual-map"><div className="section-head"><div><span className="eyebrow">ACTUAL ROUTE</span><h2>{actualRoute ? `${num(actualRoute.km, 2)} km` : 'Calculating…'}</h2><p>Attendance start → chronological Check-Ins → Attendance stop · {actualRoute?.source === 'straight' ? 'ESTIMATED straight-line fallback' : actualRoute?.source === 'road' ? 'Road routing' : 'Route status unavailable'}</p></div></div><MapView visits={routeStops} route={actualRoute} activeIndex={active} routeColor="#2563eb" routeLabel="Actual Route" dealers={showDealers ? assignedDealers : []} specialLocations={[attendanceEndpoints.startPoint && { point: attendanceEndpoints.startPoint, label: 'Attendance Start', role: 'attendance-start', address: attendanceDay?.startAddress }, attendanceEndpoints.endPoint && { point: attendanceEndpoints.endPoint, label: 'Attendance Stop', role: 'attendance-stop', address: attendanceDay?.stopAddress }].filter(Boolean)}/></section>}
        {mapMode !== 'suggested' && <section className="card map-card actual-map"><div className="section-head"><div><span className="eyebrow">ACTUAL ROUTE</span><h2>{actualRoute ? `${num(actualRoute.km, 2)} km` : 'Calculating…'}</h2><p>{routeCoverageLabel} · {actualRoute?.source === 'straight' ? 'ESTIMATED straight-line fallback' : actualRoute?.source === 'road' ? 'Road routing' : 'Route status unavailable'}</p></div></div><MapView visits={routeStops} route={actualRoute} activeIndex={active} routeColor="#2563eb" routeLabel="Actual Route" dealers={showDealers ? assignedDealers : []} specialLocations={[attendanceEndpoints.startPoint && { point: attendanceEndpoints.startPoint, label: attendanceEndpoints.startSource, role: attendanceEndpoints.startSource === 'Inferred Attendance Anchor' ? 'inferred-anchor' : 'attendance-start', address: attendanceDay?.startAddress }, attendanceEndpoints.endPoint && { point: attendanceEndpoints.endPoint, label: attendanceEndpoints.endSource, role: attendanceEndpoints.endSource === 'Inferred Attendance Anchor' ? 'inferred-anchor' : 'attendance-stop', address: attendanceDay?.stopAddress }].filter(Boolean)}/></section>}
        {mapMode !== 'actual' && showSuggested && <section className="card map-card suggested-map"><div className="section-head"><div><span className="eyebrow">SUGGESTED ROUTE</span><h2>{suggestedRoute ? `${num(suggestedRoute.km, 2)} km` : 'Optimizing…'}</h2><p>Fixed Attendance endpoints; only Check-In order optimized · {suggestedRoute?.source === 'straight' ? 'ESTIMATED straight-line fallback' : suggestedRoute?.source === 'road' ? 'Road routing' : 'Route status unavailable'}</p></div></div><MapView visits={analysis?.suggestedVisits || routeStops} route={suggestedRoute} activeIndex={-1} routeColor="#149447" routeLabel="Suggested" specialLocations={[attendanceEndpoints.startPoint && { point: attendanceEndpoints.startPoint, label: attendanceEndpoints.startSource, role: attendanceEndpoints.startSource === 'Inferred Attendance Anchor' ? 'inferred-anchor' : 'attendance-start', address: attendanceDay?.startAddress }, attendanceEndpoints.endPoint && { point: attendanceEndpoints.endPoint, label: attendanceEndpoints.endSource, role: attendanceEndpoints.endSource === 'Inferred Attendance Anchor' ? 'inferred-anchor' : 'attendance-stop', address: attendanceDay?.stopAddress }].filter(Boolean)}/></section>}
        <ComparisonPanel analysis={analysis} actualRoute={actualRoute} suggestedRoute={suggestedRoute}/>
      </div>
      <div className="route-actions"><button className="primary compact" onClick={() => setShowSuggested((value) => !value)}>{showSuggested ? 'Hide Suggested Route' : 'View Suggested Route'}</button><button className="secondary" onClick={playRoute}>▶ Play Actual Route</button>{loading && <small>Calculating cached road routes…</small>}</div>
      {routeVisits.length > 0 && <div className="comparison-slider"><b>Current visit {Math.min(active + 1, routeVisits.length)} / {routeVisits.length}</b><small>{routeVisits[active]?.companyName || 'Unnamed visit'}</small><input type="range" min="0" max={Math.max(0, routeVisits.length - 1)} value={Math.min(active, Math.max(0, routeVisits.length - 1))} onChange={(event) => setActive(Number(event.target.value))}/></div>}
      {analysis && <div className="comparison-stats"><span><b>Potential saving</b>{num(analysis.saving, 2)} km</span><span><b>Distance reduction</b>{num((analysis.saving / Math.max(analysis.actualKm, 0.01)) * 100, 1)}%</span></div>}
      <div className="order-comparison"><CheckpointOrderTable title={`Actual Visit Order (${num(actualRoute?.km || 0, 2)} km)`} hint="Attendance endpoints enclose the recorded chronological check-in sequence." stops={routeAuditStops} route={actualRoute}/><CheckpointOrderTable title={`Suggested Visit Order (${num(suggestedRoute?.km || 0, 2)} km)`} hint="Attendance endpoints remain fixed while only the intermediate check-ins are reordered." stops={suggestedAuditStops} route={suggestedRoute} tone="suggested"/></div>
      <VisitTable visits={displayedVisits} route={actualRoute} visitDistanceKm={visitDistanceKm} order={order} setOrder={setOrder} activeId={routeVisits[active]?.id} onSelect={(id) => setActive(Math.max(0, routeVisits.findIndex((visit) => visit.id === id)))}/>
    </section>}
  </main>;
}
