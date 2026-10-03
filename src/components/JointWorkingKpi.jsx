import React, { useEffect, useMemo, useState } from 'react';
import { calculateJointWorkingKpis, KPI_BUCKETS, prepareJointWorkingRows } from '../services/jointWorkingKpi';
import { csvValue } from '../utils/formatUtils';

const monthLabel = (key) => {
  if (!key) return '';
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
};

export default function JointWorkingKpi({ report }) {
  const prepared = useMemo(() => prepareJointWorkingRows(report?.records || []), [report]);
  const [monthOverride, setMonthOverride] = useState('');
  const months = prepared.months;
  useEffect(() => setMonthOverride(''), [report]);
  const selectedMonth = months.includes(monthOverride) ? monthOverride : (months.at(-1) || '');
  const result = useMemo(() => selectedMonth ? calculateJointWorkingKpis(prepared, selectedMonth) : null, [prepared, selectedMonth]);
  const [showDetails, setShowDetails] = useState(false);

  const exportCsv = () => {
    if (!result) return;
    const rows = [
      ['Month', 'KPI', ...KPI_BUCKETS.map(({ label }) => label)],
      [monthLabel(selectedMonth), 'Q.1 TOTAL NO. OF VISIT DAYS OF JOINT WORKING (BDO WITH SENIOR PERSON)', ...KPI_BUCKETS.map(({ key }) => result.values.q1[key])],
      [monthLabel(selectedMonth), 'Q.2 NO. OF RETAILER VISITED, BDO WITH SENIOR SALES PERSON', ...KPI_BUCKETS.map(({ key }) => result.values.q2[key])],
      [monthLabel(selectedMonth), 'Q.3 NO. OF DISTRIBUTOR VISITED, PHYSICALLY BY SENIOR PERSON (UNIQUE NUMBER)', ...KPI_BUCKETS.map(({ key }) => result.values.q3[key])],
    ];
    const csv = rows.map((row) => row.map(csvValue).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `joint-working-kpi-${selectedMonth}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <main className="joint-kpi">
    <section className="joint-kpi-heading">
      <div><span className="eyebrow">CHECK-IN REPORT · JOINT WORKING</span><h2>JOINT WORKING KPI DASHBOARD</h2><p>Calculated from the currently loaded Check-In report.</p></div>
      <div className="joint-kpi-controls"><div><label htmlFor="joint-kpi-month">Month</label><select id="joint-kpi-month" value={selectedMonth} disabled={!months.length} onChange={(event) => setMonthOverride(event.target.value)}>{months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></div><button className="secondary" disabled={!result} onClick={exportCsv}>Export Joint Working KPI</button></div>
    </section>
    {!report && <section className="card joint-kpi-empty"><h3>Upload a Check-In Report to view this dashboard</h3><p>This report automatically uses the same Check-In data as the main dashboard.</p></section>}
    {report && !months.length && <section className="card joint-kpi-empty"><h3>No valid visit dates found</h3><p>Upload a Check-In file with dates in the Date column.</p></section>}
    {result && <>
      <section className="card joint-kpi-table-wrap"><div className="joint-kpi-title">JOINT WORKING KPI DASHBOARD <span>{monthLabel(selectedMonth)}</span></div><div className="table-scroll joint-kpi-scroll"><table className="joint-kpi-table"><thead><tr><th className="q-cell" aria-label="Question"/><th className="metric-cell">Metric</th>{KPI_BUCKETS.map((bucket) => <th key={bucket.key} className={`${bucket.key === 'firstHalf' || bucket.key === 'secondHalf' ? 'half-cell' : ''}`}>{bucket.label}</th>)}</tr></thead><tbody>
        <tr><th className="q-cell">Q.1</th><th className="metric-cell">TOTAL NO. OF VISIT DAYS OF JOINT WORKING (BDO WITH SENIOR PERSON)</th>{KPI_BUCKETS.map(({ key }) => <td key={key}>{result.values.q1[key].toLocaleString()}</td>)}</tr>
        <tr><th className="q-cell">Q.2</th><th className="metric-cell">NO. OF RETAILER VISITED, BDO WITH SENIOR SALES PERSON</th>{KPI_BUCKETS.map(({ key }) => <td key={key}>{result.values.q2[key].toLocaleString()}</td>)}</tr>
        <tr><th className="q-cell">Q.3</th><th className="metric-cell">NO. OF DISTRIBUTOR VISITED, PHYSICALLY BY SENIOR PERSON (UNIQUE NUMBER)</th>{KPI_BUCKETS.map(({ key }) => <td key={key}>{result.values.q3[key].toLocaleString()}</td>)}</tr>
      </tbody></table></div></section>
      <section className="joint-kpi-detail-toggle"><button className="secondary" aria-expanded={showDetails} onClick={() => setShowDetails((value) => !value)}>{showDetails ? 'Hide Calculation Details' : 'View Calculation Details'}</button></section>
      {showDetails && <section className="card joint-kpi-details"><div className="section-head"><div><span className="eyebrow">CALCULATION TRANSPARENCY</span><h3>{monthLabel(selectedMonth)} details</h3></div></div><div className="joint-detail-grid"><article><h4>Q.1 · Senior visit days</h4><p>Total qualifying rows: <b>{result.details.q1QualifyingRows.toLocaleString()}</b></p><p>Unique Senior + Date combinations: <b>{result.details.q1UniqueSeniorDates.toLocaleString()}</b></p><div className="joint-senior-list">{result.details.q1BySenior.map(({ senior, visitDays }) => <div key={senior}><span>{senior}</span><b>{visitDays}</b></div>)}{!result.details.q1BySenior.length && <small>No qualifying records.</small>}</div></article><article><h4>Q.2 · Retailer visits</h4><p>Total qualifying rows: <b>{result.details.q2QualifyingRows.toLocaleString()}</b></p><p>DEALER rows: <b>{result.details.q2Dealer.toLocaleString()}</b></p><p>OTHER rows: <b>{result.details.q2Other.toLocaleString()}</b></p></article><article><h4>Q.3 · Distributor visits</h4><p>Total qualifying rows: <b>{result.details.q3QualifyingRows.toLocaleString()}</b></p><p>Unique distributor count: <b>{result.details.q3UniqueDistributors.toLocaleString()}</b></p></article></div></section>}
      <p className="joint-kpi-footnote">Q.1 counts each senior + visit date once. Q.2 counts qualifying check-in rows. Q.3 counts each distributor once per date bucket.</p>
    </>}
  </main>;
}
