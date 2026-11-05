import React, { useEffect, useMemo, useState } from 'react';
import { buildJointWorkingReport, downloadJointWorkingWorkbook } from '../services/jointWorkingReport.js';

const dateLabel = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const timeLabel = (value) => value instanceof Date && Number.isFinite(value.getTime()) ? value.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
const durationLabel = (value) => Number.isFinite(value) ? `${Math.floor(value * 24)}:${String(Math.floor(value * 1440) % 60).padStart(2, '0')}` : '—';

export default function JointWorkingReport({ report, attendance }) {
  const defaults = useMemo(() => {
    const dates = (report?.records || []).map((row) => row.dateKey).filter(Boolean).sort();
    return { dateFrom: dates[0] || '', dateTo: dates.at(-1) || '', bdoName: '', jointWorkingName: '' };
  }, [report]);
  const [filters, setFilters] = useState(defaults);
  const [generated, setGenerated] = useState(null);
  useEffect(() => { setFilters(defaults); setGenerated(null); }, [defaults]);
  const options = useMemo(() => buildJointWorkingReport(report, attendance, { dateFrom: '', dateTo: '9999-12-31' }), [report, attendance]);
  const canGenerate = Boolean(report?.records?.length && filters.dateFrom && filters.dateTo && filters.dateFrom <= filters.dateTo);
  const generate = () => setGenerated(buildJointWorkingReport(report, attendance, filters));
  const update = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setGenerated(null); };
  const download = () => {
    if (!generated?.visits.length) return;
    const title = filters.dateFrom === filters.dateTo ? dateLabel(filters.dateFrom) : `${dateLabel(filters.dateFrom)} to ${dateLabel(filters.dateTo)}`;
    downloadJointWorkingWorkbook(generated, title, `joint-working-report-${filters.dateFrom}-to-${filters.dateTo}.xlsx`);
  };

  return <main className="joint-working-report">
    <section className="joint-kpi-heading">
      <div><span className="eyebrow">CHECK-IN REPORT · FIELD REPORTS</span><h2>JOINT WORKING REPORT</h2><p>Date-wise visits, attendance times, and BDO summaries.</p></div>
    </section>
    <section className="card joint-working-filters">
      <div><label htmlFor="jw-date-from">Date From</label><input id="jw-date-from" type="date" min={options.dateFromAvailable || undefined} max={options.dateToAvailable || undefined} value={filters.dateFrom} onChange={(event) => update('dateFrom', event.target.value)}/></div>
      <div><label htmlFor="jw-date-to">Date To</label><input id="jw-date-to" type="date" min={options.dateFromAvailable || undefined} max={options.dateToAvailable || undefined} value={filters.dateTo} onChange={(event) => update('dateTo', event.target.value)}/></div>
      <div><label htmlFor="jw-bdo">BDO Name · Optional</label><select id="jw-bdo" value={filters.bdoName} onChange={(event) => update('bdoName', event.target.value)}><option value="">All BDOs</option>{options.bdoOptions.map((name) => <option key={name}>{name}</option>)}</select></div>
      <div><label htmlFor="jw-name">Joint Working Name · Optional</label><select id="jw-name" value={filters.jointWorkingName} onChange={(event) => update('jointWorkingName', event.target.value)}><option value="">All joint working names</option>{options.jointWorkingNameOptions.map((name) => <option key={name}>{name}</option>)}</select></div>
      <div className="joint-working-actions"><button className="primary" disabled={!canGenerate} onClick={generate}>Generate Report</button><button className="secondary" disabled={!generated?.visits.length} onClick={download}>Download Excel</button></div>
    </section>
    {!report && <div className="notice error">Upload the Check-In Report before generating a Joint Working Report.</div>}
    {report && !attendance && <div className="notice">Attendance Report is unavailable. Start Time and Stop Time will be blank until Attendance data is loaded in the existing upload panel.</div>}
    {filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo && <div className="notice error">Date From must be on or before Date To.</div>}
    {generated && <>
      <section className="joint-working-stats">
        <article className="card"><span>Valid joint working visits</span><strong>{generated.visits.length.toLocaleString()}</strong></article>
        <article className="card"><span>BDOs included</span><strong>{generated.bdoCount.toLocaleString()}</strong></article>
        <article className="card"><span>Unmatched Employee IDs</span><strong>{generated.unmatchedEmployeeIds.toLocaleString()}</strong></article>
        <article className="card"><span>BDO/date attendance gaps</span><strong>{generated.unmatchedAttendanceDays.toLocaleString()}</strong></article>
        <article className="card"><span>Missing Check-In / Check-Out</span><strong>{generated.missingCheckIn.toLocaleString()} / {generated.missingCheckOut.toLocaleString()}</strong></article>
      </section>
      {generated.unmatchedEmployeeIds > 0 && <div className="notice">Attendance could not be matched by Employee ID and date for {generated.unmatchedEmployeeIds} Employee ID(s). Attendance times remain blank for those records.</div>}
      {generated.unmatchedAttendanceDays > 0 && <div className="notice">No matching Attendance record was found for {generated.unmatchedAttendanceDays} BDO/date combination(s). Start Time and Stop Time are blank for those visits.</div>}
      {(generated.missingCheckIn || generated.missingCheckOut) > 0 && <div className="notice">Missing source timestamps: {generated.missingCheckIn} Check-In and {generated.missingCheckOut} Check-Out values. Missing values remain blank; durations are not calculated when either time is unavailable.</div>}
      {generated.duplicateCount > 0 && <div className="notice">Removed {generated.duplicateCount.toLocaleString()} exact duplicate imported row(s). Repeat visits with different source values remain included.</div>}
      {!generated.visits.length ? <section className="card empty">No Joint Working = YES visits match the selected date range and filters.</section> : <>
        <section className="card table-card joint-working-preview"><div className="section-head"><div><span className="eyebrow">VISIT DETAILS PREVIEW</span><h3>{generated.visits.length.toLocaleString()} visits · {generated.bdoCount.toLocaleString()} BDOs</h3></div><span>{dateLabel(filters.dateFrom)} – {dateLabel(filters.dateTo)}</span></div>
          <div className="table-scroll"><table><thead><tr><th>S.No.</th><th>Date</th><th>BDO Name</th><th>Start Time</th><th>Stop Time</th><th>Counter No.</th><th>Check In</th><th>Check Out</th><th>Duration</th><th>Company Name</th><th>Type</th><th>Joint Working Name</th><th>Joint Working Designation</th></tr></thead><tbody>{generated.visits.map((row) => <tr key={`${row.dateKey}-${row.empId}-${row.serial}`}><td>{row.serial}</td><td>{dateLabel(row.dateKey)}</td><td>{row.bdoName || '—'}</td><td>{timeLabel(row.startTime)}</td><td>{timeLabel(row.stopTime)}</td><td>{row.counter}</td><td>{timeLabel(row.checkIn)}</td><td>{timeLabel(row.checkOut)}</td><td>{durationLabel(row.duration)}</td><td>{row.companyName || '—'}</td><td>{row.type || '—'}</td><td>{row.jointWorkingName || '—'}</td><td>{row.jointWorkingDesignation || '—'}</td></tr>)}</tbody></table></div>
        </section>
        <section className="card table-card joint-working-preview"><div className="section-head"><div><span className="eyebrow">SUMMARY PREVIEW</span><h3>Date and BDO totals</h3></div></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>BDO Name</th><th>Total Visits</th><th>First Check In</th><th>Last Check Out</th></tr></thead><tbody>{generated.summary.map((row) => <tr key={`${row.dateKey}-${row.bdoName}`}><td>{dateLabel(row.dateKey)}</td><td>{row.bdoName}</td><td>{row.total}</td><td>{timeLabel(row.firstCheckIn)}</td><td>{timeLabel(row.lastCheckOut)}</td></tr>)}<tr className="joint-working-total"><td></td><td>Grand Total</td><td>{generated.visits.length}</td><td></td><td></td></tr></tbody></table></div></section>
      </>}
    </>}
  </main>;
}
