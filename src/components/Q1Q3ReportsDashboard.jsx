import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { calculateJointWorkingKpis, getJointWorkingKpiExportRows, getKpiBuckets, prepareJointWorkingRows } from '../services/jointWorkingKpi';
import { csvValue } from '../utils/formatUtils';

const monthLabel = (key) => {
  if (!key) return '';
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
};
const totals = (result, question) => {
  const values = result.values[question];
  return values.week1 + values.week2 + values.week3 + values.week4;
};
const downloadCsv = (rows, fileName) => {
  const text = rows.map((row) => row.map(csvValue).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
const simpleRows = (headers, rows, fields) => [headers, ...rows.map((row) => fields.map((field) => row[field] ?? ''))];

function AuditTable({ title, rows, columns, pageSize = 100 }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const shown = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return <section className="q3-audit-table"><div className="q3-audit-head"><h4>{title}</h4><span>{rows.length.toLocaleString()} rows</span></div>
    <div className="q3-audit-scroll"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>
      {shown.map((row, index) => <tr key={`${row.sourceRow || row.managerKey || row.distributorIdentifier || index}-${index}`}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? '')}</td>)}</tr>)}
      {!shown.length && <tr><td colSpan={columns.length}>No rows to display.</td></tr>}
    </tbody></table></div>
    {pageCount > 1 && <div className="q3-pagination"><span>Showing {(currentPage * pageSize + 1).toLocaleString()}–{Math.min((currentPage + 1) * pageSize, rows.length).toLocaleString()} of {rows.length.toLocaleString()}</span><button className="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} / {pageCount}</span><button className="secondary" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
  </section>;
}

export default function Q1Q3ReportsDashboard({ report }) {
  const prepared = useMemo(() => prepareJointWorkingRows(report?.records || []), [report]);
  const [monthOverride, setMonthOverride] = useState('');
  useEffect(() => setMonthOverride(''), [report]);
  const month = prepared.months.includes(monthOverride) ? monthOverride : (prepared.months.at(-1) || '');
  const buckets = useMemo(() => getKpiBuckets(month), [month]);
  const result = useMemo(() => month ? calculateJointWorkingKpis(prepared, month) : null, [prepared, month]);
  const summaryRows = result ? getJointWorkingKpiExportRows(result, monthLabel(month)) : [];
  const q1Rows = result?.details.q1SourceRows || [];
  const q2Rows = result?.details.q2SourceRows || [];
  const q3Rows = result ? buckets.flatMap((bucket) => result.details.q3SourceRowsByBucket[bucket.key].map((row) => ({ bucket: bucket.label, ...row }))) : [];
  const q1ManagerRows = result ? buckets.flatMap((bucket) => result.details.q1ManagerSummariesByBucket[bucket.key].map((row) => ({ bucket: bucket.label, ...row }))) : [];
  const q2ByManager = useMemo(() => {
    const grouped = new Map();
    for (const row of q2Rows) if (row.eligible) {
      const key = row.empId || row.employee;
      const group = grouped.get(key) || { manager: row.employee, empId: row.empId, rows: 0, dealer: 0, other: 0 };
      group.rows += 1; if (row.type.trim().toUpperCase() === 'DEALER') group.dealer += 1; else group.other += 1;
      grouped.set(key, group);
    }
    return [...grouped.values()].sort((a, b) => b.rows - a.rows || a.manager.localeCompare(b.manager));
  }, [q2Rows]);
  const q3ByManager = useMemo(() => {
    const grouped = new Map();
    for (const bucket of buckets) for (const row of result?.details.q3UniqueByBucket[bucket.key] || []) {
      const key = `${bucket.key}\u0000${row.empId || row.senior}`;
      const group = grouped.get(key) || { bucket: bucket.label, senior: row.senior, empId: row.empId, distributors: 0 };
      group.distributors += 1; grouped.set(key, group);
    }
    return [...grouped.values()].sort((a, b) => a.bucket.localeCompare(b.bucket) || a.senior.localeCompare(b.senior));
  }, [buckets, result]);
  const octoberReference = month === '2026-10' ? { q1: 32, q2: 102, q3: 30 } : null;

  const workbookExport = () => {
    if (!result) return;
    const workbook = XLSX.utils.book_new();
    const sheets = [
      ['Summary', summaryRows],
      ['Q1 Manager Summary', simpleRows(['Bucket', 'Manager / Sales User', 'Emp ID', 'Unique Visit Days', 'Qualifying Rows', 'Dates', 'Types'], q1ManagerRows, ['bucket', 'manager', 'empId', 'visitDays', 'qualifyingRows', 'dates', 'types'])],
      ['Q1 Source Audit', simpleRows(['Source Row', 'Date', 'Employee', 'Emp ID', 'Sales Designation', 'Joint Working Designation', 'Joint Working', 'Joint Working Name', 'Type', 'Zonal Manager', 'Reason', 'Eligible'], q1Rows, ['sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorkingDesignation', 'jointWorking', 'jointWorkingName', 'type', 'zonalManager', 'reason', 'eligible'])],
      ['Q2 Source Audit', simpleRows(['Source Row', 'Date', 'Employee', 'Emp ID', 'Sales Designation', 'Joint Working Designation', 'Joint Working', 'Joint Working Name', 'Type', 'Zonal Manager', 'Company', 'Partner Code', 'Dealer Channel Partner', 'Reason', 'Eligible'], q2Rows, ['sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorkingDesignation', 'jointWorking', 'jointWorkingName', 'type', 'zonalManager', 'company', 'dealerChannelPartnerCode', 'dealerChannelPartner', 'reason', 'eligible'])],
      ['Q3 Source Audit', simpleRows(['Bucket', 'Source Row', 'Date', 'Employee', 'Emp ID', 'Designation', 'Type', 'Distributor Identifier', 'Reason', 'Eligible', 'Unique Contribution'], q3Rows, ['bucket', 'sourceRow', 'date', 'employee', 'empId', 'designation', 'type', 'distributorIdentifier', 'reason', 'eligible', 'uniqueContribution'])],
      ['Q3 By Senior', simpleRows(['Bucket', 'Senior', 'Emp ID', 'Unique distributors credited to this Senior*'], q3ByManager, ['bucket', 'senior', 'empId', 'distributors'])],
      ['Zonal Exclusions', simpleRows(['Source Row', 'Date', 'Employee', 'Emp ID', 'Sales Designation', 'Joint Working Designation', 'Joint Working', 'Joint Working Name', 'Type', 'Zonal Manager', 'Reason'], result.details.excludedZonalManagerSourceRows, ['sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorkingDesignation', 'jointWorking', 'jointWorkingName', 'type', 'zonalManager', 'reason'])],
      ['Designation Audit', simpleRows(['Field', 'Designation', 'Rows', 'Approved Context', 'Sample Employees', 'Source Rows'], result.details.designationAudit, ['field', 'designation', 'rows', 'approvalContext', 'sampleEmployees', 'sampleSourceRows'])],
      ['Data Quality', simpleRows(['Source Row', 'Date', 'Employee', 'Emp ID', 'Designation', 'Joint Working Designation', 'Joint Working', 'Joint Working Name', 'Type', 'Issue'], result.details.dataQualityAudit, ['sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorkingDesignation', 'jointWorking', 'jointWorkingName', 'type', 'issue'])],
      ['Invalid Dates', simpleRows(['Source Row', 'Employee', 'Emp ID', 'Raw Date', 'Reason'], result.details.invalidDateRows, ['sourceRow', 'employee', 'empId', 'rawDate', 'reason'])],
    ];
    for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
    XLSX.writeFile(workbook, `q1-q3-reports-${month}.xlsx`);
  };
  const exportCsv = (kind) => {
    if (!result) return;
    const exports = {
      summary: ['summary', summaryRows],
      q1: ['q1-source-audit', simpleRows(['Source Row', 'Date', 'Employee', 'Emp ID', 'Designation', 'Joint Working Designation', 'Joint Working', 'Joint Working Name', 'Type', 'Zonal Manager', 'Reason', 'Eligible'], q1Rows, ['sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorkingDesignation', 'jointWorking', 'jointWorkingName', 'type', 'zonalManager', 'reason', 'eligible'])],
      q2: ['q2-source-audit', simpleRows(['Source Row', 'Date', 'Employee', 'Emp ID', 'Designation', 'Joint Working Designation', 'Joint Working', 'Joint Working Name', 'Type', 'Zonal Manager', 'Company', 'Partner Code', 'Dealer Channel Partner', 'Reason', 'Eligible'], q2Rows, ['sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorkingDesignation', 'jointWorking', 'jointWorkingName', 'type', 'zonalManager', 'company', 'dealerChannelPartnerCode', 'dealerChannelPartner', 'reason', 'eligible'])],
      q3: ['q3-source-audit', simpleRows(['Bucket', 'Source Row', 'Date', 'Employee', 'Emp ID', 'Designation', 'Type', 'Distributor Identifier', 'Reason', 'Eligible', 'Unique Contribution'], q3Rows, ['bucket', 'sourceRow', 'date', 'employee', 'empId', 'designation', 'type', 'distributorIdentifier', 'reason', 'eligible', 'uniqueContribution'])],
      manager: ['manager-summary', simpleRows(['Bucket', 'Manager', 'Emp ID', 'Visit Days', 'Qualifying Rows', 'Dates', 'Types'], q1ManagerRows, ['bucket', 'manager', 'empId', 'visitDays', 'qualifyingRows', 'dates', 'types'])],
      exclusions: ['zonal-exclusions', simpleRows(['Source Row', 'Date', 'Employee', 'Emp ID', 'Designation', 'Joint Working Designation', 'Joint Working', 'Joint Working Name', 'Type', 'Zonal Manager', 'Reason'], result.details.excludedZonalManagerSourceRows, ['sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorkingDesignation', 'jointWorking', 'jointWorkingName', 'type', 'zonalManager', 'reason'])],
      designations: ['designation-audit', simpleRows(['Field', 'Designation', 'Rows', 'Approved Context', 'Sample Employees', 'Source Rows'], result.details.designationAudit, ['field', 'designation', 'rows', 'approvalContext', 'sampleEmployees', 'sampleSourceRows'])],
      quality: ['data-quality-audit', simpleRows(['Source Row', 'Date', 'Employee', 'Emp ID', 'Designation', 'Joint Working Designation', 'Joint Working', 'Joint Working Name', 'Type', 'Issue'], result.details.dataQualityAudit, ['sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorkingDesignation', 'jointWorking', 'jointWorkingName', 'type', 'issue'])],
      dates: ['invalid-dates', simpleRows(['Source Row', 'Employee', 'Emp ID', 'Raw Date', 'Reason'], result.details.invalidDateRows, ['sourceRow', 'employee', 'empId', 'rawDate', 'reason'])],
    };
    const [name, rows] = exports[kind]; downloadCsv(rows, `q1-q3-${name}-${month}.csv`);
  };

  return <main className="q3-dashboard">
    <section className="joint-kpi-heading"><div><span className="eyebrow">CHECK-IN REPORT · MANAGEMENT REPORTS</span><h2>Q1–Q3 REPORTS DASHBOARD</h2><p>Manager joint working, Dealer/Other visits, and unique Channel Partner reach.</p></div><div className="joint-kpi-controls"><div><label htmlFor="q3-month">Month</label><select id="q3-month" value={month} disabled={!prepared.months.length} onChange={(event) => setMonthOverride(event.target.value)}>{prepared.months.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}</select></div><button className="secondary" disabled={!result} onClick={workbookExport}>Export Excel workbook</button><button className="secondary" disabled={!result} onClick={() => exportCsv('summary')}>Export KPI CSV</button></div></section>
    {!report && <section className="card q3-empty"><h3>Upload a Check-In Report to view Q1–Q3</h3><p>The dashboard reads the currently loaded report in this application.</p></section>}
    {report && !result && <section className="card q3-empty"><h3>No valid dates found in the Date column</h3><p>Rows with missing or invalid dates cannot be assigned to a month, but remain available in the date audit.</p><button className="secondary" onClick={() => downloadCsv(simpleRows(['Source Row', 'Employee', 'Emp ID', 'Raw Date', 'Reason'], prepared.invalidDateRows, ['sourceRow', 'employee', 'empId', 'rawDate', 'reason']), 'q1-q3-invalid-dates.csv')}>Export invalid dates CSV ({prepared.invalidDateRows.length.toLocaleString()})</button></section>}
    {result && <>
      <section className="q3-kpi-cards">{[['Q1', 'Manager-wise unique visit-days', 'q1'], ['Q2', 'DEALER + OTHER qualifying rows', 'q2'], ['Q3', 'Unique Channel Partners', 'q3']].map(([tag, label, key]) => <article className={`q3-kpi-card ${key}`} key={key}><span>{tag} · {monthLabel(month)}</span><strong>{totals(result, key).toLocaleString()}</strong><p>{label}</p><small>Month total = sum of four weekly buckets</small></article>)}</section>
      <section className="card q3-bucket-card"><div className="q3-section-title"><div><span className="eyebrow">BUCKET COMPARISON</span><h3>{monthLabel(month)} KPI results</h3></div><small>First half = Week 1 + Week 2 · Second half = Week 3 + Week 4</small></div><div className="table-scroll"><table className="q3-bucket-table"><thead><tr><th>KPI</th>{buckets.map((bucket) => <th key={bucket.key}>{bucket.label}</th>)}</tr></thead><tbody>{[['Q1 · Manager unique visit-days', 'q1'], ['Q2 · Dealer + Other rows', 'q2'], ['Q3 · Unique Channel Partners', 'q3']].map(([label, key]) => <tr key={key}><th>{label}</th>{buckets.map((bucket) => <td key={bucket.key}>{result.values[key][bucket.key].toLocaleString()}</td>)}</tr>)}</tbody></table></div></section>
      <section className="q3-chart-grid">{[['Q1', 'Manager-wise unique visit-days', 'q1'], ['Q2', 'DEALER + OTHER rows', 'q2'], ['Q3', 'Unique Channel Partners', 'q3']].map(([label, description, key]) => { const max = Math.max(1, ...buckets.map(({ key: bucket }) => result.values[key][bucket])); return <article className="card q3-chart-card" key={key}><h3>{label} · {description}</h3>{buckets.map((bucket) => <div className="q3-chart-row" key={bucket.key}><span title={bucket.label}>{bucket.label}</span><div><i style={{ width: `${Math.max(result.values[key][bucket.key] ? 3 : 0, result.values[key][bucket.key] / max * 100)}%` }}/></div><b>{result.values[key][bucket.key].toLocaleString()}</b></div>)}</article>; })}</section>
      <section className="card q3-summary-card"><div className="q3-section-title"><div><span className="eyebrow">MANAGER SUMMARIES</span><h3>Employee contribution</h3></div><span>Q3 attribution is descriptive; overall Q3 is deduplicated globally per bucket.</span></div><div className="q3-manager-grid"><AuditTable title="Q1 · Manager-wise visit days by bucket" rows={q1ManagerRows} columns={[{ key: 'bucket', label: 'Bucket' }, { key: 'manager', label: 'Manager / Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'visitDays', label: 'Unique Days' }, { key: 'qualifyingRows', label: 'Source Rows' }, { key: 'dates', label: 'Dates' }]} /><AuditTable title="Q2 · Qualifying rows by manager (month total)" rows={q2ByManager} columns={[{ key: 'manager', label: 'Manager / Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'rows', label: 'Total Rows' }, { key: 'dealer', label: 'DEALER' }, { key: 'other', label: 'OTHER' }]} /><AuditTable title="Q3 · Unique partners attributed to each Senior within each bucket*" rows={q3ByManager} columns={[{ key: 'bucket', label: 'Bucket' }, { key: 'senior', label: 'Senior Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'distributors', label: 'Partners seen' }]} /></div><p className="q3-scope-note">*Q3 dashboard totals use a single global Set per bucket, so the same distributor visited by different Seniors is counted once overall. Senior rows above are illustrative attribution and must not be summed to reproduce Q3.</p></section>
      <section className="q3-export-bar"><b>Download supporting data</b>{[['q1','Q1 source audit CSV'], ['q2','Q2 source audit CSV'], ['q3','Q3 source audit CSV'], ['manager','Manager summary CSV'], ['exclusions','Zonal exclusions CSV'], ['designations','Designation audit CSV'], ['quality','Data quality CSV'], ['dates','Invalid dates CSV']].map(([kind, label]) => <button className="secondary" key={kind} onClick={() => exportCsv(kind)}>{label}</button>)}</section>
      <section className="card q3-audits"><div className="q3-section-title"><div><span className="eyebrow">CALCULATION TRANSPARENCY</span><h3>{monthLabel(month)} source-row audits & exclusions</h3></div><span>All output uses the KPI service result shown above.</span></div>
        <details><summary>Q1 source rows · {q1Rows.length.toLocaleString()} rows · {q1Rows.filter((row) => row.eligible).length.toLocaleString()} eligible</summary><AuditTable title="Q1 eligibility audit" rows={q1Rows} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Sales User / Manager' }, { key: 'empId', label: 'Emp ID' }, { key: 'designation', label: 'Sales User Designation' }, { key: 'jointWorkingDesignation', label: 'Joint Working Designation' }, { key: 'jointWorking', label: 'Joint Working' }, { key: 'jointWorkingName', label: 'Joint Working Name' }, { key: 'type', label: 'Type' }, { key: 'eligible', label: 'Included', render: (row) => row.eligible ? 'Yes' : 'No' }, { key: 'reason', label: 'Decision / reason' }]} /></details>
        <details><summary>Q2 source rows · {q2Rows.length.toLocaleString()} rows · {q2Rows.filter((row) => row.eligible).length.toLocaleString()} eligible</summary><AuditTable title="Q2 eligibility audit" rows={q2Rows} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Sales User / Manager' }, { key: 'empId', label: 'Emp ID' }, { key: 'designation', label: 'Sales User Designation' }, { key: 'jointWorkingDesignation', label: 'Joint Working Designation' }, { key: 'jointWorking', label: 'Joint Working' }, { key: 'jointWorkingName', label: 'Joint Working Name' }, { key: 'type', label: 'Type' }, { key: 'eligible', label: 'Included', render: (row) => row.eligible ? 'Yes' : 'No' }, { key: 'reason', label: 'Decision / reason' }]} /></details>
        <details><summary>Q3 source rows · {q3Rows.length.toLocaleString()} audited bucket rows · {result.details.q3QualifyingRows.toLocaleString()} qualifying source rows</summary><AuditTable title="Q3 source rows by bucket" rows={q3Rows} columns={[{ key: 'bucket', label: 'Bucket' }, { key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Senior Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'designation', label: 'Designation' }, { key: 'type', label: 'Type' }, { key: 'distributorIdentifier', label: 'Distributor Identifier' }, { key: 'eligible', label: 'Eligible', render: (row) => row.eligible ? 'Yes' : 'No' }, { key: 'uniqueContribution', label: 'Counted', render: (row) => row.uniqueContribution ? 'Yes' : 'No' }, { key: 'reason', label: 'Decision / reason' }]} /></details>
        <details><summary>Zonal Manager exclusions · {result.details.excludedZonalManagerSourceRows.length.toLocaleString()} source rows</summary><AuditTable title="Rows excluded by Zonal Manager" rows={result.details.excludedZonalManagerSourceRows} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'zonalManager', label: 'Zonal Manager' }, { key: 'designation', label: 'Designation' }, { key: 'type', label: 'Type' }, { key: 'reason', label: 'Reason' }]} /></details>
        <details><summary>Designation & data-quality audit · {result.details.designationAudit.length.toLocaleString()} values</summary><AuditTable title="Designation values and approved contexts" rows={result.details.designationAudit} columns={[{ key: 'field', label: 'Source Field' }, { key: 'designation', label: 'Value' }, { key: 'rows', label: 'Rows' }, { key: 'approvalContext', label: 'Approved context' }, { key: 'sampleEmployees', label: 'Sample employees' }, { key: 'sampleSourceRows', label: 'Sample source rows' }]} /></details>
        <details><summary>Row-level data quality flags · {result.details.dataQualityAudit.length.toLocaleString()} records</summary><AuditTable title="Identity, Joint Working and distributor data quality" rows={result.details.dataQualityAudit} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'designation', label: 'Sales User Designation' }, { key: 'jointWorkingDesignation', label: 'Joint Working Designation' }, { key: 'jointWorking', label: 'Joint Working' }, { key: 'jointWorkingName', label: 'Joint Working Name' }, { key: 'type', label: 'Type' }, { key: 'issue', label: 'Data quality finding' }]} /></details>
        <details><summary>Date quality audit · {result.details.invalidDateRows.length.toLocaleString()} rows with blank or invalid Date</summary><AuditTable title="Invalid or blank source Date rows (whole loaded file)" rows={result.details.invalidDateRows} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'rawDate', label: 'Raw Date' }, { key: 'employee', label: 'Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'reason', label: 'Reason' }]} /></details>
        <div className="q3-rules"><h4>Rules applied</h4><p><b>Q1:</b> approved Manager Sales User Designation + Joint Working YES + nonblank Joint Working Name + approved Executive/BDO Joint Working Designation; Emp ID identifies the Manager, normalized name is the fallback. Count unique Manager + Date per bucket, then sum Manager subtotals.</p><p><b>Q2:</b> same role and joint-working conditions as Q1, with Type DEALER or OTHER; every qualifying source row counts.</p><p><b>Q3:</b> approved Q3 Senior Sales User Designation + Type CHANNEL PARTNER. Joint Working status is ignored. Distributor key priority is Dealer Channel Partner Code, Dealer Channel Partner, Company Name; normalized comparison is globally unique within each bucket.</p><p><b>Zonal exclusions:</b> SHOBHIT GOEL, OTHERS, ARCHIT GARG, SHANTANU ATTARY.</p><p><b>Calendar:</b> Week 1 = 1–7; Week 2 = 8–15; First Half = 1–15; Week 3 = 16–23; Week 4 = 24–month end; Second Half = 16–month end. Half totals are the sums of their displayed weekly buckets.</p></div>
      </section>
      {octoberReference && <section className="q3-validation-note"><b>October 1–15 reconciliation (reference only):</b> {Object.entries(octoberReference).map(([key, target]) => <span key={key}> {key.toUpperCase()} {result.values[key].firstHalf.toLocaleString()} / reference {target} — {result.values[key].firstHalf === target ? 'matches' : 'differs'}. </span>)} Q1 is calculated as distinct calendar dates per Manager ID, so its result can differ from the earlier G-column pivot screenshot, whose G subtotals match the count of populated Type categories by Manager. The approved Q1 date rule and this file’s source rows determine the displayed KPI; reference values are never substituted.</section>}
    </>}
  </main>;
}
