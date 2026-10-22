import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { csvValue } from '../utils/formatUtils';
import { calculateManagerExecutiveQ1, getManagerExecutiveQ1ExportRows, prepareManagerExecutiveQ1Rows } from '../services/managerExecutiveQ1Service';

const monthLabel = (key) => {
  if (!key) return '';
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
};
const download = (rows, fileName) => {
  const text = rows.map((row) => row.map(csvValue).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
const tableRows = (headers, rows, fields) => [headers, ...rows.map((row) => fields.map((field) => row[field] ?? ''))];
const OCTOBER_REFERENCE = Object.freeze({ week1: 61, week2: 81, week3: 58, week4: 0 });

export default function ManagerExecutiveQ1Dashboard({ report }) {
  const prepared = useMemo(() => prepareManagerExecutiveQ1Rows(report?.records || []), [report]);
  const [monthOverride, setMonthOverride] = useState('');
  useEffect(() => setMonthOverride(''), [report]);
  const month = prepared.months.includes(monthOverride) ? monthOverride : (prepared.months.at(-1) || '');
  const result = useMemo(() => month ? calculateManagerExecutiveQ1(prepared, month) : null, [prepared, month]);
  const managerRows = result ? result.buckets.flatMap((bucket) => result.details.managerSummariesByBucket[bucket.key].map((row) => ({ bucket: bucket.label, ...row }))) : [];
  const sourceRows = result ? result.buckets.flatMap((bucket) => result.details.sourceRowsByBucket[bucket.key]) : [];

  const exportCsv = (kind) => {
    if (!result) return;
    const name = `manager-executive-q1-${month}`;
    if (kind === 'summary') download(getManagerExecutiveQ1ExportRows(result, monthLabel(month)), `${name}.csv`);
    else if (kind === 'managers') download(tableRows(['Week', 'Manager', 'Emp ID', 'Unique Visit Days', 'Dates', 'Source Rows'], managerRows, ['bucket', 'manager', 'empId', 'visitDays', 'dates', 'sourceRows']), `${name}-manager-summary.csv`);
    else download(tableRows(['Week', 'Source Row', 'Date', 'Manager', 'Emp ID', 'Manager Designation', 'Joint Working', 'Joint Working Name', 'Joint Working Designation', 'Matched Executive/BDO Tokens', 'Type', 'Zonal Manager', 'Included', 'Unique Contribution', 'Decision / Reason'], sourceRows, ['bucket', 'sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorking', 'jointWorkingName', 'jointWorkingDesignation', 'matchedExecutiveDesignations', 'type', 'zonalManager', 'eligible', 'uniqueContribution', 'reason']), `${name}-source-audit.csv`);
  };

  const exportWorkbook = () => {
    if (!result) return;
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(getManagerExecutiveQ1ExportRows(result, monthLabel(month))), 'Q1 Summary');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(tableRows(['Week', 'Manager', 'Emp ID', 'Unique Visit Days', 'Dates', 'Source Rows'], managerRows, ['bucket', 'manager', 'empId', 'visitDays', 'dates', 'sourceRows'])), 'Manager Summary');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(tableRows(['Week', 'Source Row', 'Date', 'Manager', 'Emp ID', 'Manager Designation', 'Joint Working', 'Joint Working Name', 'Joint Working Designation', 'Matched Executive/BDO Tokens', 'Type', 'Zonal Manager', 'Included', 'Unique Contribution', 'Decision / Reason'], sourceRows, ['bucket', 'sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorking', 'jointWorkingName', 'jointWorkingDesignation', 'matchedExecutiveDesignations', 'type', 'zonalManager', 'eligible', 'uniqueContribution', 'reason'])), 'Source Audit');
    if (month === '2026-10') XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Week', 'Calculated', 'Validation Reference', 'Difference'], ...result.buckets.map(({ key, label }) => [label, result.values[key], OCTOBER_REFERENCE[key], result.values[key] - OCTOBER_REFERENCE[key]])]), 'Q1 Reconciliation');
    XLSX.writeFile(book, `manager-executive-q1-${month}.xlsx`);
  };

  return <main className="q3-dashboard manager-executive-q1">
    <section className="joint-kpi-heading"><div><span className="eyebrow">CHECK-IN REPORT · MANAGER JOINT WORKING</span><h2>MANAGER + EXECUTIVE / BDO — Q1</h2><p>Weekly manager-wise unique joint-working days, calculated from the currently loaded Check-In report.</p></div>
      <div className="joint-kpi-controls"><div><label htmlFor="manager-exec-q1-month">Month</label><select id="manager-exec-q1-month" value={month} disabled={!prepared.months.length} onChange={(event) => setMonthOverride(event.target.value)}>{prepared.months.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}</select></div><button className="secondary" disabled={!result} onClick={exportWorkbook}>Export Excel workbook</button><button className="secondary" disabled={!result} onClick={() => exportCsv('summary')}>Export Q1 CSV</button></div>
    </section>
    {!report && <section className="card q3-empty"><h3>Upload a Check-In report to view this Q1 report</h3><p>This report will use the Check-In data already loaded in the application.</p></section>}
    {report && !result && <section className="card q3-empty"><h3>No valid visit dates found</h3><p>The selected Check-In dataset does not contain dates this report can use.</p></section>}
    {result && <>
      <section className="q3-kpi-cards"><article className="q3-kpi-card"><span>Q1 · {monthLabel(month)}</span><strong>{result.total.toLocaleString()}</strong><p>Manager unique joint-working visit-days</p><small>Sum of each Manager's distinct visit dates across the four weeks.</small></article><article className="q3-kpi-card q2"><span>QUALIFYING SOURCE ROWS</span><strong>{result.details.qualifyingSourceRows.toLocaleString()}</strong><p>Executive / BDO joint-working rows</p><small>Source rows can exceed the counted Manager-days.</small></article><article className="q3-kpi-card q3"><span>MANAGERS WITH QUALIFYING VISITS</span><strong>{new Set(managerRows.map((row) => row.managerKey)).size.toLocaleString()}</strong><p>Manager identities</p><small>Emp ID is used when present; normalized name otherwise.</small></article></section>
      <section className="card q3-bucket-card"><div className="q3-section-title"><div><span className="eyebrow">WEEKLY Q1 RESULTS</span><h3>{monthLabel(month)} · Manager-wise unique visit-days</h3></div><small>Each Manager contributes once per calendar date, regardless of check-in count.</small></div><div className="table-scroll"><table className="q3-bucket-table manager-q1-table"><thead><tr><th>Q1 KPI</th>{result.buckets.map((bucket) => <th key={bucket.key}>{bucket.label}</th>)}<th>Total</th></tr></thead><tbody><tr><th>Manager joint working with eligible Executive / BDO</th>{result.buckets.map((bucket) => <td key={bucket.key}>{result.values[bucket.key].toLocaleString()}</td>)}<td>{result.total.toLocaleString()}</td></tr></tbody></table></div></section>
      {month === '2026-10' && <section className="card q3-validation-note manager-q1-reconciliation"><b>October weekly reconciliation (reference only):</b><div className="table-scroll"><table><thead><tr><th>Week</th><th>Calculated from loaded file</th><th>Expected reference</th><th>Difference</th></tr></thead><tbody>{result.buckets.map((bucket) => <tr key={bucket.key}><th>{bucket.label}</th><td>{result.values[bucket.key]}</td><td>{OCTOBER_REFERENCE[bucket.key]}</td><td>{result.values[bucket.key] - OCTOBER_REFERENCE[bucket.key]}</td></tr>)}</tbody></table></div><p>Reference values are displayed for reconciliation only and never replace calculated results.</p></section>}
      <section className="card q3-summary-card"><div className="q3-section-title"><div><span className="eyebrow">MANAGER-WISE SUBTOTALS</span><h3>Unique visit-days by Manager and week</h3></div><span>Subtotals sum to the weekly Q1 values above.</span></div><AuditTable title="Manager weekly summary" rows={managerRows} columns={[{ key: 'bucket', label: 'Week' }, { key: 'manager', label: 'Manager' }, { key: 'empId', label: 'Emp ID' }, { key: 'visitDays', label: 'Unique Visit Days' }, { key: 'dates', label: 'Dates' }, { key: 'sourceRows', label: 'Source Rows' }]} /></section>
      <section className="q3-export-bar"><b>Download supporting data</b><button className="secondary" onClick={() => exportCsv('managers')}>Manager summary CSV</button><button className="secondary" onClick={() => exportCsv('audit')}>Source-row audit CSV</button><button className="secondary" onClick={exportWorkbook}>Excel workbook</button></section>
      <section className="card q3-audits"><div className="q3-section-title"><div><span className="eyebrow">CALCULATION DETAILS</span><h3>{monthLabel(month)} source-row trace</h3></div><span>{sourceRows.filter((row) => row.eligible).length.toLocaleString()} eligible rows · {result.details.excludedZonalRows.length.toLocaleString()} zonal-excluded rows · {result.details.invalidDateRows.length.toLocaleString()} invalid dates</span></div>
        <details><summary>Qualifying and excluded source rows ({sourceRows.length.toLocaleString()})</summary><AuditTable title="Q1 source-row audit" rows={sourceRows} columns={[{ key: 'bucket', label: 'Week' }, { key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Manager' }, { key: 'empId', label: 'Emp ID' }, { key: 'designation', label: 'Manager Designation' }, { key: 'jointWorking', label: 'Joint Working' }, { key: 'jointWorkingName', label: 'Joint Working Name' }, { key: 'jointWorkingDesignation', label: 'Joint Working Designation' }, { key: 'matchedExecutiveDesignations', label: 'Matched Executive/BDO tokens' }, { key: 'type', label: 'Type' }, { key: 'zonalManager', label: 'Zonal Manager' }, { key: 'eligible', label: 'Included', render: (row) => row.eligible ? 'Yes' : 'No' }, { key: 'uniqueContribution', label: 'Visit-day counted', render: (row) => row.uniqueContribution ? 'Yes' : 'No' }, { key: 'reason', label: 'Decision / reason' }]} /></details>
        <details><summary>Zonal manager exclusions ({result.details.excludedZonalRows.length.toLocaleString()} rows)</summary><AuditTable title="Excluded Zonal Manager rows" rows={result.details.excludedZonalRows} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Manager' }, { key: 'empId', label: 'Emp ID' }, { key: 'zonalManager', label: 'Zonal Manager' }, { key: 'reason', label: 'Reason' }]} /></details>
        <details><summary>Invalid or blank source dates ({result.details.invalidDateRows.length.toLocaleString()} rows)</summary><AuditTable title="Date quality audit" rows={result.details.invalidDateRows} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'rawDate', label: 'Date value' }, { key: 'employee', label: 'Sales User' }, { key: 'reason', label: 'Reason' }]} /></details>
        <div className="q3-rules"><h4>Rules applied</h4><p><b>Manager:</b> Sales User Designation must be in this report's Manager-only designation list. TSO, TSI and TSM designations belong to the separate Manager + TSO/TSI/TSM report.</p><p><b>Joint work:</b> Joint Working must be YES, Joint Working Name must be present, and Joint Working Designation must contain at least one allowed Executive/BDO token. Mixed comma-separated cells qualify when one token matches; AGM-SALES and TERRITORY SALES MANAGER are accepted only as extra tokens accompanying an eligible Executive/BDO token.</p><p><b>Counting:</b> Count distinct Manager identity + date per week and sum each Manager's subtotal. Emp ID identifies a Manager, with normalized name as fallback. The four weeks are days 1–7, 8–15, 16–23 and 24–month end.</p><p><b>Zonal exclusions:</b> SHOBHIT GOEL, OTHERS, ARCHIT GARG and SHANTANU ATTARY.</p></div>
      </section>
    </>}
  </main>;
}

function AuditTable({ title, rows, columns, pageSize = 100 }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const shown = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return <section className="q3-audit-table"><div className="q3-audit-head"><h4>{title}</h4><span>{rows.length.toLocaleString()} rows</span></div><div className="q3-audit-scroll"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{shown.map((row, index) => <tr key={`${row.sourceRow || row.managerKey || index}-${index}`}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? '')}</td>)}</tr>)}{!shown.length && <tr><td colSpan={columns.length}>No rows to display.</td></tr>}</tbody></table></div>{pageCount > 1 && <div className="q3-pagination"><span>Showing {(currentPage * pageSize + 1).toLocaleString()}–{Math.min((currentPage + 1) * pageSize, rows.length).toLocaleString()} of {rows.length.toLocaleString()}</span><button className="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} / {pageCount}</span><button className="secondary" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>}</section>;
}
