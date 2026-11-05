import React, { useEffect, useMemo, useState } from 'react';
import { buildJointWorkingReport, downloadJointWorkingWorkbook } from '../services/jointWorkingReport.js';

const dateLabel = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const timeLabel = (value) => value instanceof Date && Number.isFinite(value.getTime()) ? value.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
const durationLabel = (value) => Number.isFinite(value) ? `${Math.floor(value * 24)}:${String(Math.floor(value * 1440) % 60).padStart(2, '0')}` : '—';

function SearchableMultiSelect({ id, label, options, selected, onChange, allLabel }) {
  const [query, setQuery] = useState('');
  const visible = options.filter((value) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selectedSet = new Set(selected == null ? options : selected);
  const toggleOne = (value) => {
    const next = new Set(selected == null ? options : selected);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange(next.size === options.length ? null : [...next]);
  };
  const toggleVisible = () => {
    const next = new Set(selected == null ? options : selected);
    const matchingAreSelected = visible.every((value) => next.has(value));
    visible.forEach((value) => matchingAreSelected ? next.delete(value) : next.add(value));
    onChange(next.size === options.length ? null : [...next]);
  };
  const selectionLabel = selected == null || selected.length === options.length ? allLabel : selected.length === 0 ? 'None selected' : `${selected.length} selected`;
  return <div className="jw-multiselect-field">
    <label id={`${id}-label`}>{label}</label>
    <details className="jw-multiselect" aria-labelledby={`${id}-label`}>
      <summary aria-label={label}>{selectionLabel}</summary>
      <div className="jw-multiselect-popover">
        <input type="search" aria-label={`Search ${label}`} placeholder={`Search ${label.toLocaleLowerCase()}…`} value={query} onChange={(event) => setQuery(event.target.value)}/>
        <div className="jw-multiselect-actions"><button type="button" onClick={toggleVisible}>{visible.every((value) => selectedSet.has(value)) ? 'Deselect' : 'Select'} matching ({visible.length})</button><button type="button" onClick={() => onChange(null)}>Select all</button><button type="button" onClick={() => onChange([])}>Clear</button></div>
        <div className="jw-multiselect-options">{visible.map((value) => <label key={value}><input type="checkbox" checked={selectedSet.has(value)} onChange={() => toggleOne(value)}/><span>{value}</span></label>)}{!visible.length && <p>No matches</p>}</div>
      </div>
    </details>
  </div>;
}

export default function JointWorkingReport({ report, attendance }) {
  const defaults = useMemo(() => {
    const dates = (report?.records || []).map((row) => row.dateKey).filter(Boolean).sort();
    return { dateFrom: dates[0] || '', dateTo: dates.at(-1) || '', bdoNames: null, jointWorkingNames: null };
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
      <SearchableMultiSelect id="jw-bdo" label="BDO Name · Optional" allLabel="All BDOs" options={options.bdoOptions} selected={filters.bdoNames} onChange={(value) => update('bdoNames', value)}/>
      <SearchableMultiSelect id="jw-name" label="Joint Working Name · Optional" allLabel="All joint working names" options={options.jointWorkingNameOptions} selected={filters.jointWorkingNames} onChange={(value) => update('jointWorkingNames', value)}/>
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
      {generated.attendanceDateFrom && generated.attendanceDateTo && (filters.dateFrom < generated.attendanceDateFrom || filters.dateTo > generated.attendanceDateTo) && <div className="notice">The loaded Attendance Report covers {dateLabel(generated.attendanceDateFrom)} to {dateLabel(generated.attendanceDateTo)}. Dates outside that range have no attendance source, so Start Time and Stop Time remain blank for those visits.</div>}
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
