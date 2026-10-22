import React, { useMemo } from 'react';
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

export default function ManagerExecutiveQ1Dashboard({ report, month }) {
  const prepared = useMemo(() => prepareManagerExecutiveQ1Rows(report?.records || []), [report]);
  const selectedMonth = prepared.months.includes(month) ? month : (prepared.months.at(-1) || '');
  const result = useMemo(() => selectedMonth ? calculateManagerExecutiveQ1(prepared, selectedMonth) : null, [prepared, selectedMonth]);
  const managerRows = result ? result.buckets.flatMap((bucket) => result.details.managerSummariesByBucket[bucket.key].map((row) => ({ bucket: bucket.label, ...row }))) : [];
  const q1SourceRows = result ? result.buckets.flatMap((bucket) => result.details.sourceRowsByBucket[bucket.key]) : [];
  const q2SourceRows = result ? result.buckets.flatMap((bucket) => result.details.q2SourceRowsByBucket[bucket.key]) : [];
  const q2Total = result ? Object.values(result.q2Values).reduce((sum, count) => sum + count, 0) : 0;

  const exportCsv = (kind) => {
    if (!result) return;
    const name = `manager-joint-working-q1-q2-${selectedMonth}`;
    if (kind === 'summary') download(getManagerExecutiveQ1ExportRows(result, monthLabel(selectedMonth)), `${name}.csv`);
    else if (kind === 'managers') download(tableRows(['Week', 'Manager', 'Emp ID', 'Unique Visit Days', 'Dates', 'Source Rows'], managerRows, ['bucket', 'manager', 'empId', 'visitDays', 'dates', 'sourceRows']), `${name}-manager-summary.csv`);
    else if (kind === 'q2') download(tableRows(['Week', 'Source Row', 'Date', 'Manager', 'Emp ID', 'Manager Designation', 'Type', 'Channel Partner', 'Identifier Source', 'Eligible', 'Unique Contribution', 'Decision / Reason'], q2SourceRows, ['bucket', 'sourceRow', 'date', 'employee', 'empId', 'designation', 'type', 'distributor', 'identifierSource', 'eligible', 'uniqueContribution', 'reason']), `${name}-q2-channel-partner-audit.csv`);
    else download(tableRows(['Week', 'Source Row', 'Date', 'Manager', 'Emp ID', 'Manager Designation', 'Joint Working', 'Joint Working Name', 'Joint Working Designation', 'Matched Executive/BDO Tokens', 'Type', 'Zonal Manager', 'Included', 'Unique Contribution', 'Decision / Reason'], q1SourceRows, ['bucket', 'sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorking', 'jointWorkingName', 'jointWorkingDesignation', 'matchedExecutiveDesignations', 'type', 'zonalManager', 'eligible', 'uniqueContribution', 'reason']), `${name}-q1-source-audit.csv`);
  };

  const exportWorkbook = () => {
    if (!result) return;
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(getManagerExecutiveQ1ExportRows(result, monthLabel(selectedMonth))), 'Q1 Q2 Summary');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(tableRows(['Week', 'Manager', 'Emp ID', 'Unique Visit Days', 'Dates', 'Source Rows'], managerRows, ['bucket', 'manager', 'empId', 'visitDays', 'dates', 'sourceRows'])), 'Q1 Manager Summary');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(tableRows(['Week', 'Source Row', 'Date', 'Manager', 'Emp ID', 'Designation', 'Joint Working', 'Joint Working Name', 'Joint Working Designation', 'Matched Executive/BDO Tokens', 'Type', 'Zonal Manager', 'Eligible', 'Unique Contribution', 'Reason'], q1SourceRows, ['bucket', 'sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorking', 'jointWorkingName', 'jointWorkingDesignation', 'matchedExecutiveDesignations', 'type', 'zonalManager', 'eligible', 'uniqueContribution', 'reason'])), 'Q1 Source Audit');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(tableRows(['Week', 'Source Row', 'Date', 'Manager', 'Emp ID', 'Designation', 'Type', 'Channel Partner', 'Identifier Source', 'Eligible', 'Unique Contribution', 'Reason'], q2SourceRows, ['bucket', 'sourceRow', 'date', 'employee', 'empId', 'designation', 'type', 'distributor', 'identifierSource', 'eligible', 'uniqueContribution', 'reason'])), 'Q2 Partner Audit');
    if (selectedMonth === '2026-10') XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Week', 'Calculated', 'Validation Reference', 'Difference'], ...result.buckets.map(({ key, label }) => [label, result.values[key], OCTOBER_REFERENCE[key], result.values[key] - OCTOBER_REFERENCE[key]])]), 'Q1 Reconciliation');
    XLSX.writeFile(book, `manager-joint-working-q1-q2-${selectedMonth}.xlsx`);
  };

  return <section className="card q3-bucket-card manager-executive-q1">
    <div className="q3-section-title"><div><span className="eyebrow">MANAGER-ONLY KPI · {monthLabel(selectedMonth)}</span><h3>Manager Joint Working Dashboard · Q1 &amp; Q2</h3></div><span>Uses the same month selection as this dashboard.</span></div>
    {!report && <p>Upload a Check-In report to calculate these manager KPIs.</p>}
    {report && !result && <p>No valid visit dates found for the selected Check-In report.</p>}
    {result && <>
      <div className="table-scroll"><table className="q3-bucket-table manager-q1-table"><thead><tr><th>KPI</th>{result.buckets.map((bucket) => <th key={bucket.key}>{bucket.label}</th>)}<th>Total</th></tr></thead><tbody>
        <tr><th>Q.1 · Manager joint working with eligible Executive / BDO</th>{result.buckets.map((bucket) => <td key={bucket.key}>{result.values[bucket.key].toLocaleString()}</td>)}<td>{result.total.toLocaleString()}</td></tr>
        <tr><th>Q.2 · Unique Channel Partners visited by Managers</th>{result.buckets.map((bucket) => <td key={bucket.key}>{result.q2Values[bucket.key].toLocaleString()}</td>)}<td>{q2Total.toLocaleString()}</td></tr>
      </tbody></table></div>
      <p className="manager-q1-method-note">Q.1 sums each Manager's distinct visit dates after Joint Working = YES and eligible Executive/BDO matching. Q.2 counts each normalized Channel Partner once per week across the approved Manager-only group.</p>
      {selectedMonth === '2026-10' && <details className="manager-q1-reconciliation"><summary>October Q.1 weekly reconciliation (reference only)</summary><div className="table-scroll"><table><thead><tr><th>Week</th><th>Calculated from loaded file</th><th>Expected reference</th><th>Difference</th></tr></thead><tbody>{result.buckets.map((bucket) => <tr key={bucket.key}><th>{bucket.label}</th><td>{result.values[bucket.key]}</td><td>{OCTOBER_REFERENCE[bucket.key]}</td><td>{result.values[bucket.key] - OCTOBER_REFERENCE[bucket.key]}</td></tr>)}</tbody></table></div><p>Reference values never replace calculated results.</p></details>}
      <div className="q3-manager-grid manager-q1-audits">
        <AuditTable title="Q.1 · Manager weekly unique visit-days" rows={managerRows} columns={[{ key: 'bucket', label: 'Week' }, { key: 'manager', label: 'Manager' }, { key: 'empId', label: 'Emp ID' }, { key: 'visitDays', label: 'Unique Visit Days' }, { key: 'dates', label: 'Dates' }, { key: 'sourceRows', label: 'Source Rows' }]} />
        <AuditTable title="Q.2 · Unique Channel Partners by week" rows={result.buckets.flatMap((bucket) => result.details.q2UniqueByBucket[bucket.key])} columns={[{ key: 'bucket', label: 'Week' }, { key: 'distributor', label: 'Channel Partner' }, { key: 'identifier', label: 'Normalized Identifier' }, { key: 'identifierSource', label: 'Identifier Source' }, { key: 'manager', label: 'Sample Manager' }, { key: 'sourceRows', label: 'Source Rows' }]} />
      </div>
      <div className="q3-export-bar"><b>Q.1 / Q.2 downloads</b><button className="secondary" onClick={() => exportCsv('summary')}>Q1/Q2 summary CSV</button><button className="secondary" onClick={() => exportCsv('managers')}>Q1 manager summary CSV</button><button className="secondary" onClick={() => exportCsv('q1')}>Q1 source audit CSV</button><button className="secondary" onClick={() => exportCsv('q2')}>Q2 channel partner audit CSV</button><button className="secondary" onClick={exportWorkbook}>Q1/Q2 Excel workbook</button></div>
      <details className="manager-q1-source-audits"><summary>Calculation audits · Q1 {q1SourceRows.length.toLocaleString()} rows · Q2 {q2SourceRows.length.toLocaleString()} rows · {result.details.excludedZonalRows.length.toLocaleString()} zonal exclusions · {result.details.invalidDateRows.length.toLocaleString()} invalid dates</summary>
        <div className="q3-manager-grid"><AuditTable title="Q.1 source-row inclusion / exclusion reasons" rows={q1SourceRows} columns={[{ key: 'bucket', label: 'Week' }, { key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Manager' }, { key: 'empId', label: 'Emp ID' }, { key: 'designation', label: 'Designation' }, { key: 'jointWorking', label: 'Joint Working' }, { key: 'jointWorkingName', label: 'Joint Working Name' }, { key: 'jointWorkingDesignation', label: 'Joint Working Designation' }, { key: 'matchedExecutiveDesignations', label: 'Matched Executive/BDO tokens' }, { key: 'eligible', label: 'Included', render: (row) => row.eligible ? 'Yes' : 'No' }, { key: 'uniqueContribution', label: 'Counted', render: (row) => row.uniqueContribution ? 'Yes' : 'No' }, { key: 'reason', label: 'Reason' }]} />
          <AuditTable title="Q.2 Channel Partner uniqueness audit" rows={q2SourceRows} columns={[{ key: 'bucket', label: 'Week' }, { key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Manager' }, { key: 'designation', label: 'Designation' }, { key: 'type', label: 'Type' }, { key: 'distributor', label: 'Channel Partner' }, { key: 'identifierSource', label: 'Identifier Source' }, { key: 'eligible', label: 'Eligible', render: (row) => row.eligible ? 'Yes' : 'No' }, { key: 'uniqueContribution', label: 'Counted', render: (row) => row.uniqueContribution ? 'Yes' : 'No' }, { key: 'reason', label: 'Reason' }]} />
        </div>
        <details><summary>Zonal manager exclusion rows ({result.details.excludedZonalRows.length.toLocaleString()})</summary><AuditTable title="Excluded rows" rows={result.details.excludedZonalRows} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Manager' }, { key: 'empId', label: 'Emp ID' }, { key: 'zonalManager', label: 'Zonal Manager' }, { key: 'reason', label: 'Reason' }]} /></details>
        <details><summary>Invalid date rows ({result.details.invalidDateRows.length.toLocaleString()})</summary><AuditTable title="Invalid / blank dates" rows={result.details.invalidDateRows} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'rawDate', label: 'Raw Date' }, { key: 'employee', label: 'Sales User' }, { key: 'reason', label: 'Reason' }]} /></details>
      </details>
    </>}
  </section>;
}

function AuditTable({ title, rows, columns, pageSize = 100 }) {
  const [page, setPage] = React.useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const shown = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return <section className="q3-audit-table"><div className="q3-audit-head"><h4>{title}</h4><span>{rows.length.toLocaleString()} rows</span></div><div className="q3-audit-scroll"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{shown.map((row, index) => <tr key={`${row.sourceRow || row.managerKey || row.identifier || index}-${index}`}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? '')}</td>)}</tr>)}{!shown.length && <tr><td colSpan={columns.length}>No rows to display.</td></tr>}</tbody></table></div>{pageCount > 1 && <div className="q3-pagination"><span>Showing {(currentPage * pageSize + 1).toLocaleString()}–{Math.min((currentPage + 1) * pageSize, rows.length).toLocaleString()} of {rows.length.toLocaleString()}</span><button className="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} / {pageCount}</span><button className="secondary" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>}</section>;
}
