import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { calculateQ1Q3Reports, prepareQ1Q3ReportRows } from '../services/q1Q3ReportsService';
import {
  buildWeeklySalesPerformanceExportRows,
  calculateWeeklySalesPerformanceAddon,
  isValidManualActual,
  isValidPlanValue,
  readManualActuals,
  readWeeklySalesPlanOverrides,
  WEEKLY_SALES_PERFORMANCE_STORAGE_KEY,
  WEEKLY_SALES_PLAN_STORAGE_KEY,
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
  const [planOverrides, setPlanOverrides] = useState(() => readWeeklySalesPlanOverrides());
  const [editingPlans, setEditingPlans] = useState(false);
  const [planDraft, setPlanDraft] = useState({});
  useEffect(() => setMonthOverride(''), [report, secondaryOrders]);
  useEffect(() => {
    try { localStorage.setItem(WEEKLY_SALES_PERFORMANCE_STORAGE_KEY, JSON.stringify(manualActuals)); } catch { /* Browser storage can be disabled. */ }
  }, [manualActuals]);
  useEffect(() => {
    try { localStorage.setItem(WEEKLY_SALES_PLAN_STORAGE_KEY, JSON.stringify(planOverrides)); } catch { /* Browser storage can be disabled. */ }
  }, [planOverrides]);
  const month = months.includes(monthOverride) ? monthOverride : (months.at(-1) || '');
  const existingResult = useMemo(() => report && month ? calculateQ1Q3Reports(prepared, month) : null, [report, prepared, month]);
  const addon = useMemo(() => month ? calculateWeeklySalesPerformanceAddon(prepared, month, existingResult, secondaryOrders) : null, [prepared, month, existingResult, secondaryOrders]);
  const monthManualActuals = manualActuals[month] || {};
  const monthPlans = planOverrides[month] || {};
  const exportRows = useMemo(() => buildWeeklySalesPerformanceExportRows(addon, monthManualActuals, monthPlans), [addon, monthManualActuals, monthPlans]);
  const beginPlanEdit = () => {
    if (!addon) return;
    setPlanDraft(Object.fromEntries(addon.rows.map((row) => [row.key, Object.fromEntries(addon.weeks.map((week) => [week.key, monthPlans[row.key]?.[week.key] ?? row.plan]))])));
    setEditingPlans(true);
  };
  const savePlanEdit = () => {
    if (!addon || !addon.rows.every((row) => addon.weeks.every((week) => isValidPlanValue(planDraft[row.key]?.[week.key])))) return;
    const saved = Object.fromEntries(addon.rows.map((row) => [row.key, Object.fromEntries(addon.weeks.map((week) => [week.key, Number(planDraft[row.key][week.key])]))]));
    setPlanOverrides((current) => ({ ...current, [month]: saved }));
    setEditingPlans(false);
  };
  const getActual = (row, week) => {
    if (['retainedRetailers', 'newRetailers'].includes(row.key)) return monthManualActuals[row.key]?.[week.key] ?? 'PENDING';
    if (!report && ['ssp', 'jointDays', 'retailersVisited', 'orders', 'orderAmount', 'averageOrderValue'].includes(row.key)) return 'UPLOAD CHECK-IN REPORT';
    const value = addon.actualByRow[row.key]?.[week.key];
    if (value !== null && value !== undefined) return Number(value).toLocaleString('en-IN');
    if (row.key === 'averageOrderValue') return 'PENDING';
    return addon.statuses[row.key]?.[week.key] || 'SOURCE DATA REQUIRED';
  };
  const updateManual = (key, weekKey, value) => setManualActuals((current) => ({
    ...current,
    [month]: { ...(current[month] || {}), [key]: { ...((current[month] || {})[key] || {}), [weekKey]: value } },
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
    <section className="joint-kpi-heading"><div><span className="eyebrow">MANAGEMENT REPORTS</span><h2>WEEKLY SALES PERFORMANCE</h2><p>Plan vs actual · Q.4/Q.5 use Check-In Secondary data and Average Order Value is calculated.</p></div>
      <div className="joint-kpi-controls"><div><label htmlFor="weekly-sales-month">Month</label><select id="weekly-sales-month" value={month} onChange={(event) => setMonthOverride(event.target.value)} disabled={!months.length || editingPlans}><option value="" disabled>Select month</option>{months.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}</select></div><button className="secondary" disabled={!addon || editingPlans} onClick={() => downloadCsv(exportRows, `weekly-sales-performance-${month}.csv`)}>Export CSV</button><button className="secondary" disabled={!addon || editingPlans} onClick={exportWorkbook}>Export Excel</button></div>
    </section>
    <section className="weekly-order-upload card">
      <div><span className="eyebrow">SECONDARY SALES AUDIT</span><h3>Upload Secondary Order Report</h3><p>The weekly Q.4 and Q.5 actuals below come from the Check-In report’s Joint Working and Secondary fields. This upload remains available as a separate order audit.</p></div>
      <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => { const file = event.target.files[0]; event.target.value = ''; if (file) onSecondaryOrderFile(file); }}/>
      <button className="secondary" disabled={loading} onClick={() => input.current?.click()}>{loading ? `${progress?.stage || 'Reading report…'} ${progress?.progress ? `${progress.progress}%` : ''}` : secondaryOrders ? 'Replace secondary report' : 'Choose secondary report'}</button>
      {secondaryOrders && <div className="weekly-order-file"><b>{secondaryOrders.fileName || 'Secondary report loaded'}</b><span>{secondaryOrders.stats.rows.toLocaleString()} rows · {secondaryOrders.stats.uniqueOrders.toLocaleString()} identified orders · {secondaryOrders.stats.validBasicAmounts.toLocaleString()} Basic order value amounts</span></div>}
    </section>
    {!month && <section className="card q3-empty"><h3>Select a month</h3><p>Upload a Check-In report to populate actuals. The secondary order report is an optional audit file.</p></section>}
    {addon && <section className="card q3-bucket-card weekly-sales-addon">
      <div className="q3-section-title"><div><span className="eyebrow">PLAN VS ACTUAL</span><h3>{monthLabel(month)} · weekly sales report</h3></div><div className="weekly-plan-actions">{editingPlans ? <><button className="primary compact" onClick={savePlanEdit} disabled={!addon.rows.every((row) => addon.weeks.every((week) => isValidPlanValue(planDraft[row.key]?.[week.key])))}>Save plans</button><button className="secondary" onClick={() => setEditingPlans(false)}>Cancel</button></> : <button className="secondary weekly-plan-edit" onClick={beginPlanEdit} aria-label="Edit weekly plans" title="Edit weekly plans">✎ Edit Plans</button>}<small>{editingPlans ? 'Edit the plan targets below; values save for this month.' : 'Plans are editable per week. Old/new retailer actuals are manual; all other actuals come from the Check-In report.'}</small></div></div>
      <p className="q3-scope-note">Weekly buckets: 1–7, 8–15, 16–23, and 24–month end. Existing Q1–Q3 and Manager-only KPI rules are not changed.</p>
      <div className="table-scroll"><table className="q3-bucket-table weekly-sales-table"><thead><tr><th rowSpan="2">KPI</th>{addon.weeks.map((week) => <th key={week.key} colSpan="2">{week.label}</th>)}</tr><tr>{addon.weeks.flatMap((week) => [<th key={`${week.key}-plan`}>PLAN</th>, <th key={`${week.key}-actual`}>ACTUAL</th>])}</tr></thead>
        <tbody>{addon.rows.map((row) => <tr key={row.key}><th><span>{row.label}</span><small>{row.actualSource}</small></th>{addon.weeks.flatMap((week) => {
          const isManual = row.key === 'retainedRetailers' || row.key === 'newRetailers';
          const actual = getActual(row, week);
          const planValue = editingPlans ? (planDraft[row.key]?.[week.key] ?? row.plan) : Number(monthPlans[row.key]?.[week.key] ?? row.plan);
          return [<td className="weekly-plan" key={`${week.key}-plan`}>{editingPlans ? <input aria-label={`${row.label} ${week.label} plan`} type="number" min="0" step="any" value={planValue} className={isValidPlanValue(planValue) ? '' : 'invalid'} onChange={(event) => setPlanDraft((current) => ({ ...current, [row.key]: { ...(current[row.key] || {}), [week.key]: event.target.value } }))}/> : Number(planValue).toLocaleString('en-IN')}</td>, <td key={`${week.key}-actual`} className="weekly-actual">{isManual ? <input aria-label={`${row.label} ${week.label} actual`} type="number" min="0" step="any" value={monthManualActuals[row.key]?.[week.key] ?? ''} className={isValidManualActual(monthManualActuals[row.key]?.[week.key] ?? '') ? '' : 'invalid'} onChange={(event) => updateManual(row.key, week.key, event.target.value)} placeholder="Pending"/> : typeof actual === 'string' && !/^\d[\d,.]*$/.test(actual) ? <span className="weekly-status">{actual}</span> : actual}</td>];
        })}</tr>)}</tbody></table></div>
      <p className="q3-scope-note">Q1 is unique eligible Senior + date joint-working days. Q2 is the qualifying Dealer/Other Check-In row count and feeds “No. of Retailers Visited.” Q4 uses Check-In rows with Joint Working = YES and Secondary sales type, summing Secondary Order Count (or counting qualifying rows when that field is blank). Q5 sums Basic Order Value from those Check-In rows. Average Order Value = Q5 ÷ Q4. Old Retailer Retained and New Retailer Added are manually editable and saved in this browser.</p>
      <div className="q3-export-bar"><b>Downloads</b><button className="secondary" disabled={editingPlans} onClick={() => downloadCsv(exportRows, `weekly-sales-performance-${month}.csv`)}>Weekly Plan vs Actual CSV</button><button className="secondary" disabled={editingPlans} onClick={exportWorkbook}>Excel workbook + secondary order audit</button></div>
    </section>}
  </main>;
}
