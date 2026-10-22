import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { getKpiBuckets } from '../services/jointWorkingKpi';
import { calculateQ1Q3Reports, prepareQ1Q3ReportRows } from '../services/q1Q3ReportsService';
import ManagerExecutiveQ1Dashboard from './ManagerExecutiveQ1Dashboard';
import { calculateManagerExecutiveQ1, prepareManagerExecutiveQ1Rows } from '../services/managerExecutiveQ1Service';
import { csvValue } from '../utils/formatUtils';

const monthLabel = (key) => {
  if (!key) return '';
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
};
const totals = (values, key) => values.week1 + values.week2 + values.week3 + values.week4;
const downloadCsv = (rows, fileName) => {
  const text = rows.map((row) => row.map(csvValue).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
const simpleRows = (headers, rows, fields) => [headers, ...rows.map((row) => fields.map((field) => row[field] ?? ''))];
const reportDate = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const monthName = new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(year, month - 1, 1));
  return `${String(day).padStart(2, '0')}-${monthName}-${year}`;
};

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
  const weeks = buckets.filter(({ key }) => key.startsWith('week'));
  const result = useMemo(() => month ? calculateQ1Q3Reports(prepared, month) : null, [prepared, month]);
  const managerOnlyPrepared = useMemo(() => prepareManagerExecutiveQ1Rows(report?.records || []), [report]);
  const managerOnlyResult = useMemo(() => month ? calculateManagerExecutiveQ1(managerOnlyPrepared, month) : null, [managerOnlyPrepared, month]);
  const q1Rows = result?.details.q1SourceRows || [];
  const q1VisitDayRows = result ? weeks.flatMap((bucket) =>
    result.details.q1ManagerSummariesByBucket[bucket.key].flatMap((manager) => manager.dates.split(', ').filter(Boolean).map((date) => ({ date, bucket: bucket.label, employee: manager.manager, empId: manager.empId }))))
    .sort((a, b) => a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee)) : [];
  const q2UniqueRows = result ? weeks.flatMap((bucket) => result.details.q3UniqueByBucket[bucket.key].map((partner) => ({
    week: bucket.label, senior: partner.senior, empId: partner.empId, designation: partner.designation,
    identifier: partner.identifier, type: partner.type, rawRows: partner.rawRows,
  }))) : [];
  const q2RowsByWeek = result ? weeks.map((bucket) => ({
    ...bucket,
    rows: result.details.q3UniqueByBucket[bucket.key].map((partner) => ({
      week: bucket.label, senior: partner.senior, empId: partner.empId, designation: partner.designation,
      identifier: partner.identifier, type: partner.type, rawRows: partner.rawRows,
    })),
  })) : [];
  const q1ActualRows = result ? [['Week', 'Actual unique Manager visit-days'], ...weeks.map((bucket) => [bucket.label, result.values.q1[bucket.key]]), ['TOTAL', weeks.reduce((sum, bucket) => sum + result.values.q1[bucket.key], 0)]] : [];
  const summaryRows = result ? [['Month', 'KPI', ...weeks.map(({ label }) => label), 'TOTAL'],
    [monthLabel(month), 'Q.1 MANAGER JOINT WORKING WITH ELIGIBLE EXECUTIVE / BDO · UNIQUE VISIT DAYS', ...weeks.map(({ key }) => result.values.q1[key]), totals(result.values.q1)],
    [monthLabel(month), 'Q.2 UNIQUE CHANNEL PARTNERS', ...weeks.map(({ key }) => result.values.q3[key]), totals(result.values.q3)]] : [];
  const q2SourceAuditRows = result ? weeks.flatMap((bucket) => result.details.q3SourceRowsByBucket[bucket.key].map((row) => ({ week: bucket.label, ...row }))) : [];
  const q1DiagnosticRows = result ? weeks.map(({ key }) => {
    const d = result.details.q1WeeklyDiagnostics[key];
    return { week: d.bucket, sourceRows: d.rowsInBucket, seniorDesignationRows: d.managerDesignationRows,
      afterZonalExclusions: d.rowsAfterZonalExclusions, jointWorkingYesRows: d.jointWorkingYesRows,
      namedPartnerRows: d.namedPartnerRows, eligibleExecutiveBdoRows: d.eligibleExecutiveBdoRows,
      dealerRows: d.dealerRows, identityRows: d.managerIdentityRows, qualifyingRows: d.qualifyingSourceRows,
      duplicatesRemoved: d.duplicateSourceRowsRemoved, uniqueVisitDays: d.finalUniqueManagerDays };
  }) : [];
  const q1ExclusionRows = result ? weeks.flatMap(({ key }) => Object.entries(result.details.q1WeeklyDiagnostics[key].exclusionReasons)
    .map(([reason, rows]) => ({ week: result.details.q1WeeklyDiagnostics[key].bucket, reason, rows }))) : [];

  const q1VisitExport = simpleRows(['Date-1', 'Week', 'Sales User Name', 'Emp ID'], q1VisitDayRows.map((row) => ({ ...row, date: reportDate(row.date) })), ['date', 'bucket', 'employee', 'empId']);
  const q2UniqueExport = simpleRows(['Weekly Source', 'Senior Sales User', 'Emp ID', 'Designation', 'Distributor Identifier', 'Type', 'Rows Mapped to Set Entry'], q2UniqueRows, ['week', 'senior', 'empId', 'designation', 'identifier', 'type', 'rawRows']);
  const q1AuditExport = simpleRows(['Week', 'Source Row', 'Date', 'Manager + Date Grouping Key', 'Sales User', 'Emp ID', 'Sales User Designation', 'Joint Working Designation', 'Matched Executive / BDO Tokens', 'Joint Working', 'Joint Working Name', 'Type', 'Zonal Manager', 'Decision', 'Eligible', 'Counted Visit Day'], q1Rows, ['bucket', 'sourceRow', 'date', 'groupingKey', 'employee', 'empId', 'designation', 'jointWorkingDesignation', 'matchedExecutiveBdoTokens', 'jointWorking', 'jointWorkingName', 'type', 'zonalManager', 'reason', 'eligible', 'uniqueContribution']);
  const q2AuditExport = simpleRows(['Week', 'Source Row', 'Date', 'Senior Sales User', 'Emp ID', 'Designation', 'Type', 'Distributor Identifier', 'Decision', 'Eligible', 'Counted as Unique'], q2SourceAuditRows, ['week', 'sourceRow', 'date', 'employee', 'empId', 'designation', 'type', 'distributorIdentifier', 'reason', 'eligible', 'uniqueContribution']);
  const diagnosticsExport = simpleRows(['Week', 'Source Rows', 'Approved Senior Designation', 'After Zonal Exclusions', 'Joint Working YES', 'Named Partner', 'Eligible Executive/BDO Token', 'DEALER', 'Identity Available', 'Qualifying Rows', 'Duplicates Removed', 'Unique Manager Visit-Days'], q1DiagnosticRows, ['week', 'sourceRows', 'seniorDesignationRows', 'afterZonalExclusions', 'jointWorkingYesRows', 'namedPartnerRows', 'eligibleExecutiveBdoRows', 'dealerRows', 'identityRows', 'qualifyingRows', 'duplicatesRemoved', 'uniqueVisitDays']);

  const workbookExport = () => {
    if (!result) return;
    const workbook = XLSX.utils.book_new();
    const sheets = [
      ['Summary', summaryRows], ['Q1 Visit Days', q1VisitExport], ['Q2 Unique Partners', q2UniqueExport],
      ['Q1 Source Audit', q1AuditExport], ['Q2 Source Audit', q2AuditExport], ['Q1 Diagnostics', diagnosticsExport],
      ['Q1 Exclusions', simpleRows(['Week', 'Exclusion Reason', 'Rows'], q1ExclusionRows, ['week', 'reason', 'rows'])],
      ['Zonal Exclusions', simpleRows(['Source Row', 'Date', 'Employee', 'Emp ID', 'Sales Designation', 'Joint Working Designation', 'Joint Working', 'Joint Working Name', 'Type', 'Zonal Manager', 'Reason'], result.details.excludedZonalManagerSourceRows, ['sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorkingDesignation', 'jointWorking', 'jointWorkingName', 'type', 'zonalManager', 'reason'])],
      ['Designation Audit', simpleRows(['Field', 'Designation', 'Rows', 'Approved Context', 'Sample Employees', 'Source Rows'], result.details.designationAudit, ['field', 'designation', 'rows', 'approvalContext', 'sampleEmployees', 'sampleSourceRows'])],
      ['Data Quality', simpleRows(['Source Row', 'Date', 'Employee', 'Emp ID', 'Designation', 'Joint Working Designation', 'Joint Working', 'Joint Working Name', 'Type', 'Issue'], result.details.dataQualityAudit, ['sourceRow', 'date', 'employee', 'empId', 'designation', 'jointWorkingDesignation', 'jointWorking', 'jointWorkingName', 'type', 'issue'])],
      ['Invalid Dates', simpleRows(['Source Row', 'Employee', 'Emp ID', 'Raw Date', 'Reason'], result.details.invalidDateRows, ['sourceRow', 'employee', 'empId', 'rawDate', 'reason'])],
    ];
    for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
    XLSX.writeFile(workbook, `q1-q2-reports-${month}.xlsx`);
  };
  const exportCsv = (kind) => {
    if (!result) return;
    const exports = {
      summary: ['q1-q2-summary', summaryRows], q1: ['q1-visit-days', q1VisitExport], q2: ['q2-unique-channel-partners', q2UniqueExport],
      q1audit: ['q1-source-audit', q1AuditExport], q2audit: ['q2-source-audit', q2AuditExport],
      diagnostics: ['q1-weekly-diagnostics', diagnosticsExport],
      exclusions: ['q1-exclusion-reasons', simpleRows(['Week', 'Exclusion Reason', 'Rows'], q1ExclusionRows, ['week', 'reason', 'rows'])],
    };
    const [name, rows] = exports[kind]; downloadCsv(rows, `${name}-${month}.csv`);
  };

  return <main className="q3-dashboard">
    <section className="joint-kpi-heading"><div><span className="eyebrow">CHECK-IN REPORT · MANAGEMENT REPORTS</span><h2>Q1–Q2 REPORTS DASHBOARD</h2><p>Manager joint-working visit-days and unique Channel Partner reach.</p></div><div className="joint-kpi-controls"><div><label htmlFor="q3-month">Month</label><select id="q3-month" value={month} disabled={!prepared.months.length} onChange={(event) => setMonthOverride(event.target.value)}>{prepared.months.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}</select></div><button className="secondary" disabled={!result} onClick={workbookExport}>Export Excel workbook</button><button className="secondary" disabled={!result} onClick={() => exportCsv('summary')}>Export KPI CSV</button></div></section>
    {!report && <section className="card q3-empty"><h3>Upload a Check-In Report to view Q1–Q2</h3><p>The dashboard reads the currently loaded report in this application.</p></section>}
    {report && !result && <section className="card q3-empty"><h3>No valid dates found in the Date column</h3><p>Rows with missing or invalid dates cannot be assigned to a month; they remain available in the date audit.</p></section>}
    {result && <>
      <section className="q3-kpi-cards q3-kpi-cards-two"><div className="q3-section-title q3-full-row"><div><span className="eyebrow">MANAGER + TSO/TSI/TSM REPORT</span><h3>Q1–Q2 KPI summary · {monthLabel(month)}</h3></div><small>Calculated from the selected Check-In report.</small></div>
        <article className="q3-kpi-card q1"><span>Q.1 · {monthLabel(month)}</span><strong>{totals(result.values.q1).toLocaleString()}</strong><p>Manager joint working with eligible Executive / BDO</p><small>Unique Manager + date visit-days · Type DEALER</small></article>
        <article className="q3-kpi-card q2"><span>Q.2 · {monthLabel(month)}</span><strong>{totals(result.values.q3).toLocaleString()}</strong><p>Unique Channel Partners</p><small>Globally unique per week across qualifying Senior users</small></article>
      </section>
      <section className="card q3-bucket-card"><div className="q3-section-title"><div><span className="eyebrow">Q1 ACTUALS</span><h3>{monthLabel(month)} · weekly visit-days</h3></div><small>Actual source data only · Week 1 + Week 2 = First Half; Week 3 + Week 4 = Second Half.</small></div><div className="table-scroll"><table className="q3-bucket-table q1-actual-table"><thead><tr><th>WEEKLY SOURCE</th><th>ACTUAL UNIQUE VISIT DAYS</th></tr></thead><tbody>{weeks.map((bucket) => <tr key={bucket.key}><th>{bucket.label}</th><td>{result.values.q1[bucket.key].toLocaleString()}</td></tr>)}<tr className="q1-total-row"><th>TOTAL</th><td>{totals(result.values.q1).toLocaleString()}</td></tr></tbody></table></div></section>
      <section className="card q3-bucket-card q1-visit-report"><div className="q3-section-title"><div><span className="eyebrow">Q.1 DETAIL REPORT</span><h3>{monthLabel(month)} · Manager visit-days</h3></div><small>One row per unique Sales User + date, matching the shared Excel report format.</small></div><AuditTable title="Date-wise qualifying Manager + date visit-days" rows={q1VisitDayRows} columns={[{ key: 'date', label: 'Date-1', render: (row) => reportDate(row.date) }, { key: 'bucket', label: 'Week' }, { key: 'employee', label: 'Sales User Name' }, { key: 'empId', label: 'Emp ID' }]} pageSize={100}/></section>
      <section className="card q3-bucket-card q2-unique-report"><div className="q3-section-title"><div><span className="eyebrow">Q.2 DETAIL REPORT</span><h3>{monthLabel(month)} · Unique Channel Partners by week</h3></div><small>One row per normalized distributor identifier within each week.</small></div>
        {q2RowsByWeek.map((week) => <div className="q2-week-set" key={week.key}><div className="q2-week-heading"><b>{week.label} · {week.rows.length.toLocaleString()} unique distributor(s)</b><span>({week.rows.length.toLocaleString()} groups)</span></div><AuditTable title={`${week.label} unique distributor set`} rows={week.rows} columns={[{ key: 'sourceWeek', label: 'Weekly Source' }, { key: 'senior', label: 'Senior Sales User' }, { key: 'designation', label: 'Designation' }, { key: 'identifier', label: 'Distributor Identifier' }, { key: 'type', label: 'Type' }, { key: 'rawRows', label: 'Rows Mapped to Set Entry' }]} pageSize={100}/></div>)}
      </section>
      <section className="q3-export-bar"><b>Download supporting data</b>{[['q1','Q1 visit-day report CSV'], ['q2','Q2 unique Channel Partner report CSV'], ['q1audit','Q1 source audit CSV'], ['q2audit','Q2 source audit CSV'], ['diagnostics','Q1 weekly diagnostics CSV'], ['exclusions','Q1 exclusion reasons CSV']].map(([kind, label]) => <button className="secondary" key={kind} onClick={() => exportCsv(kind)}>{label}</button>)}</section>
      <section className="card q3-audits"><div className="q3-section-title"><div><span className="eyebrow">CALCULATION TRANSPARENCY</span><h3>{monthLabel(month)} source-row audits & exclusions</h3></div><span>Audit details use the same results shown above.</span></div>
        <details><summary>Q1 source rows · {q1Rows.length.toLocaleString()} rows · {q1Rows.filter((row) => row.eligible).length.toLocaleString()} qualifying rows</summary><AuditTable title="Q1 eligibility and duplicate audit" rows={q1Rows} columns={[{ key: 'bucket', label: 'Week' }, { key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'groupingKey', label: 'Manager + Date Grouping Key' }, { key: 'employee', label: 'Sales User / Manager' }, { key: 'empId', label: 'Emp ID' }, { key: 'designation', label: 'Sales User Designation' }, { key: 'jointWorkingDesignation', label: 'Joint Working Designation' }, { key: 'matchedExecutiveBdoTokens', label: 'Matched Executive / BDO token(s)' }, { key: 'jointWorking', label: 'Joint Working' }, { key: 'jointWorkingName', label: 'Joint Working Name' }, { key: 'type', label: 'Type' }, { key: 'zonalManager', label: 'Zonal Manager' }, { key: 'eligible', label: 'Q1 Eligible', render: (row) => row.eligible ? 'Yes' : 'No' }, { key: 'uniqueContribution', label: 'Counted as visit-day', render: (row) => row.uniqueContribution ? 'Yes' : 'No' }, { key: 'reason', label: 'Decision / reason' }]} /></details>
        <details><summary>Q2 source rows · {q2SourceAuditRows.length.toLocaleString()} audited rows</summary><AuditTable title="Q2 Channel Partner rows and set membership" rows={q2SourceAuditRows} columns={[{ key: 'week', label: 'Week' }, { key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Senior Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'designation', label: 'Designation' }, { key: 'type', label: 'Type' }, { key: 'distributorIdentifier', label: 'Distributor Identifier' }, { key: 'eligible', label: 'Eligible', render: (row) => row.eligible ? 'Yes' : 'No' }, { key: 'uniqueContribution', label: 'Counted', render: (row) => row.uniqueContribution ? 'Yes' : 'No' }, { key: 'reason', label: 'Decision / reason' }]} /></details>
        <details><summary>Q1 weekly calculation diagnostics · {q1DiagnosticRows.length} weeks</summary><AuditTable title="Q1 stage diagnostics" rows={q1DiagnosticRows} columns={[{ key: 'week', label: 'Week' }, { key: 'sourceRows', label: 'Month rows' }, { key: 'seniorDesignationRows', label: 'Eligible designation' }, { key: 'afterZonalExclusions', label: 'After zonal exclusions' }, { key: 'jointWorkingYesRows', label: 'Joint Working YES' }, { key: 'namedPartnerRows', label: 'Named partner' }, { key: 'eligibleExecutiveBdoRows', label: 'Executive/BDO' }, { key: 'dealerRows', label: 'DEALER' }, { key: 'qualifyingRows', label: 'Qualifying source rows' }, { key: 'duplicatesRemoved', label: 'Duplicates removed' }, { key: 'uniqueVisitDays', label: 'Final visit-days' }]} /></details>
        <details><summary>Zonal Manager exclusions · {result.details.excludedZonalManagerSourceRows.length.toLocaleString()} source rows</summary><AuditTable title="Rows excluded by Zonal Manager" rows={result.details.excludedZonalManagerSourceRows} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'zonalManager', label: 'Zonal Manager' }, { key: 'designation', label: 'Designation' }, { key: 'type', label: 'Type' }, { key: 'reason', label: 'Reason' }]} /></details>
        <details><summary>Designation & data-quality audit · {result.details.designationAudit.length.toLocaleString()} values</summary><AuditTable title="Designation values and approved contexts" rows={result.details.designationAudit} columns={[{ key: 'field', label: 'Source Field' }, { key: 'designation', label: 'Value' }, { key: 'rows', label: 'Rows' }, { key: 'approvalContext', label: 'Approved context' }, { key: 'sampleEmployees', label: 'Sample employees' }, { key: 'sampleSourceRows', label: 'Sample source rows' }]} /></details>
        <details><summary>Row-level data quality flags · {result.details.dataQualityAudit.length.toLocaleString()} records</summary><AuditTable title="Identity, Joint Working and distributor data quality" rows={result.details.dataQualityAudit} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'date', label: 'Date' }, { key: 'employee', label: 'Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'designation', label: 'Designation' }, { key: 'jointWorkingDesignation', label: 'Joint Working Designation' }, { key: 'jointWorking', label: 'Joint Working' }, { key: 'jointWorkingName', label: 'Joint Working Name' }, { key: 'type', label: 'Type' }, { key: 'issue', label: 'Finding' }]} /></details>
        <details><summary>Date quality audit · {result.details.invalidDateRows.length.toLocaleString()} rows with blank or invalid Date</summary><AuditTable title="Invalid or blank source dates" rows={result.details.invalidDateRows} columns={[{ key: 'sourceRow', label: 'Source Row' }, { key: 'rawDate', label: 'Raw Date' }, { key: 'employee', label: 'Sales User' }, { key: 'empId', label: 'Emp ID' }, { key: 'reason', label: 'Reason' }]} /></details>
      </section>
      <section className="card q3-bucket-card"><div className="q3-section-title"><div><span className="eyebrow">EXISTING KPI · MANAGER-ONLY SCOPE</span><h3>Separate Manager Joint Working Q.1 / Q.2 dashboard</h3></div><small>Its approved Manager-only rules and outputs stay independent of the Q1–Q2 reports above.</small></div></section>
      <ManagerExecutiveQ1Dashboard report={report} month={month} preparedReport={managerOnlyPrepared} calculatedResult={managerOnlyResult}/>
    </>}
  </main>;
}
