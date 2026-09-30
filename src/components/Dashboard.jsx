import React, { useEffect, useMemo, useState } from 'react';
import { displayTime } from '../utils/dateUtils';
import { csvValue, duration, money, num } from '../utils/formatUtils';
import { routePoints } from '../services/routingService';
import { analyzeRoute } from '../services/routeAnalysisService';
import { haversine } from '../utils/coordinateUtils';
import EmployeeSummary from './EmployeeSummary';
import MapView from './MapView';
import VisitTable from './VisitTable';
import DayRouteRules from './DayRouteRules';

const routePointList = (visits) => visits.flatMap((visit) => [visit.start, visit.end].filter(Boolean));
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
    { label: 'Total Route KM', value: route ? `${num(route.km)} km` : 'Select employee + date' },
    { label: 'Visit Time', value: duration(rows.reduce((total, row) => total + row.durationMinutes, 0)) },
    { label: 'Order Value', value: money(rows.reduce((total, row) => total + row.basicOrderValue, 0)) },
  ];
}

function CheckpointOrderTable({ title, hint, visits, route, tone = 'actual' }) {
  const rows = visits.flatMap((visit) => [
    visit.start && { visit, type: 'Check-In', point: visit.start, time: visit.checkIn, location: visit.checkInLocation },
    visit.end && { visit, type: 'Check-Out', point: visit.end, time: visit.checkOut, location: visit.checkOutLocation },
  ].filter(Boolean));

  return <section className={`card order-card ${tone}`}>
    <span className="eyebrow">{tone === 'suggested' ? 'ADVISORY ONLY' : 'HISTORICAL DATA'}</span>
    <h3>{title}</h3>
    <p>{hint}</p>
    <div className="table-scroll">
      <table className="order-table"><thead><tr><th>#</th><th>Type</th><th>Location / Dealer</th><th>Time</th><th>Distance from previous</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${row.visit.id}-${row.type}`}>
          <td>{index + 1}</td>
          <td><span className={`event-dot ${row.type === 'Check-In' ? 'in' : 'out'}`}/>{row.type}</td>
          <td><b>{row.visit.companyName || row.visit.dealerChannelPartner || 'Unnamed visit'}</b><small>{row.location || 'GPS location'}</small></td>
          <td>{displayTime(row.time) || '—'}</td>
          <td>{index === 0 ? '—' : `${num(route?.segmentKm?.[index - 1] || 0, 2)} km`}</td>
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
  const [dayEndpoints, setDayEndpoints] = useState({ start: null, end: null, startType: 'OTHER', endType: 'OTHER', dayType: 'Normal' });

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
      .sort((a, b) => (a.checkIn?.getTime() || 0) - (b.checkIn?.getTime() || 0));
  }, [filters.empId, filters.date, indexes.byEmployeeDate, records]);
  const routeVisits = useMemo(() => selectedVisits.filter((visit) => visit.start || visit.end), [selectedVisits]);
  const eligible = routeVisits.length > 0;
  const displayedVisits = order === 'asc' ? selectedVisits : [...selectedVisits].reverse();
  const attendanceDay = useMemo(() => attendance?.byEmployeeDate?.[`${filters.empId}|${filters.date}`]?.[0] || null, [attendance, filters.empId, filters.date]);
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
    const actualPoints = routePointList(routeVisits);
    if (actualPoints.length < 2) return undefined;
    setLoading(true);
    (async () => {
      const actual = await routePoints(actualPoints);
      const localPlan = analyzeRoute(routeVisits, actual.km);
      const suggested = await routePoints(routePointList(localPlan.suggestedVisits));
      const finalAnalysis = analyzeRoute(routeVisits, actual.km, suggested.km);
      if (!activeRequest) return;
      setActualRoute(actual); setSuggestedRoute(suggested); setAnalysis(finalAnalysis);
      setAnalysisCache((cache) => ({ ...cache, [routeKey(routeVisits[0])]: finalAnalysis }));
    })().finally(() => activeRequest && setLoading(false));
    return () => { activeRequest = false; };
  }, [eligible, routeVisits]);

  const summaries = useMemo(() => indexes.summaries
    .filter((row) => (!filters.date || row.dateKey === filters.date) && (!filters.manager || row.manager === filters.manager) && (!filters.type || row.type === filters.type) && (!filters.empId || row.empId === filters.empId))
    .sort((a, b) => b.visits - a.visits), [indexes.summaries, filters]);

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
    if (exportScope === 'selected') (analysis?.suggestedVisits || []).forEach((visit, index) => suggestedArrivalKm.set(visit.id, index === 0 ? '' : num(suggestedRoute?.segmentKm?.[(index * 2) - 1] || 0, 2)));
    const rows = exportVisits.map((visit, index) => [
      index + 1,
      visit.salesUserName,
      visit.empId,
      visit.companyName || visit.dealerChannelPartner || '',
      excelDateTime(visit.checkIn),
      excelDateTime(visit.checkOut),
      num(visit.durationMinutes, 2),
      exportScope === 'selected' ? (index > 0 ? num(actualRoute?.segmentKm?.[(index * 2) - 1] || 0, 2) : '') : num(bulkMetrics.get(routeKey(visit))?.actualKm || 0, 2),
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

    {filters.empId && filters.date && <section className="enrichment-grid"><article className="card enrichment-card"><span className="eyebrow">FIELD ATTENDANCE</span>{attendanceDay ? <><h3>{attendanceDay.employee || filters.user}</h3><dl><div><dt>Field start</dt><dd>{displayTime(attendanceDay.start) || '—'}</dd></div><div><dt>Field end</dt><dd>{displayTime(attendanceDay.stop) || 'Not recorded'}</dd></div><div><dt>Working time</dt><dd>{attendanceDay.workingTime || '—'}</dd></div><div><dt>Attendance Google KM</dt><dd>{num(attendanceDay.googleKm, 2)} km</dd></div></dl><small>Attendance Google KM is separate from Check-In GPS route KM.</small></> : <p>Upload an Attendance Report to see field start/end, working time, and Google KM for this employee/date.</p>}</article><article className="card enrichment-card"><span className="eyebrow">ASSIGNED DEALERS</span><h3>{assignedDealers.length.toLocaleString()} mapped dealers</h3><p>Blue markers are optional and only use Employee ID assignments from the dealer master.</p><dl><div><dt>Check-ins matched within 500 m</dt><dd>{dealerMatches.length} / {routeVisits.length}</dd></div><div><dt>Unmatched / other locations</dt><dd>{Math.max(0, routeVisits.length - dealerMatches.length)}</dd></div><div><dt>Route planning layer</dt><dd>Estimated dealer route</dd></div></dl>{assignedDealers.length > 0 && <button className="secondary" onClick={() => setShowDealers((value) => !value)}>{showDealers ? 'Hide assigned dealers' : 'Show assigned dealers on map'}</button>}<small>Dealer master is not treated as a Tour Plan.</small></article></section>}
    {eligible ? <DayRouteRules empId={filters.empId} date={filters.date} visits={routeVisits} localMarketKm={actualRoute?.km || 0} onEndpoints={setDayEndpoints}/> : null}
    {filters.empId && filters.date && <section className="card performance-report"><div className="section-head"><div><span className="eyebrow">ROUTE PERFORMANCE REPORT</span><h2>Selected employee/day performance</h2></div><span>Tour Plan not uploaded — estimated/planned fields remain unavailable.</span></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Employee</th><th>Emp ID</th><th>Reporting Manager</th><th>Zonal Manager</th><th>Estimated / Planned KM</th><th>Actual KM</th><th>Optimized KM</th><th>Potential Saving</th><th>Visits Completed</th><th>Attendance Google KM</th><th>Working Time</th><th>Route Pattern</th><th>Route Quality</th></tr></thead><tbody><tr><td>{filters.date}</td><td>{filters.user || attendanceDay?.employee || '—'}</td><td>{filters.empId}</td><td>{attendanceDay?.reportingManager || routeVisits[0]?.reportingManager || '—'}</td><td>{attendanceDay?.zonalManager || routeVisits[0]?.zonalManager || '—'}</td><td>—</td><td>{actualRoute ? `${num(actualRoute.km, 2)} km` : '—'}</td><td>{suggestedRoute ? `${num(suggestedRoute.km, 2)} km` : '—'}</td><td>{analysis ? `${num(analysis.saving, 2)} km` : '—'}</td><td>{selectedVisits.length}</td><td>{attendanceDay ? `${num(attendanceDay.googleKm, 2)} km` : '—'}</td><td>{attendanceDay?.workingTime || '—'}</td><td>{analysis?.pattern || '—'}</td><td>{analysis?.quality || '—'}</td></tr></tbody></table></div></section>}

    {!eligible && <section className="notice">Select both a sales user and a single date to view a route. This keeps large reports responsive and never draws thousands of map pins at once.</section>}

    {eligible && <section className="route-comparison">
      <div className="comparison-head"><div><span className="eyebrow">ROUTE COMPARISON</span><h2>Actual journey vs. optimized visit order</h2></div><div className="map-controls"><button className={mapMode === 'actual' ? 'selected' : ''} onClick={() => setMapMode('actual')}>Actual</button><button className={mapMode === 'suggested' ? 'selected' : ''} onClick={() => { setMapMode('suggested'); setShowSuggested(true); }}>Suggested</button><button className={mapMode === 'both' ? 'selected' : ''} onClick={() => { setMapMode('both'); setShowSuggested(true); }}>Both</button></div></div>
      <div className={`comparison-layout ${mapMode}`}>
        {mapMode !== 'suggested' && <section className="card map-card actual-map"><div className="section-head"><div><span className="eyebrow">ACTUAL ROUTE</span><h2>{actualRoute ? `${num(actualRoute.km, 2)} km` : 'Calculating…'}</h2><p>Your employee’s historical journey</p></div></div><MapView visits={routeVisits} route={actualRoute} activeIndex={active} routeColor="#2563eb" routeLabel="Actual" dealers={showDealers ? assignedDealers : []} specialLocations={[dayEndpoints.start && { point: dayEndpoints.start, label: dayEndpoints.startType }, dayEndpoints.end && { point: dayEndpoints.end, label: dayEndpoints.endType }].filter(Boolean)}/></section>}
        {mapMode !== 'actual' && showSuggested && <section className="card map-card suggested-map"><div className="section-head"><div><span className="eyebrow">SUGGESTED ROUTE</span><h2>{suggestedRoute ? `${num(suggestedRoute.km, 2)} km` : 'Optimizing…'}</h2><p>Optimized order — same visits, advisory only</p></div></div><MapView visits={analysis?.suggestedVisits || routeVisits} route={suggestedRoute} activeIndex={-1} routeColor="#149447" routeLabel="Suggested"/></section>}
        <ComparisonPanel analysis={analysis} actualRoute={actualRoute} suggestedRoute={suggestedRoute}/>
      </div>
      <div className="route-actions"><button className="primary compact" onClick={() => setShowSuggested((value) => !value)}>{showSuggested ? 'Hide Suggested Route' : 'View Suggested Route'}</button><button className="secondary" onClick={playRoute}>▶ Play Actual Route</button>{loading && <small>Calculating cached road routes…</small>}</div>
      <div className="comparison-slider"><b>Current visit {Math.min(active + 1, routeVisits.length)} / {routeVisits.length}</b><small>{routeVisits[active]?.companyName || 'Unnamed visit'}</small><input type="range" min="0" max={Math.max(0, routeVisits.length - 1)} value={Math.min(active, Math.max(0, routeVisits.length - 1))} onChange={(event) => setActive(Number(event.target.value))}/></div>
      {analysis && <div className="comparison-stats"><span><b>Potential saving</b>{num(analysis.saving, 2)} km</span><span><b>Distance reduction</b>{num((analysis.saving / Math.max(analysis.actualKm, 0.01)) * 100, 1)}%</span></div>}
      <div className="order-comparison"><CheckpointOrderTable title={`Actual Visit Order (${num(actualRoute?.km || 0, 2)} km)`} hint="Historical visit order and recorded timestamps." visits={routeVisits} route={actualRoute}/><CheckpointOrderTable title={`Suggested Visit Order (${num(suggestedRoute?.km || 0, 2)} km)`} hint="Hypothetical suggested order. Original timestamps remain attached to each visit." visits={analysis?.suggestedVisits || routeVisits} route={suggestedRoute} tone="suggested"/></div>
      <VisitTable visits={displayedVisits} route={actualRoute} order={order} setOrder={setOrder} activeId={routeVisits[active]?.id} onSelect={(id) => setActive(Math.max(0, routeVisits.findIndex((visit) => visit.id === id)))}/>
    </section>}
  </main>;
}
