import React, { useEffect, useMemo, useState } from 'react';
import XLSX from 'xlsx-js-style';
import {
  generateCompOffCandidates,
  mergeCompOffRecords,
  defaultNationalHolidayDates,
  readCompOffHolidays,
  readCompOffRecords,
  saveCompOffHolidays,
  saveCompOffRecords,
} from '../services/compOffService';
import '../comp-off-report.css';

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const columns = [
  ['employeeName', 'Employee Name'], ['employeeCode', 'Employee Code'], ['workingDateLabel', 'Working Date'],
  ['dayType', 'Day Type'], ['checkInStatus', 'Check-in Status'], ['attendanceStatus', 'Attendance Status'],
  ['travelStart', 'Travel Start'], ['travelStop', 'Travel Stop'], ['travelDuration', 'Travel Duration'], ['compOffEligibility', 'Comp-Off Eligibility'],
  ['compOffStatus', 'Comp-Off Status'], ['policyNote', 'Policy / Review Note'],
];

const pad2 = (value) => String(value).padStart(2, '0');
const toDateKey = (value) => {
  let year; let month; let day;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    year = value.getFullYear(); month = value.getMonth() + 1; day = value.getDate();
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return '';
    ({ y: year, m: month, d: day } = parsed);
  } else {
    const text = String(value ?? '').trim();
    let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) [, year, month, day] = match.map((part, index) => index ? Number(part) : part);
    else {
      match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      if (!match) return '';
      [, day, month, year] = match.map((part, index) => index ? Number(part) : part);
    }
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return '';
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

function readHolidayDates(workbook) {
  const dates = new Set();
  let foundHolidayDateColumn = false;
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true });
    if (!rows.length) continue;
    const headers = Object.keys(rows[0]);
    const dateHeader = headers.find((header) => header.trim().toLocaleLowerCase() === 'holiday date');
    if (!dateHeader) continue;
    foundHolidayDateColumn = true;
    const typeHeader = headers.find((header) => header.trim().toLocaleLowerCase() === 'holiday type');
    for (const row of rows) {
      if (typeHeader && !/^national$/i.test(String(row[typeHeader] ?? '').trim())) continue;
      const date = toDateKey(row[dateHeader]);
      if (date) dates.add(date);
    }
  }
  if (!foundHolidayDateColumn) throw new Error('No “Holiday Date” column was found.');
  if (!dates.size) throw new Error('No valid National holiday dates were found.');
  return [...dates].sort();
}

export default function CompOffReport({ report, attendance }) {
  const [records, setRecords] = useState(readCompOffRecords);
  const [holidayDates, setHolidayDates] = useState(readCompOffHolidays);
  const [holidayInput, setHolidayInput] = useState('');
  const [holidayImportMessage, setHolidayImportMessage] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const generated = useMemo(() => generateCompOffCandidates(report, attendance, holidayDates), [report, attendance, holidayDates]);
  useEffect(() => setRecords((previous) => mergeCompOffRecords(previous, generated)), [generated]);
  useEffect(() => saveCompOffRecords(records), [records]);
  useEffect(() => { saveCompOffHolidays(holidayDates); }, [holidayDates]);

  const shown = useMemo(() => records.filter((row) => {
    const search = employeeFilter.trim().toLocaleLowerCase();
    const employeeMatch = !search || `${row.employeeName} ${row.employeeCode}`.toLocaleLowerCase().includes(search);
    return employeeMatch && (!dateFrom || row.workingDate >= dateFrom) && (!dateTo || row.workingDate <= dateTo)
      && (statusFilter === 'ALL' || row.compOffStatus === statusFilter || (statusFilter === 'REVIEW' && row.compOffEligibility === 'REVIEW'));
  }), [records, employeeFilter, dateFrom, dateTo, statusFilter]);

  const summary = useMemo(() => ({
    total: shown.length,
    eligible: shown.filter((row) => row.compOffEligibility === 'ELIGIBLE').length,
    pending: shown.filter((row) => row.compOffStatus === 'Pending').length,
    review: shown.filter((row) => row.compOffEligibility === 'REVIEW').length,
  }), [shown]);

  const updateStatus = (key, compOffStatus) => setRecords((previous) => previous.map((row) => row.key === key ? { ...row, compOffStatus } : row));
  const addHoliday = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayInput)) return;
    setHolidayDates((previous) => [...new Set([...previous, holidayInput])].sort());
    setHolidayInput('');
  };
  const importHolidayReport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const importedDates = readHolidayDates(workbook);
      const reportYears = [...(report?.records || []), ...(attendance?.records || [])]
        .map((row) => Number(String(row.dateKey || '').slice(0, 4))).filter(Boolean);
      const existing = new Set([...holidayDates, ...defaultNationalHolidayDates(reportYears)]);
      const added = importedDates.filter((date) => !existing.has(date));
      setHolidayDates((previous) => [...new Set([...previous, ...importedDates])].sort());
      setHolidayImportMessage(`${added.length} new date${added.length === 1 ? '' : 's'} added from ${file.name}; ${importedDates.length - added.length} already configured.`);
    } catch (error) {
      setHolidayImportMessage(error?.message || 'Could not read this holiday report.');
    }
  };
  const exportRows = () => [columns.map(([, label]) => label), ...shown.map((row) => columns.map(([key]) => row[key]))];
  const downloadCsv = () => {
    const csv = exportRows().map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'comp-off-records.csv'; link.click(); URL.revokeObjectURL(url);
  };
  const downloadExcel = () => {
    const worksheet = XLSX.utils.aoa_to_sheet(exportRows());
    worksheet['!cols'] = columns.map(([, label]) => ({ wch: Math.max(16, label.length + 3) }));
    if (worksheet['!ref']) worksheet['!autofilter'] = { ref: worksheet['!ref'] };
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Comp-Off Records');
    XLSX.writeFile(workbook, 'comp-off-records.xlsx');
  };

  return <main className="comp-off-report">
    <div className="comp-off-heading"><div><span className="eyebrow">ATTENDANCE MANAGEMENT</span><h2>COMP-OFF RECORDS</h2><p>Generated from the loaded Check-In and Attendance reports. Record status is saved in this browser for future tracking.</p></div><div className="comp-off-actions"><button className="secondary" onClick={downloadCsv}>Export CSV</button><button className="secondary" onClick={downloadExcel}>Export Excel</button><button className="secondary" onClick={() => window.print()}>Print</button></div></div>

    <section className="comp-off-policy card">
      <div><b>Automatic rules</b><p>A valid Check-In on Sunday or a configured National Holiday marks the employee PRESENT and creates a Pending Comp-Off record. Without a Check-In, the app never grants Present or Comp-Off automatically; it applies supported travel exclusions and sends ambiguous cases for review.</p></div>
      <div className="comp-off-holidays"><label htmlFor="comp-off-holiday-date">National Holiday dates</label><div className="comp-off-holiday-actions"><input id="comp-off-holiday-date" type="date" value={holidayInput} onChange={(event) => setHolidayInput(event.target.value)}/><button className="secondary" disabled={!holidayInput || holidayDates.includes(holidayInput)} onClick={addHoliday}>Add date</button><label className="secondary comp-off-holiday-upload" htmlFor="comp-off-holiday-file">Upload Holiday Report</label><input id="comp-off-holiday-file" className="comp-off-file-input" type="file" accept=".xlsx,.xls,.csv" onChange={importHolidayReport}/></div><small>The supplied 2026 Holiday Report dates are included by default. For other years, upload an Excel/CSV with a “Holiday Date” column; only NATIONAL rows are imported and saved in this browser.</small>{holidayImportMessage && <small className="comp-off-import-status" role="status">{holidayImportMessage}</small>}{!!holidayDates.length && <div className="comp-off-holiday-list"><b>Additional configured dates</b>{holidayDates.map((date) => <span key={date}>{date}<button type="button" title={`Remove ${date}`} aria-label={`Remove National Holiday ${date}`} onClick={() => setHolidayDates((previous) => previous.filter((item) => item !== date))}>×</button></span>)}</div>}</div>
    </section>

    <section className="comp-off-controls card" aria-label="Comp-Off report filters">
      <label>Employee<input type="search" placeholder="Search name or employee code" value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}/></label>
      <label>From date<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)}/></label>
      <label>To date<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)}/></label>
      <label>Comp-Off status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All records</option><option>Pending</option><option>Availed</option><option>Expired</option><option value="REVIEW">Review required</option></select></label>
      <button className="secondary" onClick={() => { setEmployeeFilter(''); setDateFrom(''); setDateTo(''); setStatusFilter('ALL'); }}>Clear filters</button>
    </section>

    <section className="comp-off-summary" aria-label="Comp-Off summary">
      <article className="card"><span>FILTERED RECORDS</span><strong>{summary.total.toLocaleString()}</strong></article>
      <article className="card"><span>COMP-OFF ELIGIBLE</span><strong>{summary.eligible.toLocaleString()}</strong></article>
      <article className="card"><span>PENDING</span><strong>{summary.pending.toLocaleString()}</strong></article>
      <article className="card"><span>NEEDS REVIEW</span><strong>{summary.review.toLocaleString()}</strong></article>
    </section>

    <section className="card comp-off-table-card"><div className="comp-off-table-title"><div><span className="eyebrow">EMPLOYEE-WISE LEDGER</span><h3>{shown.length.toLocaleString()} Comp-Off record{shown.length === 1 ? '' : 's'}</h3></div><small>Change a qualifying record to Availed or Expired when processed.</small></div>
      {!report && !attendance && !records.length && <div className="notice">Upload the existing Check-In and Attendance reports in the Dashboard to generate records. Saved records will remain available in this browser.</div>}
      {!!report && !attendance && <div className="notice">Attendance Report is not loaded. Check-In based eligibility is calculated, but travel duration and no-Check-In policy evaluation are unavailable.</div>}
      <div className="table-scroll"><table><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{shown.map((row) => <tr key={row.key} className={row.compOffEligibility === 'REVIEW' ? 'comp-off-review' : ''}>
        <td>{row.employeeName || '—'}</td><td>{row.employeeCode || '—'}</td><td>{row.workingDateLabel}</td><td>{row.dayType}</td><td>{row.checkInStatus}</td><td>{row.attendanceStatus}</td><td>{row.travelDuration || '—'}</td><td>{row.compOffEligibility}</td><td>{row.compOffEligibility === 'ELIGIBLE' ? <select aria-label={`Comp-Off status for ${row.employeeName} ${row.workingDateLabel}`} value={row.compOffStatus} onChange={(event) => updateStatus(row.key, event.target.value)}><option>Pending</option><option>Availed</option><option>Expired</option></select> : '—'}</td><td title={row.policyNote}>{row.policyNote}</td>
      </tr>)}{!shown.length && <tr><td colSpan={columns.length}>No Sunday or National Holiday records match these filters.</td></tr>}</tbody></table></div>
    </section>
    <p className="comp-off-footnote">No Check-In does not automatically create Present status. A night trip ending by noon next day is marked Review Required and not Present until its home destination is confirmed; evening Stop Time follows the Leave rule. Travel under 4 hours is flagged for destination review because the uploaded reports do not include employee home locations; where home travel is confirmed, retain the regular Week Off / National Holiday and do not grant Comp-Off. Leave labels are informational; this report does not change leave balances.</p>
  </main>;
}
