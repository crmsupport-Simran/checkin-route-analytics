import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { getKpiBuckets } from '../services/jointWorkingKpi';
import { calculateQ1Q3Reports, getQ1Q3ExportRows, getQ1WeeklyReconciliationRows, prepareQ1Q3ReportRows } from '../services/q1Q3ReportsService';
import ManagerExecutiveQ1Dashboard from './ManagerExecutiveQ1Dashboard';
import { calculateManagerExecutiveQ1, prepareManagerExecutiveQ1Rows } from '../services/managerExecutiveQ1Service';
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
const normalizedIdentity = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase();
const auditVisitKey = (row) => `${String(row.empId ?? '').trim() ? `ID:${normalizedIdentity(row.empId)}` : `NAME:${normalizedIdentity(row.employee)}`}\u0000${row.dateKey}`;

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
  const prepared = useMemo(() => prepareQ1Q3ReportRows(report?.records || []), [report]);
  const [monthOverride, setMonthOverride] = useState('');
  useEffect(() => setMonthOverride(''), [report]);
  const month = prepared.months.includes(monthOverride) ? monthOverride : (prepared.months.at(-1) || '');
  const buckets = useMemo(() => getKpiBuckets(month), [month]);
  const result = useMemo(() => month ? calculateQ1Q3Reports(prepared, month) : null, [prepared, month]);
  const managerOnlyPrepared = useMemo(() => prepareManagerExecutiveQ1Rows(report?.records || []), [report]);
  const managerOnlyResult = useMemo(() => month ? calculateManagerExecutiveQ1(managerOnlyPrepared, month) : null, [managerOnlyPrepared, month]);
  const summaryRows = result ? getQ1Q3ExportRows(result, monthLabel(month)) : [];
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
  const q1ReconciliationRows = result ? getQ1WeeklyReconciliationRows(result, monthLabel(month)) : [];
  const q1DiagnosticRows = result ? buckets.filter(({ key }) => key.startsWith('week')).map(({ key }) => {
    const d = result.details.q1WeeklyDiagnostics[key];
    return {
      bucket: d.bucket, sourceRows: d.rowsInBucket, managerDesignationRows: d.managerDesignationRows,
      afterZonalExclusions: d.rowsAfterZonalExclusions, jointWorkingYesRows: d.jointWorkingYesRows,
      namedPartnerRows: d.namedPartnerRows, eligibleExecutiveBdoRows: d.eligibleExecutiveBdoRows,
      dealerRows: d.dealerRows, managerIdentityRows: d.managerIdentityRows, qualifyingSourceRows: d.qualifyingSourceRows,
      duplicateSourceRowsRemoved: d.duplicateSourceRowsRemoved, finalUniqueManagerDays: d.finalUniqueManagerDays,
    };
  }) : [];
  const q1ExclusionRows = result ? buckets.filter(({ key }) => key.startsWith('week')).flatMap(({ key }) =>
    Object.entries(result.details.q1WeeklyDiagnostics[key].exclusionReasons).map(([reason, rows]) => ({ bucket: result.details.q1WeeklyDiagnostics[key].bucket, reason, rows }))) : [];
  const q1ScopeRows = result && managerOnlyResult ? buckets.filter(({ key }) => key.startsWith('week')).map(({ key, label }) => {
    const asVisitDays = (rows) => new Set(rows.flatMap((manager) => manager.dates.split(', ').filter(Boolean).map((date) => `${manager.managerKey}\u0000${date}`)));
    const existingKeys = asVisitDays(managerOnlyResult.details.managerSummariesByBucket[key]);
    const reportKeys = asVisitDays(result.details.q1ManagerSummariesByBucket[key]);
    const common = [...existingKeys].filter((visit) => reportKeys.has(visit)).length;
    return { bucket: label, managerOnly: existingKeys.size, shared: common, managerOnlyOnly: existingKeys.size - common, q1Q3Only: reportKeys.size - common, q1Q3: reportKeys.size };
  }) : [];
  const q1ScopeDifferenceRows = result && managerOnlyResult ? buckets.filter(({ key }) => key.startsWith('week')).flatMap(({ key, label }) => {
    const visitDays = (summaries) => new Map(summaries.flatMap((manager) => manager.dates.split(', ').filter(Boolean).map((date) => [`${manager.managerKey}\u0000${date}`, { manager: manager.manager, empId: manager.empId, date }])));
    const managerOnlyDays = visitDays(managerOnlyResult.details.managerSummariesByBucket[key]);
    const q1Q3Days = visitDays(result.details.q1ManagerSummariesByBucket[key]);
    const sourceMap = (rows) => {
      const map = new Map();
      for (const row of rows) if (row.eligible) {
        const visitKey = auditVisitKey(row);
        if (!map.has(visitKey)) map.set(visitKey, []);
        map.get(visitKey).push(row);
      }
      return map;
    };
    const oldSources = sourceMap(managerOnlyResult.details.sourceRowsByBucket[key]);
    const newSources = sourceMap(q1Rows);
    const toDetail = (visitKey, visit, scope) => {
      const sources = (scope === 'Manager-only' ? oldSources : newSources).get(visitKey) || [];
      const isOldOnly = scope === 'Manager-only';
      return {
        bucket: label, scope, manager: visit.manager, empId: visit.empId, date: visit.date,
        sourceRows: sources.map((row) => row.sourceRow).sort((a, b) => a - b).join(', '),
        salesDesignations: [...new Set(sources.map((row) => row.designation).filter(Boolean))].join(', '),
        types: [...new Set(sources.map((row) => row.type).filter(Boolean))].join(', '),
        reason: isOldOnly
          ? 'Existing Manager-only Q.1 includes this visit-day; the separate Q1 rule removes it because Type is not DEALER.'
          : 'Separate Q1 includes this DEALER visit-day under the added TSO/TSI/TSM role group; it is outside the existing Manager-only scope.',
      };
    };
    const differences = [];
    for (const [visitKey, visit] of managerOnlyDays) if (!q1Q3Days.has(visitKey)) differences.push(toDetail(visitKey, visit, 'Manager-only'));
    for (const [visitKey, visit] of q1Q3Days) if (!managerOnlyDays.has(visitKey)) differences.push(toDetail(visitKey, visit, 'Q1–Q3 only'));
    return differences;
  }) : [];

  const workbookExport = () => {
    if (!result) return;
    const workbook = XLSX.utils.book_new();
    const sheets = [
      ['Summary', summaryRows],
      ['Q1 Reconciliation', q1ReconciliationRows],
      ['Q1 Scope Differences', simpleRows(['Week', 'Scope', 'Manager', 'Emp ID', 'Date', 'Source Rows', 'Sales Designations', 'Types', 'Reason'], q1ScopeDifferenceRows, ['bucket', 'scope', 'manager', 'empId', 'date', 'sourceRows', 'salesDesignations', 'types', 'reason'])],
      ['Q1 Stage Diagnostics', simpleRows(['Week', 'Selected-month source rows in bucket', 'Approved Sales Designation', 'After Zonal exclusions', 'Joint Working YES', 'Named Joint Working Name', 'Approved Executive/BDO token', 'Type DEALER', 'Manager identity available', 'Qualifying source rows', 'Duplicate rows removed', 'Final unique Manager-days'], q1DiagnosticRows, ['bucket', 'sourceRows', 'managerDesignationRows', 'afterZonalExclusions', 'jointWorkingYesRows', 'namedPartnerRows', 'eligibleExecutiveBdoRows', 'dealerRows', 'managerIdentityRows', 'qualifyingSourceRows', 'duplicateSourceRowsRemoved', 'finalUniqueManagerDays'])],
      ['Q1 Manager Summary', simpleRows(['Bucket', 'Manager / Sales User', 'Emp ID', 'Unique Visit Days', 'Qualifying Rows', 'Dates', 'Types'], q1ManagerRows, ['bucket', 'manager', 'empId', 'visitDays', 'qualifyingRows', 'dates', 'types'])],
      ['Q1 Source Audit', simpleRows(['Week', 'Source Row', 'Date', 'Manager + Date Grouping Key', 'Employee', 'Emp ID', 'Sales Designation', 'Joint Working Designation', 'Matched Executive / BDO Tokens', 'Joint Working', 'Joint Working Name', 'Type', 'Zonal Manager', 'Reason', 'Eligible', 'Unique Contribution'], q1Rows, ['bucket', 'sourceRow', 'date', 'groupingKey', 'employee', 'empId', 'designation', 'jointWorkingDesignation', 'matchedExecutiveBdoTokens', 'jointWorking', 'jointWorkingName', 'type', 'zonalManager', 'reason', 'eligible', 'uniqueContribution'])],
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
      reconciliation: ['q1-weekly-reconciliation', q1ReconciliationRows],
      scope: ['q1-scope-differences', simpleRows(['Week', 'Scope', 'Manager', 'Emp ID', 'Date', 'Source Rows', 'Sales Designations', 'Types', 'Reason'], q1ScopeDifferenceRows, ['bucket', 'scope', 'manager', 'empId', 'date', 'sourceRows', 'salesDesignations', 'types', 'reason'])],
      diagnostics: ['q1-stage-diagnostics', simpleRows(['Week', 'Selected-month source rows in bucket', 'Approved Sales Designation', 'After Zonal exclusions', 'Joint Working YES', 'Named Joint Working Name', 'Approved Executive/BDO token', 'Type DEALER', 'Manager identity available', 'Qualifying source rows', 'Duplicate rows removed', 'Final unique Manager-days'], q1DiagnosticRows, ['bucket', 'sourceRows', 'managerDesignationRows', 'afterZonalExclusions', 'jointWorkingYesRows', 'namedPartnerRows', 'eligibleExecutiveBdoRows', 'dealerRows', 'managerIdentityRows', 'qualifyingSourceRows', 'duplicateSourceRowsRemoved', 'finalUniqueManagerDays'])],
      q1exclusions: ['q1-exclusion-reasons', simpleRows(['Week', 'Exclusion reason', 'Source rows'], q1ExclusionRows, ['bucket', 'reason', 'rows'])],
      q1: ['q1-source-audit', simpleRows(['Week', 'Source Row', 'Date', 'Manager + Date Grouping Key', 'Employee', 'Emp ID', 'Designation', 'Joint Working Designation', 'Matched Executive / BDO Tokens', 'Joint Working', 'Joint Working Name', 'Type', 'Zonal Manager', 'Reason', 'Eligible', 'Unique Contribution'], q1Rows, ['bucket', 'sourceRow', 'date', 'groupingKey', 'employee', 'empId', 'designation', 'jointWorkingDesignation', 'matchedExecutiveBdoTokens', 'jointWorking', 'jointWorkingName', 'type', 'zonalManager', 'reason', 'eligible', 'uniqueContribution'])],
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
      <section className="q3-kpi-cards"><div className="q3-section-title q3-full-row"><div><span className="eyebrow">MANAGER + TSO/TSI/TSM REPORT · SEPARATE RULES</span><h3>Q1–Q3 KPI summary · {monthLabel(month)}</h3></div><small>These Q1–Q3 results are independent of the existing Manager-only KPI shown below.</small></div>{[['Q1', 'Manager + TSO/TSI/TSM Dealer joint-working days', 'q1'], ['Q2', 'DEALER + OTHER qualifying check-in rows', 'q2'], ['Q3', 'Unique Channel Partners', 'q3']].map(([tag, label, key]) => <article className={`q3-kpi-card ${key}`} key={key}><span>{tag} · {monthLabel(month)}</span><strong>{totals(result, key).toLocaleString()}</strong><p>{label}</p><small>Month total = sum of four weekly buckets</small></article>)}</section>
      <section className="card q3-bucket-card q1-reference-reconciliation"><div className="q3-section-title"><div><span className="eyebrow">Q1 WEEKLY RECONCILIATION</span><h3>{monthLabel(month)} · expected vs actual</h3></div><small>Actuals are calculated from the loaded Check-In data. Expected values are comparison references only.</small></div><div className="table-scroll"><table className="q3-bucket-table"><thead><tr>{q1ReconciliationRows[0].slice(1).map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{q1ReconciliationRows.slice(1).map((row) => <tr key={row[1]}><th>{row[1]}</th>{row.slice(2).map((value, index) => <td key={`${row[1]}-${index}`}>{value}</td>)}</tr>)}</tbody></table></div><p className="q2-reference-subtotal">The reference month’s total is the sum of the four weekly expected values. Differences are Actual − Expected; calculations remain data-driven.</p></section>
      <section className="card q3-bucket-card"><div className="q3-section-title"><div><span className="eyebrow">WHY THE TWO Q.1 VALUES DIFFER</span><h3>Separate KPI scope reconciliation</h3></div><small>Both counts are calculated from the same loaded file; the rule sets differ.</small></div><div className="table-scroll"><table className="q3-bucket-table"><thead><tr><th>Week</th><th>Existing Manager-only Q.1</th><th>Shared Manager visit-days</th><th>Manager-only visits outside DEALER scope</th><th>Additional TSO/TSI/TSM visit-days</th><th>Separate Q1–Q3 Q1</th></tr></thead><tbody>{q1ScopeRows.map((row) => <tr key={row.bucket}><th>{row.bucket}</th><td>{row.managerOnly}</td><td>{row.shared}</td><td>{row.managerOnlyOnly}</td><td>{row.q1Q3Only}</td><td>{row.q1Q3}</td></tr>)}</tbody></table></div><p className="q2-reference-subtotal">The existing Manager-only KPI counts eligible Manager visit-days across Types. The separate Q1–Q3 report requires Type = DEALER and also includes eligible TSO/TSI/TSM designations. For October’s source file, the net differences come from these disjoint Manager + date sets; neither number is substituted for the other.</p><details><summary>Unmatched Manager + Date keys with source rows · {q1ScopeDifferenceRows.length.toLocaleString()} records</summary><AuditTable title="Source-level KPI scope differences" rows={q1ScopeDifferenceRows} columns={[{ key: 'bucket', label: 'Week' }, { key: 'scope', label: 'Included in' }, { key: 'manager', label: 'Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'date', label: 'Date' }, { key: 'sourceRows', label: 'Source row numbers' }, { key: 'salesDesignations', label: 'Sales User designation(s)' }, { key: 'types', label: 'Type(s)' }, { key: 'reason', label: 'Why only this KPI counts it' }]} /></details></section>
      <section className="card q3-bucket-card"><div className="q3-section-title"><div><span className="eyebrow">Q1 SOURCE PIPELINE</span><h3>Stage-by-stage weekly audit · {monthLabel(month)}</h3></div><small>All stages are derived from source rows; unique visit-days use Emp ID with normalized Sales User name fallback.</small></div><p className="q2-reference-subtotal">Loaded rows: {result.details.rawLoadedRows.toLocaleString()} · Valid Date rows: {result.details.validDateRowsAcrossFile.toLocaleString()} · Invalid / blank dates: {result.details.invalidDateRowsAcrossFile.toLocaleString()} · Rows outside selected month: {result.details.rowsOutsideSelectedMonth.toLocaleString()} · Selected-month rows: {result.details.totalMonthRows.toLocaleString()}</p><div className="table-scroll"><table className="q3-bucket-table"><thead><tr>{['Week', 'Month rows in bucket', 'Manager designation', 'After zonal exclusions', 'Joint Working = YES', 'Named partner', 'Eligible Executive/BDO token', 'Type = DEALER', 'Manager identity available', 'Qualifying source rows', 'Duplicate rows removed', 'Final unique Manager-days'].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{q1DiagnosticRows.map((row) => <tr key={row.bucket}><th>{row.bucket}</th><td>{row.sourceRows}</td><td>{row.managerDesignationRows}</td><td>{row.afterZonalExclusions}</td><td>{row.jointWorkingYesRows}</td><td>{row.namedPartnerRows}</td><td>{row.eligibleExecutiveBdoRows}</td><td>{row.dealerRows}</td><td>{row.managerIdentityRows}</td><td>{row.qualifyingSourceRows}</td><td>{row.duplicateSourceRowsRemoved}</td><td>{row.finalUniqueManagerDays}</td></tr>)}</tbody></table></div><p className="q2-reference-subtotal">The source-row audit below lists inclusion, duplicate, designation, date-bucket, and exclusion reasons row by row.</p></section>
      <section className="card q3-bucket-card"><div className="q3-section-title"><div><span className="eyebrow">BUCKET COMPARISON</span><h3>{monthLabel(month)} KPI results</h3></div><small>First half = Week 1 + Week 2 · Second half = Week 3 + Week 4</small></div><div className="table-scroll"><table className="q3-bucket-table"><thead><tr><th>KPI</th>{buckets.map((bucket) => <th key={bucket.key}>{bucket.label}</th>)}</tr></thead><tbody>{[['Q1 · Manager unique Dealer visit-days', 'q1'], ['Q2 · Dealer + Other check-in rows', 'q2'], ['Q3 · Unique Channel Partners', 'q3']].map(([label, key]) => <tr key={key}><th>{label}</th>{buckets.map((bucket) => <td key={bucket.key}>{result.values[key][bucket.key].toLocaleString()}</td>)}</tr>)}</tbody></table></div></section>
      <section className="q3-chart-grid">{[['Q1', 'Manager-wise unique visit-days', 'q1'], ['Q2', 'DEALER + OTHER rows', 'q2'], ['Q3', 'Unique Channel Partners', 'q3']].map(([label, description, key]) => { const max = Math.max(1, ...buckets.map(({ key: bucket }) => result.values[key][bucket])); return <article className="card q3-chart-card" key={key}><h3>{label} · {description}</h3>{buckets.map((bucket) => <div className="q3-chart-row" key={bucket.key}><span title={bucket.label}>{bucket.label}</span><div><i style={{ width: `${Math.max(result.values[key][bucket.key] ? 3 : 0, result.values[key][bucket.key] / max * 100)}%` }}/></div><b>{result.values[key][bucket.key].toLocaleString()}</b></div>)}</article>; })}</section>
      <section className="card q3-summary-card"><div className="q3-section-title"><div><span className="eyebrow">MANAGER SUMMARIES</span><h3>Employee contribution</h3></div><span>Q3 attribution is descriptive; overall Q3 is deduplicated globally per bucket.</span></div><div className="q3-manager-grid"><AuditTable title="Q1 · Manager-wise visit days by bucket" rows={q1ManagerRows} columns={[{ key: 'bucket', label: 'Bucket' }, { key: 'manager', label: 'Manager / Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'visitDays', label: 'Unique Days' }, { key: 'qualifyingRows', label: 'Source Rows' }, { key: 'dates', label: 'Dates' }]} /><AuditTable title="Q2 · Qualifying rows by manager (month total)" rows={q2ByManager} columns={[{ key: 'manager', label: 'Manager / Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'rows', label: 'Total Rows' }, { key: 'dealer', label: 'DEALER' }, { key: 'other', label: 'OTHER' }]} /><AuditTable title="Q3 · Unique partners attributed to each Senior within each bucket*" rows={q3ByManager} columns={[{ key: 'bucket', label: 'Bucket' }, { key: 'senior', label: 'Senior Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'distributors', label: 'Partners seen' }]} /></div><p className="q3-scope-note">*Q3 dashboard totals use a single global Set per bucket, so the same distributor visited by different Seniors is counted once overall. Senior rows above are illustrative attribution and must not be summed to reproduce Q3.</p></section>
      <section className="q3-export-bar"><b>Download supporting data</b>{[['reconciliation','Q1 expected vs actual CSV'], ['scope','Q1 scope differences CSV'], ['diagnostics','Q1 stage diagnostics CSV'], ['q1exclusions','Q1 exclusion reasons CSV'], ['q1','Q1 source audit CSV'], ['q2','Q2 source audit CSV'], ['q3','Q3 source audit CSV'], ['manager','Manager summary CSV'], ['exclusions','Zonal exclusions CSV'], ['designations','Designation audit CSV'], ['quality','Data quality CSV'], ['dates','Invalid dates CSV']].map(([kind, label]) => <button className="secondary" key={kind} onClick={() => exportCsv(kind)}>{label}</button>)}</section>
      <section className="card q3-audits"><div className="q3-section-title"><div><span className="eyebrow">CALCULATION TRANSPARENCY</span><h3>{monthLabel(month)} source-row audits & exclusions</h3></div><span>All output uses the KPI service result shown above.</span></div>
        <details><summary>Q1 source rows · {q1Rows.length.toLocaleString()} rows · {q1Rows.filter((row) => row.eligible).length.toLocaleString()} qualifying rows</summary><AuditTable title="Q1 eligibility and duplicate audit" rows={q1Rows} columns={[{ key: 'bucket', label: 'Week' }, { key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'groupingKey', label: 'Manager + Date Grouping Key' }, { key: 'employee', label: 'Sales User / Manager' }, { key: 'empId', label: 'Emp ID' }, { key: 'designation', label: 'Sales User Designation' }, { key: 'jointWorkingDesignation', label: 'Joint Working Designation' }, { key: 'matchedExecutiveBdoTokens', label: 'Matched Executive / BDO token(s)' }, { key: 'jointWorking', label: 'Joint Working' }, { key: 'jointWorkingName', label: 'Joint Working Name' }, { key: 'type', label: 'Type' }, { key: 'zonalManager', label: 'Zonal Manager' }, { key: 'eligible', label: 'Q1 Eligible', render: (row) => row.eligible ? 'Yes' : 'No' }, { key: 'uniqueContribution', label: 'Counted as visit-day', render: (row) => row.uniqueContribution ? 'Yes' : 'No' }, { key: 'reason', label: 'Decision / reason' }]} /></details>
        <details><summary>Q1 exclusions grouped by week and exact decision reason · {q1ExclusionRows.length.toLocaleString()} groups</summary><AuditTable title="Q1 exclusion reason totals" rows={q1ExclusionRows} columns={[{ key: 'bucket', label: 'Week' }, { key: 'reason', label: 'Exact exclusion reason(s)' }, { key: 'rows', label: 'Source rows' }]} /></details>
        <details><summary>Q2 source rows · {q2Rows.length.toLocaleString()} rows · {q2Rows.filter((row) => row.eligible).length.toLocaleString()} eligible</summary><AuditTable title="Q2 eligibility audit" rows={q2Rows} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Sales User / Manager' }, { key: 'empId', label: 'Emp ID' }, { key: 'designation', label: 'Sales User Designation' }, { key: 'jointWorkingDesignation', label: 'Joint Working Designation' }, { key: 'matchedExecutiveBdoTokens', label: 'Matched Executive / BDO token(s)' }, { key: 'jointWorking', label: 'Joint Working' }, { key: 'jointWorkingName', label: 'Joint Working Name' }, { key: 'type', label: 'Type' }, { key: 'eligible', label: 'Included', render: (row) => row.eligible ? 'Yes' : 'No' }, { key: 'reason', label: 'Decision / reason' }]} /></details>
        <details><summary>Q3 source rows · {q3Rows.length.toLocaleString()} audited bucket rows · {result.details.q3QualifyingRows.toLocaleString()} qualifying source rows</summary><AuditTable title="Q3 source rows by bucket" rows={q3Rows} columns={[{ key: 'bucket', label: 'Bucket' }, { key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Senior Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'designation', label: 'Designation' }, { key: 'type', label: 'Type' }, { key: 'distributorIdentifier', label: 'Distributor Identifier' }, { key: 'eligible', label: 'Eligible', render: (row) => row.eligible ? 'Yes' : 'No' }, { key: 'uniqueContribution', label: 'Counted', render: (row) => row.uniqueContribution ? 'Yes' : 'No' }, { key: 'reason', label: 'Decision / reason' }]} /></details>
        <details><summary>Zonal Manager exclusions · {result.details.excludedZonalManagerSourceRows.length.toLocaleString()} source rows</summary><AuditTable title="Rows excluded by Zonal Manager" rows={result.details.excludedZonalManagerSourceRows} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'zonalManager', label: 'Zonal Manager' }, { key: 'designation', label: 'Designation' }, { key: 'type', label: 'Type' }, { key: 'reason', label: 'Reason' }]} /></details>
        <details><summary>Designation & data-quality audit · {result.details.designationAudit.length.toLocaleString()} values</summary><AuditTable title="Designation values and approved contexts" rows={result.details.designationAudit} columns={[{ key: 'field', label: 'Source Field' }, { key: 'designation', label: 'Value' }, { key: 'rows', label: 'Rows' }, { key: 'approvalContext', label: 'Approved context' }, { key: 'sampleEmployees', label: 'Sample employees' }, { key: 'sampleSourceRows', label: 'Sample source rows' }]} /></details>
        <details><summary>Row-level data quality flags · {result.details.dataQualityAudit.length.toLocaleString()} records</summary><AuditTable title="Identity, Joint Working and distributor data quality" rows={result.details.dataQualityAudit} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'designation', label: 'Sales User Designation' }, { key: 'jointWorkingDesignation', label: 'Joint Working Designation' }, { key: 'jointWorking', label: 'Joint Working' }, { key: 'jointWorkingName', label: 'Joint Working Name' }, { key: 'type', label: 'Type' }, { key: 'issue', label: 'Data quality finding' }]} /></details>
        <details><summary>Date quality audit · {result.details.invalidDateRows.length.toLocaleString()} rows with blank or invalid Date</summary><AuditTable title="Invalid or blank source Date rows (whole loaded file)" rows={result.details.invalidDateRows} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'rawDate', label: 'Raw Date' }, { key: 'employee', label: 'Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'reason', label: 'Reason' }]} /></details>
        <div className="q3-rules"><h4>Rules applied</h4><p><b>Q1:</b> approved Manager + TSO/TSI/TSM Sales User Designation + Joint Working YES + nonblank Joint Working Name + approved Executive/BDO Joint Working Designation + Type DEALER; Emp ID identifies the Manager, normalized name is the fallback. Count unique Manager + Date per bucket, then sum Manager subtotals.</p><p><b>Q2:</b> same separate Manager + TSO/TSI/TSM group and joint-working conditions as Q1, with Type DEALER or OTHER; every qualifying source check-in row counts.</p><p><b>Q3:</b> approved Q3 Senior Sales User Designation + Type CHANNEL PARTNER. Joint Working status is ignored. Distributor key priority is Dealer Channel Partner Code, Dealer Channel Partner, Company Name; normalized comparison is globally unique within each bucket.</p><p><b>Zonal exclusions:</b> SHOBHIT GOEL, OTHERS, ARCHIT GARG, SHANTANU ATTARY.</p><p><b>Calendar:</b> Week 1 = 1–7; Week 2 = 8–15; First Half = 1–15; Week 3 = 16–23; Week 4 = 24–month end; Second Half = 16–month end. Half totals are the sums of their displayed weekly buckets.</p></div>
      </section>
      <section className="card q3-bucket-card"><div className="q3-section-title"><div><span className="eyebrow">EXISTING KPI · MANAGER-ONLY SCOPE</span><h3>Separate Manager Joint Working Q.1 / Q.2 dashboard</h3></div><small>Its approved Manager-only eligibility rules and outputs are preserved. These values are distinct from the Manager + TSO/TSI/TSM Q1–Q3 report above.</small></div></section>
      <ManagerExecutiveQ1Dashboard report={report} month={month} preparedReport={managerOnlyPrepared} calculatedResult={managerOnlyResult}/>
    </>}
  </main>;
}
