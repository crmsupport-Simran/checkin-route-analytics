import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { calculateQ1Q3Reports, prepareQ1Q3ReportRows } from '../services/q1Q3ReportsService';
import {
  buildWeeklySalesPerformanceExportRows,
  calculateWeeklySalesPerformanceAddon,
  isValidManualActual,
  readManualActuals,
  WEEKLY_SALES_PERFORMANCE_STORAGE_KEY,
} from '../services/weeklySalesPerformanceAddon';
import { csvValue } from '../utils/formatUtils';

const monthLabel = (key) => {
  if (!key) return '';
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
};
const downloadCsv = (rows, name) => {
  const csv = rows.map((row) => row.map(csvValue).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export default function WeeklySalesPerformanceDashboard({ report, secondaryOrders, loading, progress, onSecondaryOrderFile }) {
  const input = useRef(null);
  const prepared = useMemo(() => prepareQ1Q3ReportRows(report?.records || []), [report]);
  const orderMonths = (secondaryOrders?.records || []).map(({ dateKey }) => dateKey?.slice(0, 7)).filter(Boolean);
  const months = [...new Set([...prepared.months, ...orderMonths])].sort();
  const [monthOverride, setMonthOverride] = useState('');
  const [manualActuals, setManualActuals] = useState(() => readManualActuals());
  useEffect(() => setMonthOverride(''), [report, secondaryOrders]);
  useEffect(() => {
    try { localStorage.setItem(WEEKLY_SALES_PERFORMANCE_STORAGE_KEY, JSON.stringify(manualActuals)); } catch { /* Browser storage can be disabled. */ }
  }, [manualActuals]);
  const month = months.includes(monthOverride) ? monthOverride : (months.at(-1) || '');
  const existingResult = useMemo(() => report && month ? calculateQ1Q3Reports(prepared, month) : null, [report, prepared, month]);
  const addon = useMemo(() => month ? calculateWeeklySalesPerformanceAddon(prepared, month, existingResult, secondaryOrders) : null, [prepared, month, existingResult, secondaryOrders]);
  const monthManualActuals = manualActuals[month] || {};
  const exportRows = useMemo(() => buildWeeklySalesPerformanceExportRows(addon, monthManualActuals), [addon, monthManualActuals]);
  const getActual = (row, week) => {
    if (row.key === 'averageOrderValue') return monthManualActuals.averageOrderValue?.[week.key] || 'PENDING';
    if (['ssp', 'jointDays', 'retailersVisited'].includes(row.key) && !report) return 'UPLOAD CHECK-IN REPORT';
    const value = addon.actualByRow[row.key]?.[week.key];
    if (value !== null && value !== undefined) return Number(value).toLocaleString('en-IN');
    if (row.key === 'orders' || row.key === 'orderAmount') return addon.statuses[row.key][week.key];
    return 'SOURCE DATA REQUIRED';
  };
  const updateManual = (weekKey, value) => setManualActuals((current) => ({
    ...current,
    [month]: { ...(current[month] || {}), averageOrderValue: { ...((current[month] || {}).averageOrderValue || {}), [weekKey]: value } },
  }));
  const exportWorkbook = () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(exportRows), 'Weekly Sales');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Source Row', 'Order ID', 'Order Date', 'Sales User', 'Emp ID', 'Basic Amount'],
      ...(secondaryOrders?.records || []).filter((row) => row.dateKey.startsWith(`${month}-`)).map((row) => [row.sourceRow, row.orderId, row.dateLabel, row.salesUserName, row.empId, row.basicAmount ?? 'MISSING BASIC AMOUNT']),
    ]), 'Secondary Order Audit');
    XLSX.writeFile(workbook, `weekly-sales-performance-${month}.xlsx`);
  };

  return <main className="weekly-sales-dashboard">
    <section className="joint-kpi-heading"><div><span className="eyebrow">MANAGEMENT REPORTS</span><h2>WEEKLY SALES PERFORMANCE</h2><p>Plan vs actual · secondary order actuals use Basic Amount only for Q.5.</p></div>
      <div className="joint-kpi-controls"><div><label htmlFor="weekly-sales-month">Month</label><select id="weekly-sales-month" value={month} onChange={(event) => setMonthOverride(event.target.value)} disabled={!months.length}><option value="" disabled>Select month</option>{months.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}</select></div><button className="secondary" disabled={!addon} onClick={() => downloadCsv(exportRows, `weekly-sales-performance-${month}.csv`)}>Export CSV</button><button className="secondary" disabled={!addon} onClick={exportWorkbook}>Export Excel</button></div>
    </section>
    <section className="weekly-order-upload card">
      <div><span className="eyebrow">SECONDARY SALES SOURCE</span><h3>Upload Secondary Order Report</h3><p>Q.4 reads order count. Q.5 sums only <b>Basic order value (Excel column V)</b>; taxes, gross totals, and other amount fields are ignored.</p></div>
      <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => { const file = event.target.files[0]; event.target.value = ''; if (file) onSecondaryOrderFile(file); }}/>
      <button className="secondary" disabled={loading} onClick={() => input.current?.click()}>{loading ? `${progress?.stage || 'Reading report…'} ${progress?.progress ? `${progress.progress}%` : ''}` : secondaryOrders ? 'Replace secondary report' : 'Choose secondary report'}</button>
      {secondaryOrders && <div className="weekly-order-file"><b>{secondaryOrders.fileName || 'Secondary report loaded'}</b><span>{secondaryOrders.stats.rows.toLocaleString()} rows · {secondaryOrders.stats.uniqueOrders.toLocaleString()} identified orders · {secondaryOrders.stats.validBasicAmounts.toLocaleString()} Basic order value amounts</span></div>}
    </section>
    {!month && <section className="card q3-empty"><h3>Select a month</h3><p>Upload a Check-In report or a secondary order report to populate the month selector.</p></section>}
    {addon && <section className="card q3-bucket-card weekly-sales-addon">
      <div className="q3-section-title"><div><span className="eyebrow">PLAN VS ACTUAL</span><h3>{monthLabel(month)} · weekly sales report</h3></div><small>Plans are fixed per week. Actuals come from the loaded report or manual entry as specified.</small></div>
      <p className="q3-scope-note">These calendar buckets are specific to this dashboard: 1–8, 9–16, 17–24, and 25–month end. Existing Q1–Q3 and Manager-only KPI rules are not changed.</p>
      <div className="table-scroll"><table className="q3-bucket-table weekly-sales-table"><thead><tr><th rowSpan="2">KPI</th>{addon.weeks.map((week) => <th key={week.key} colSpan="2">{week.label}</th>)}</tr><tr>{addon.weeks.flatMap((week) => [<th key={`${week.key}-plan`}>PLAN</th>, <th key={`${week.key}-actual`}>ACTUAL</th>])}</tr></thead>
        <tbody>{addon.rows.map((row) => <tr key={row.key}><th><span>{row.label}</span><small>{row.key === 'orderAmount' ? 'Secondary Sales Report · Basic order value (column V) only' : row.actualSource}</small></th>{addon.weeks.flatMap((week) => {
          const isManual = row.key === 'averageOrderValue';
          const actual = getActual(row, week);
          return [<td className="weekly-plan" key={`${week.key}-plan`}>{row.plan.toLocaleString('en-IN')}</td>, <td key={`${week.key}-actual`} className="weekly-actual">{isManual ? <input aria-label={`${row.label} ${week.label} actual`} type="number" min="0" step="any" value={monthManualActuals.averageOrderValue?.[week.key] ?? ''} className={isValidManualActual(monthManualActuals.averageOrderValue?.[week.key] ?? '') ? '' : 'invalid'} onChange={(event) => updateManual(week.key, event.target.value)} placeholder="Pending"/> : typeof actual === 'string' && !/^\d[\d,.]*$/.test(actual) ? <span className="weekly-status">{actual}</span> : actual}</td>];
        })}</tr>)}</tbody></table></div>
      <p className="q3-scope-note">Q1 is unique eligible Senior + date joint-working days; Q2 counts qualifying Dealer/Other check-in rows. Q4 counts distinct order IDs (or source rows if no ID is supplied). Q5 sums Basic order value from column V for the selected month and week. Q6 remains manually entered and saved in this browser. Q7/Q8 require retailer history or onboarding dates not available in the loaded sources.</p>
      <div className="q3-export-bar"><b>Downloads</b><button className="secondary" onClick={() => downloadCsv(exportRows, `weekly-sales-performance-${month}.csv`)}>Weekly Plan vs Actual CSV</button><button className="secondary" onClick={exportWorkbook}>Excel workbook + secondary order audit</button></div>
    </section>}
  </main>;
}
