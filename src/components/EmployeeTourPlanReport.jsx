import React, { useEffect, useMemo, useState } from 'react';
import { calculateRouteMetrics } from '../services/routingService';
import { buildEmployeeTourPlan, enrichRouteAudit, dateLabel } from '../services/employeeTourPlanService';
import { csvValue } from '../utils/formatUtils';

const monthLabel = (month) => {
  if (!month) return '';
  const [year, number] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(year, number - 1, 1));
};
const kmLabel = (value) => Number.isFinite(value) ? value.toFixed(2) : 'Not calculated';
const dateTime = (value) => value instanceof Date && !Number.isNaN(value.getTime()) ? value.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const downloadCsv = (rows, filename) => {
  const csv = rows.map((row) => row.map(csvValue).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export default function EmployeeTourPlanReport({ report, attendance, dealers }) {
  const analysis = useMemo(() => buildEmployeeTourPlan(report, attendance, dealers), [report, attendance, dealers]);
  const [month, setMonth] = useState('');
  const [employeeKey, setEmployeeKey] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [routeMetrics, setRouteMetrics] = useState({});
  const [routeProgress, setRouteProgress] = useState({ done: 0, total: 0 });
  const selectedMonth = analysis.months.includes(month) ? month : analysis.months.at(-1) || '';
  const monthRows = useMemo(() => analysis.rows.filter((row) => row.month === selectedMonth), [analysis.rows, selectedMonth]);
  const employees = useMemo(() => [...new Map(monthRows.map((row) => [`${row.empId}|${row.employee}`, row])).values()].sort((a, b) => a.employee.localeCompare(b.employee)), [monthRows]);
  const visibleRows = useMemo(() => employeeKey ? monthRows.filter((row) => `${row.empId}|${row.employee}` === employeeKey) : monthRows, [monthRows, employeeKey]);
  const selectedRow = visibleRows.find((row) => row.id === selectedId) || null;
  const selectedMetrics = selectedRow ? routeMetrics[selectedRow.id] : null;
  const selectedAudit = selectedRow ? enrichRouteAudit(selectedRow, selectedMetrics) : [];
  const anchorRows = useMemo(() => analysis.anchors.filter((item) => !employeeKey || `${item.empId}|${item.employee}` === employeeKey), [analysis.anchors, employeeKey]);

  useEffect(() => { setMonth(''); setEmployeeKey(''); setSelectedId(''); setRouteMetrics({}); }, [report, attendance, dealers]);
  useEffect(() => {
    let cancelled = false;
    const routeGroups = new Map();
    for (const row of visibleRows) {
      if (!row.routePoints) continue;
      const routeKey = row.routePoints.map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join(';');
      const group = routeGroups.get(routeKey) || { points: row.routePoints, rows: [] };
      group.rows.push(row);
      routeGroups.set(routeKey, group);
    }
    const routable = [...routeGroups.values()];
    setRouteMetrics({});
    setRouteProgress({ done: 0, total: routable.length });
    if (!routable.length) return () => { cancelled = true; };
    let cursor = 0;
    const worker = async () => {
      while (!cancelled) {
        const index = cursor++;
        if (index >= routable.length) return;
        const group = routable[index];
        try {
          const metrics = await calculateRouteMetrics(group.points);
          if (!cancelled) setRouteMetrics((current) => ({ ...current, ...Object.fromEntries(group.rows.map((row) => [row.id, metrics])) }));
        } catch (error) {
          if (!cancelled) setRouteMetrics((current) => ({ ...current, ...Object.fromEntries(group.rows.map((row) => [row.id, { totalKm: null, segmentDistances: [], routingStatus: 'failed', error: error.message }])) }));
        }
        if (!cancelled) setRouteProgress((current) => ({ ...current, done: current.done + 1 }));
      }
    };
    Promise.all([worker(), worker()]);
    return () => { cancelled = true; };
  }, [visibleRows]);

  const exportSummary = () => downloadCsv([
    ['Employee', 'Employee ID', 'Plan Date', 'Start Anchor', 'Anchor Type', 'Planned Visits', 'Expected KM', 'End Anchor', 'Route Status', 'Data Confidence'],
    ...visibleRows.map((row) => [row.employee, row.empId, row.dateLabel, row.startAnchor.label, row.anchorType, row.plannedVisits, kmLabel(routeMetrics[row.id]?.totalKm), row.endAnchor.label, row.routeStatus, row.dataConfidence]),
  ], `employee-tour-plan-${selectedMonth || 'all'}.csv`);
  const exportAudit = () => downloadCsv([
    ['Employee', 'Employee ID', 'Date', 'Sequence', 'Location', 'Dealer / Company', 'Type', 'Check-In Time', 'Latitude', 'Longitude', 'Next Location', 'Segment KM', 'Total Expected KM', 'Coordinate Source', 'Route Status'],
    ...visibleRows.flatMap((row) => enrichRouteAudit(row, routeMetrics[row.id]).map((point) => [row.employee, row.empId, row.dateLabel, point.sequence, point.location, point.company, point.type, dateTime(point.time), point.latitude, point.longitude, point.nextLocation, Number.isFinite(point.segmentKm) ? kmLabel(point.segmentKm) : 'Not calculated', Number.isFinite(point.totalKm) ? kmLabel(point.totalKm) : 'Not calculated', point.coordinateSource, row.routeStatus])),
  ], `employee-tour-route-audit-${selectedMonth || 'all'}.csv`);

  if (!report && !attendance) return <main className="employee-tour-report"><section className="card joint-kpi-empty"><h3>Upload Check-In and Attendance reports</h3><p>This report uses the existing Check-In upload and optional Attendance Report. No separate upload is needed.</p></section></main>;

  return <main className="employee-tour-report">
    <section className="joint-kpi-heading"><div><span className="eyebrow">FIELD MOVEMENT · ATTENDANCE + CHECK-INS</span><h2>EMPLOYEE TOUR PLAN REPORT</h2><p>Daily route sequence, inferred attendance anchors, working distance, and reconciliation.</p></div>
      <div className="joint-kpi-controls"><div><label htmlFor="employee-tour-month">Month</label><select id="employee-tour-month" value={selectedMonth} onChange={(event) => { setMonth(event.target.value); setSelectedId(''); }} disabled={!analysis.months.length}>{analysis.months.map((item) => <option key={item} value={item}>{monthLabel(item)}</option>)}</select></div><div><label htmlFor="employee-tour-employee">Employee</label><select id="employee-tour-employee" value={employeeKey} onChange={(event) => { setEmployeeKey(event.target.value); setSelectedId(''); }}><option value="">All employees</option>{employees.map((item) => <option key={`${item.empId}|${item.employee}`} value={`${item.empId}|${item.employee}`}>{item.employee} · {item.empId || 'No ID'}</option>)}</select></div><button className="secondary" disabled={!visibleRows.length || routeProgress.done < routeProgress.total} onClick={exportSummary}>Export Summary</button><button className="secondary" disabled={!visibleRows.length || routeProgress.done < routeProgress.total} onClick={exportAudit}>Export Route Audit</button></div>
    </section>
    {!attendance && <div className="notice">Attendance Report is not loaded. Anchors cannot be inferred yet, so expected KM will remain uncalculated until attendance history is available.</div>}
    {!report && <div className="notice">Check-In Report is not loaded. Attendance-only days will still be listed.</div>}
    {routeProgress.done < routeProgress.total && !!routeProgress.total && <div className="notice">Calculating cached road routes for {routeProgress.done.toLocaleString()} of {routeProgress.total.toLocaleString()} employee-days. If road routing is unavailable, the app uses straight-line estimates and labels them accordingly.</div>}
    {!analysis.months.length && <section className="card joint-kpi-empty"><h3>No valid employee dates found</h3><p>Load date-wise Attendance or Check-In data to generate this report.</p></section>}
    {!!analysis.months.length && <>
      <section className="card employee-tour-summary table-card"><div className="section-head"><div><span className="eyebrow">DAY-WISE EXPECTED WORKING ROUTE</span><h3>{monthLabel(selectedMonth)} · {visibleRows.length.toLocaleString()} employee-days</h3></div><span className="route-status">Road distance when available · estimated otherwise</span></div><div className="table-scroll"><table><thead><tr><th>Employee</th><th>Employee ID</th><th>Plan Date</th><th>Start Anchor</th><th>Anchor Type</th><th>Planned Visits</th><th>Expected KM</th><th>End Anchor</th><th>Route Status</th><th>Data Confidence</th></tr></thead><tbody>
        {visibleRows.map((row) => {
          const metrics = routeMetrics[row.id];
          const km = Number.isFinite(metrics?.totalKm) ? `${kmLabel(metrics.totalKm)} km` : row.routePoints ? (metrics ? 'Not calculated' : 'Calculating…') : 'Not calculated';
          const mode = metrics?.routingStatus === 'road' ? 'road' : (metrics?.routingStatus === 'straight' ? 'estimated straight-line' : '');
          return <tr key={row.id} className={selectedId === row.id ? 'selected-row' : ''} onClick={() => setSelectedId(row.id)}><td>{row.employee}</td><td>{row.empId || '—'}</td><td>{row.dateLabel}</td><td>{row.startAnchor.label}</td><td>{row.anchorType}</td><td>{row.plannedVisits}</td><td>{km}{mode && <small>{mode}</small>}</td><td>{row.endAnchor.label}</td><td>{row.routeStatus}</td><td>{row.dataConfidence}</td></tr>;
        })}
        {!visibleRows.length && <tr><td colSpan="10" className="empty">No rows for this selection.</td></tr>}
      </tbody></table></div></section>
      {selectedRow && <section className="card employee-tour-audit table-card"><div className="section-head"><div><span className="eyebrow">DETAILED ROUTE AUDIT</span><h3>{selectedRow.employee} · {selectedRow.empId || 'No ID'} · {selectedRow.dateLabel}</h3><p>{selectedRow.startAnchor.label} → {selectedRow.visits.length} chronological visit(s) → {selectedRow.endAnchor.label}</p></div><span className="route-status">{Number.isFinite(selectedMetrics?.totalKm) ? `${kmLabel(selectedMetrics.totalKm)} km · ${selectedMetrics.routingStatus === 'road' ? 'road' : 'estimated straight-line'}` : 'Expected KM unavailable'}</span></div><div className="notice">{selectedRow.routeStatus}. Attendance start: {dateTime(selectedRow.attendanceStart)} · First check-in: {dateTime(selectedRow.firstCheckIn)} · Last check-in: {dateTime(selectedRow.lastCheckIn)} · Attendance stop: {dateTime(selectedRow.attendanceStop)}</div><div className="table-scroll"><table><thead><tr><th>Sequence</th><th>Location</th><th>Dealer / Company</th><th>Type</th><th>Check-In Time</th><th>Latitude</th><th>Longitude</th><th>Next Location</th><th>Segment KM</th><th>Total Expected KM</th><th>Coordinate Source</th></tr></thead><tbody>{selectedAudit.map((item, index) => <tr key={`${selectedRow.id}-${index}`}><td>{item.sequence === 0 ? 'Start' : (item.sequence === selectedAudit.length - 1 ? 'End' : item.sequence)}</td><td>{item.location}</td><td>{item.company || '—'}</td><td>{item.type}</td><td>{item.timeLabel}</td><td>{item.latitude === '' ? '—' : Number(item.latitude).toFixed(6)}</td><td>{item.longitude === '' ? '—' : Number(item.longitude).toFixed(6)}</td><td>{item.nextLocation}</td><td>{Number.isFinite(item.segmentKm) ? kmLabel(item.segmentKm) : '—'}</td><td>{Number.isFinite(item.totalKm) ? kmLabel(item.totalKm) : '—'}</td><td>{item.coordinateSource}</td></tr>)}</tbody></table></div></section>}
      <details className="card employee-anchor-analysis"><summary>View inferred Home / Hotel anchor history ({anchorRows.length} employees)</summary><div className="table-scroll"><table><thead><tr><th>Employee</th><th>Employee ID</th><th>Primary Anchor</th><th>Start Count</th><th>Stop Count</th><th>Matching Start + Stop Days</th><th>Confidence</th><th>Temporary Stay Anchors</th></tr></thead><tbody>{anchorRows.map((item) => <tr key={`${item.empId}|${item.employee}`}><td>{item.employee}</td><td>{item.empId || '—'}</td><td>{item.primaryAnchor}</td><td>{item.startCount}</td><td>{item.stopCount}</td><td>{item.matchedStartStopDays}</td><td>{item.confidence}</td><td>{item.temporaryStays.map((stay) => `${stay.label} (${dateLabel(stay.startDate)}–${dateLabel(stay.endDate)})`).join('; ') || 'None detected'}</td></tr>)}</tbody></table></div></details>
      <p className="employee-tour-method">Anchor inference groups attendance start/stop GPS points within 500 m and uses location text only when coordinates are unavailable. The most frequent paired start/stop location is the regular anchor; a different location repeated on 2+ consecutive days is shown as a temporary stay. Check-ins are sequenced by recorded Check-In time. Each route includes start anchor, every check-in, and actual stop anchor. Road km uses the app’s cached OSRM route service; if unavailable, Haversine straight-line km is clearly labeled as estimated. Missing anchor or visit coordinates leave Expected KM uncalculated and are reported above.</p>
    </>}
  </main>;
}
