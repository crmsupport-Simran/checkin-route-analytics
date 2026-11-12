import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { calculateJointWorkingKpis, prepareJointWorkingRows } from '../services/jointWorkingKpi';
import { calculateQ1Q3Reports, prepareQ1Q3ReportRows } from '../services/q1Q3ReportsService';
import {
  buildWeeklySalesPerformanceExportRows,
  getWeeklySalesMonthTotal,
  buildWeeklyJointDaysAudit,
  buildWeeklySalesActualAudit,
  WEEKLY_ACTUAL_AUDIT_COLUMNS,
  calculateWeeklySalesPerformanceAddon,
  getWeeklySalesPlanMonthOptions,
  isValidManualActual,
  isValidPlanValue,
  readManualActuals,
  readWeeklySalesPlanOverrides,
  saveWeeklySalesPlanOverrides,
  WEEKLY_SALES_PERFORMANCE_STORAGE_KEY,
  WEEKLY_SALES_PLAN_STORAGE_KEY,
} from '../services/weeklySalesPerformanceAddon';
import { csvValue } from '../utils/formatUtils';
import { parseSupplemental } from '../services/supplementalLoader';

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

export default function WeeklySalesPerformanceDashboard({ report }) {
  const prepared = useMemo(() => prepareQ1Q3ReportRows(report?.records || []), [report]);
  const managerKpiPrepared = useMemo(() => prepareJointWorkingRows(report?.records || []), [report]);
  const months = prepared.months;
  const monthOptions = useMemo(() => getWeeklySalesPlanMonthOptions(months), [months]);
  const [monthOverride, setMonthOverride] = useState('');
  const [manualActuals, setManualActuals] = useState(() => readManualActuals());
  const [planOverrides, setPlanOverrides] = useState(() => readWeeklySalesPlanOverrides());
  const [editingPlans, setEditingPlans] = useState(false);
  const [planDraft, setPlanDraft] = useState({});
  const [secondaryOrders, setSecondaryOrders] = useState(null);
  const [secondaryOrderFileName, setSecondaryOrderFileName] = useState('');
  const [secondaryOrderLoading, setSecondaryOrderLoading] = useState(false);
  const [secondaryOrderProgress, setSecondaryOrderProgress] = useState('');
  const [secondaryOrderError, setSecondaryOrderError] = useState('');
  const [ncotReport, setNcotReport] = useState(null);
  const [ncotFileName, setNcotFileName] = useState('');
  const [ncotLoading, setNcotLoading] = useState(false);
  const [ncotProgress, setNcotProgress] = useState('');
  const [ncotError, setNcotError] = useState('');
  useEffect(() => setMonthOverride(''), [report]);
  useEffect(() => {
    try { localStorage.setItem(WEEKLY_SALES_PERFORMANCE_STORAGE_KEY, JSON.stringify(manualActuals)); } catch { /* Browser storage can be disabled. */ }
  }, [manualActuals]);
  useEffect(() => {
    try { localStorage.setItem(WEEKLY_SALES_PLAN_STORAGE_KEY, JSON.stringify(planOverrides)); } catch { /* Browser storage can be disabled. */ }
  }, [planOverrides]);
  const month = monthOverride || months.at(-1) || getWeeklySalesPlanMonthOptions([], new Date(), 0)[0];
  const hasMonthData = Boolean(prepared.rowsByMonth?.has(month));
  const existingResult = useMemo(() => report && month ? calculateQ1Q3Reports(prepared, month) : null, [report, prepared, month]);
  const territoryKpiResult = useMemo(() => report && month ? calculateJointWorkingKpis(managerKpiPrepared, month, { includeTerritory: true }) : null, [report, managerKpiPrepared, month]);
  const addon = useMemo(() => month ? calculateWeeklySalesPerformanceAddon(prepared, month, existingResult, secondaryOrders, territoryKpiResult, ncotReport) : null, [prepared, month, existingResult, secondaryOrders, territoryKpiResult, ncotReport]);
  const monthManualActuals = manualActuals[month] || {};
  const monthPlans = planOverrides[month] || {};
  const exportRows = useMemo(() => buildWeeklySalesPerformanceExportRows(addon, monthManualActuals, monthPlans, hasMonthData), [addon, monthManualActuals, monthPlans, hasMonthData]);
  const jointDaysAuditRows = useMemo(() => report && addon ? buildWeeklyJointDaysAudit(prepared, month, addon) : [], [report, addon, prepared, month]);
  const weeklyActualAuditRows = useMemo(() => report && addon ? buildWeeklySalesActualAudit(prepared, month, addon, territoryKpiResult, monthManualActuals) : [], [report, addon, prepared, territoryKpiResult, monthManualActuals, month]);
  const beginPlanEdit = () => {
    if (!addon) return;
    setPlanDraft(Object.fromEntries(addon.rows.map((row) => [row.key, Object.fromEntries(addon.weeks.map((week) => [week.key, monthPlans[row.key]?.[week.key] ?? row.plan]))])));
    setEditingPlans(true);
  };
  const savePlanEdit = () => {
    if (!addon || !addon.rows.every((row) => addon.weeks.every((week) => isValidPlanValue(planDraft[row.key]?.[week.key])))) return;
    const saved = Object.fromEntries(addon.rows.map((row) => [row.key, Object.fromEntries(addon.weeks.map((week) => [week.key, Number(planDraft[row.key][week.key])]))]));
    setPlanOverrides((current) => saveWeeklySalesPlanOverrides(current, month, saved));
    setEditingPlans(false);
  };
  const uploadSecondaryOrderReport = async (file) => {
    if (!file) return;
    setSecondaryOrderLoading(true);
    setSecondaryOrderProgress('Reading secondary order report…');
    setSecondaryOrderError('');
    try {
      const parsed = await parseSupplemental(file, 'secondary-orders', (progress) => setSecondaryOrderProgress(progress.stage || 'Reading secondary order report…'));
      setSecondaryOrders(parsed);
      setSecondaryOrderFileName(file.name);
    } catch (error) {
      setSecondaryOrders(null);
      setSecondaryOrderFileName('');
      setSecondaryOrderError(error.message || 'Could not read this secondary order report.');
    } finally {
      setSecondaryOrderLoading(false);
      setSecondaryOrderProgress('');
    }
  };
  const uploadNcotReport = async (file) => {
    if (!file) return;
    setNcotLoading(true); setNcotProgress('Reading NCOT report…'); setNcotError('');
    try {
      const parsed = await parseSupplemental(file, 'ncot', (progress) => setNcotProgress(progress.stage || 'Reading NCOT report…'));
      setNcotReport(parsed); setNcotFileName(file.name);
    } catch (error) {
      setNcotReport(null); setNcotFileName(''); setNcotError(error.message || 'Could not read this NCOT report.');
    } finally { setNcotLoading(false); setNcotProgress(''); }
  };
  const getActual = (row, week) => {
    if (row.key === 'retainedRetailers' || (row.key === 'newRetailers' && !addon.ncotActualsLoaded)) return monthManualActuals[row.key]?.[week.key] ?? 'PENDING';
    if (!report && ['ssp', 'jointDays', 'retailersVisited', 'orders', 'orderAmount', 'averageOrderValue'].includes(row.key)) return 'UPLOAD CHECK-IN REPORT';
    if (row.key === 'newRetailers' && addon.ncotActualsLoaded && !hasMonthData) return 'UPLOAD CHECK-IN REPORT';
    if (!hasMonthData) return 'PENDING';
    const value = addon.actualByRow[row.key]?.[week.key];
    if (value !== null && value !== undefined) return Number(value).toLocaleString('en-IN');
    return addon.statuses[row.key]?.[week.key] || 'SOURCE DATA REQUIRED';
  };
  const getMonthTotal = (row) => {
    if (!report && !['retainedRetailers', 'newRetailers'].includes(row.key)) return 'UPLOAD CHECK-IN REPORT';
    return getWeeklySalesMonthTotal(addon, row, monthManualActuals, hasMonthData);
  };
  const formatMonthTotal = (row) => {
    const total = getMonthTotal(row);
    return typeof total === 'number' ? total.toLocaleString('en-IN') : total;
  };
  const updateManual = (key, weekKey, value) => setManualActuals((current) => ({
    ...current,
    [month]: { ...(current[month] || {}), [key]: { ...((current[month] || {})[key] || {}), [weekKey]: value } },
  }));
  const exportWorkbook = () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(exportRows), 'Weekly Sales');
    XLSX.writeFile(workbook, `weekly-sales-performance-${month}.xlsx`);
  };
  const jointAuditColumns = [
    ['Week', 'week'], ['Week Actual', 'weekActual'], ['Unique Employee-Date Pair Contribution', 'uniqueEmployeeDatePairContribution'],
    ['Source Rows for Pair', 'sourceRowsForPair'], ['Pair Key', 'pairKey'], ['Date', 'date'], ['Date Key', 'dateKey'],
    ['BDO / Employee Name', 'employee'], ['Employee ID', 'employeeId'], ['Employee Designation', 'employeeDesignation'],
    ['Joint Working', 'jointWorking'], ['Joint Working Name', 'jointWorkingName'], ['Joint Working Designation', 'jointWorkingDesignation'],
    ['Type', 'type'], ['Designation Sales Type', 'designationSalesType'], ['Check-In Source Row', 'sourceRow'],
  ];
  const exportJointAuditCsv = () => downloadCsv([
    jointAuditColumns.map(([label]) => label),
    ...jointDaysAuditRows.map((row) => jointAuditColumns.map(([, key]) => row[key])),
  ], `weekly-joint-working-source-audit-${month}.csv`);
  const exportJointAuditWorkbook = () => {
    const workbook = XLSX.utils.book_new();
    const summaryRows = [
      ['WEEKLY JOINT WORKING ACTUAL SOURCE AUDIT'],
      ['Month', monthLabel(month)],
      ['Calculation', 'Distinct Manager + Territory employee identity/date pairs with at least one qualifying Manager + Territory Q.2 Check-In.'],
      ['Reconciliation', 'Filter Raw Source Rows by Week and sum Unique Employee-Date Pair Contribution; the total equals Week Actual. Repeated qualifying Check-Ins for a pair contribute 0 after the first.'],
      [],
      ['Week', 'Actual Unique Employee-Date Pairs', 'Raw Qualifying Check-In Rows'],
      ...addon.weeks.map((week) => [week.label, addon.actualByRow.jointDays[week.key] ?? 0, jointDaysAuditRows.filter((row) => row.weekKey === week.key).length]),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), 'Weekly Summary');
    const rawSheet = XLSX.utils.aoa_to_sheet([
      jointAuditColumns.map(([label]) => label),
      ...jointDaysAuditRows.map((row) => jointAuditColumns.map(([, key]) => row[key])),
    ]);
    rawSheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(jointAuditColumns.length - 1)}${Math.max(1, jointDaysAuditRows.length + 1)}` };
    rawSheet['!cols'] = [12, 13, 21, 15, 30, 14, 14, 28, 15, 28, 14, 26, 34, 20, 24, 18].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, rawSheet, 'Raw Source Rows');
    XLSX.writeFile(workbook, `weekly-joint-working-source-audit-${month}.xlsx`);
  };
  const exportWeeklyActualsCsv = () => downloadCsv([
    WEEKLY_ACTUAL_AUDIT_COLUMNS,
    ...addon.rows.flatMap((row) => addon.weeks.map((week) => {
      const manual = row.key === 'retainedRetailers' || (row.key === 'newRetailers' && !addon.ncotActualsLoaded);
      const value = manual ? monthManualActuals[row.key]?.[week.key] : addon.actualByRow[row.key]?.[week.key];
      const summary = { 'Record Type': 'WEEKLY SUMMARY', KPI: row.label, Week: week.label,
        'Reported Weekly Actual': manual ? (value === '' || value === undefined || value === null ? 'PENDING' : isValidManualActual(value) ? Number(value) : 'INVALID VALUE') : value ?? 'PENDING',
        'Source Rule': manual ? 'Manual actual or PENDING; see manual detail rows.' : 'Dashboard weekly actual; see source detail rows and contribution columns.' };
      return WEEKLY_ACTUAL_AUDIT_COLUMNS.map((column) => summary[column] ?? '');
    })),
    ...addon.rows.map((row) => WEEKLY_ACTUAL_AUDIT_COLUMNS.map((column) => ({
      'Record Type': 'MONTH SUMMARY', KPI: row.label, Week: 'MONTH TOTAL',
      'Reported Weekly Actual': getMonthTotal(row),
      'Source Rule': row.key === 'averageOrderValue' ? 'Monthly weighted average = sum of weekly Total Order Amount actuals ÷ sum of weekly order counts.' : 'Monthly total of the four weekly actuals; incomplete or pending weeks remain pending.',
    })[column] ?? '')),
    ...weeklyActualAuditRows.map((row) => WEEKLY_ACTUAL_AUDIT_COLUMNS.map((column) => row[column])),
  ], `weekly-sales-actuals-source-detail-${month}.csv`);
  const exportWeeklyActualsWorkbook = () => {
    const workbook = XLSX.utils.book_new();
    const summary = [
      ['WEEKLY SALES PERFORMANCE · ACTUALS DETAIL'],
      ['Month', monthLabel(month)],
      ['Source', 'Currently loaded Check-In report, uploaded Secondary Order Report and NCOT Report (when provided), plus browser-saved manual actuals for Old Retailer Retained and fallback New Retailer Added. No plan values are included.'],
      [],
      ['KPI', ...addon.weeks.map((week) => week.label), 'MONTH TOTAL'],
      ...addon.rows.map((row) => [row.label, ...addon.weeks.map((week) => {
        if (row.key === 'retainedRetailers' || (row.key === 'newRetailers' && !addon.ncotActualsLoaded)) {
          const value = monthManualActuals[row.key]?.[week.key];
          return value === '' || value === undefined || value === null ? 'PENDING' : isValidManualActual(value) ? Number(value) : 'INVALID VALUE';
        }
        return addon.actualByRow[row.key]?.[week.key] ?? addon.statuses[row.key]?.[week.key] ?? 'PENDING';
      }), getMonthTotal(row)]),
      [],
      ['Detail contribution guide', 'Sum the relevant contribution column by KPI and week to reconcile the reported actual. SSP and joint-working days use distinct-contribution columns; retailer visit rows contribute 1 each; order count rows contribute one per unique matched Order ID; order amount rows contribute Basic Order Value from the Secondary Order Report; AOV uses the same matched orders.'],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Actual Summary');
    const addDetailSheet = (name, kpi) => {
      const detail = weeklyActualAuditRows.filter((row) => row.KPI === kpi);
      const sheet = XLSX.utils.aoa_to_sheet([
        WEEKLY_ACTUAL_AUDIT_COLUMNS,
        ...detail.map((row) => WEEKLY_ACTUAL_AUDIT_COLUMNS.map((column) => row[column])),
      ]);
      if (detail.length) sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(WEEKLY_ACTUAL_AUDIT_COLUMNS.length - 1)}${detail.length + 1}` };
      sheet['!cols'] = [18, 40, 20, 20, 12, 14, 26, 16, 32, 16, 28, 34, 20, 20, 24, 20, 18, 14, 18, 18, 22, 20, 15, 15, 20, 16, 18, 76].map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };
    addDetailSheet('SSP Source', 'TOTAL NO. OF SSP (SENIOR SALES PERSON)');
    addDetailSheet('Joint Days Source', 'TOTAL DAYS OF JOINT WORKING');
    addDetailSheet('Retailers Visited', 'NO. OF RETAILERS VISITED');
    addDetailSheet('Orders Source', 'NO. OF ORDERS RECEIVED FROM THE RETAILER VISITED');
    addDetailSheet('Order Amount', 'TOTAL ORDER AMOUNT');
    addDetailSheet('Average Order Value', 'AVERAGE ORDER VALUE');
    addDetailSheet('Old Retailer Manual', 'OLD RETAILER RETAINED');
    addDetailSheet(addon.ncotActualsLoaded ? 'New Retailer NCOT' : 'New Retailer Manual', 'NEW RETAILER ADDED');
    XLSX.writeFile(workbook, `weekly-sales-actuals-source-detail-${month}.xlsx`);
  };
  const getKpiActual = (row, week) => {
    if (row.key === 'retainedRetailers' || (row.key === 'newRetailers' && !addon.ncotActualsLoaded)) {
      const value = monthManualActuals[row.key]?.[week.key];
      return value === '' || value === undefined || value === null ? 'PENDING' : isValidManualActual(value) ? Number(value) : 'INVALID VALUE';
    }
    return addon.actualByRow[row.key]?.[week.key] ?? addon.statuses[row.key]?.[week.key] ?? 'PENDING';
  };
  const safeKpiFileName = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const exportKpiActualCsv = (kpi) => {
    const detail = weeklyActualAuditRows.filter((row) => row.KPI === kpi.label);
    const summaryRows = [
      ['WEEKLY KPI ACTUAL REPORT'], ['Month', monthLabel(month)], ['KPI', kpi.label],
      ['Source', kpi.key === 'retainedRetailers' || (kpi.key === 'newRetailers' && !addon.ncotActualsLoaded) ? 'Manually entered actuals saved in this browser.' : kpi.key === 'newRetailers' ? 'Currently loaded NCOT Report; standard matches and any labeled management-confirmed exceptions.' : ['orders', 'orderAmount', 'averageOrderValue'].includes(kpi.key) ? 'Currently loaded Check-In report and uploaded Secondary Order Report.' : 'Currently loaded Check-In report.'],
      [], ['Week', 'Reported Actual'],
      ...addon.weeks.map((week) => [week.label, getKpiActual(kpi, week)]),
      ['MONTH TOTAL', getMonthTotal(kpi)],
      [], WEEKLY_ACTUAL_AUDIT_COLUMNS,
      ...detail.map((row) => WEEKLY_ACTUAL_AUDIT_COLUMNS.map((column) => row[column])),
    ];
    downloadCsv(summaryRows, `weekly-actual-${safeKpiFileName(kpi.label)}-${month}.csv`);
  };
  const exportKpiActualWorkbook = (kpi) => {
    const detail = weeklyActualAuditRows.filter((row) => row.KPI === kpi.label);
    const workbook = XLSX.utils.book_new();
    const summary = [
      ['WEEKLY KPI ACTUAL REPORT'], ['Month', monthLabel(month)], ['KPI', kpi.label],
      ['Source', kpi.key === 'retainedRetailers' || (kpi.key === 'newRetailers' && !addon.ncotActualsLoaded) ? 'Manually entered actuals saved in this browser.' : kpi.key === 'newRetailers' ? 'Currently loaded NCOT Report; standard matches and any labeled management-confirmed exceptions.' : ['orders', 'orderAmount', 'averageOrderValue'].includes(kpi.key) ? 'Currently loaded Check-In report and uploaded Secondary Order Report.' : 'Currently loaded Check-In report.'],
      [], ['Week', 'Reported Actual'],
      ...addon.weeks.map((week) => [week.label, getKpiActual(kpi, week)]),
      ['MONTH TOTAL', getMonthTotal(kpi)],
      [], ['Source Rule', detail[0]?.['Source Rule'] || 'Manual actual; no Check-In source rows.'],
      ['Reconciliation', 'Filter the Source Detail sheet by week and sum the applicable contribution column(s) to reconcile the reported weekly actual.'],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Weekly Actual');
    const rawSheet = XLSX.utils.aoa_to_sheet([
      WEEKLY_ACTUAL_AUDIT_COLUMNS,
      ...detail.map((row) => WEEKLY_ACTUAL_AUDIT_COLUMNS.map((column) => row[column])),
    ]);
    if (detail.length) rawSheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(WEEKLY_ACTUAL_AUDIT_COLUMNS.length - 1)}${detail.length + 1}` };
    rawSheet['!cols'] = [18, 40, 20, 20, 12, 14, 26, 16, 32, 16, 28, 34, 20, 20, 24, 20, 18, 14, 18, 18, 22, 20, 76].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, rawSheet, 'Source Detail');
    XLSX.writeFile(workbook, `weekly-actual-${safeKpiFileName(kpi.label)}-${month}.xlsx`);
  };

  return <main className="weekly-sales-dashboard">
    <section className="joint-kpi-heading"><div><span className="eyebrow">MANAGEMENT REPORTS</span><h2>WEEKLY SALES PERFORMANCE</h2><p>Plan vs actual · Q.4/Q.5 use the uploaded Secondary Order Report matched to same-day Check-Ins; Average Order Value is calculated.</p></div>
      <div className="joint-kpi-controls"><div><label htmlFor="weekly-sales-month">Month</label><select id="weekly-sales-month" value={month} onChange={(event) => setMonthOverride(event.target.value)} disabled={editingPlans}>{monthOptions.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}</select></div><button className="secondary" disabled={!addon || editingPlans} onClick={() => downloadCsv(exportRows, `weekly-sales-performance-${month}.csv`)}>Export CSV</button><button className="secondary" disabled={!addon || editingPlans} onClick={exportWorkbook}>Export Excel</button></div>
    </section>
    {!month && <section className="card q3-empty"><h3>Select a month</h3><p>Upload a Check-In report to populate actuals.</p></section>}
    {addon && <section className="card q3-bucket-card weekly-sales-addon">
      <div className="q3-section-title"><div><span className="eyebrow">PLAN VS ACTUAL</span><h3>{monthLabel(month)} · weekly sales report</h3></div><div className="weekly-plan-actions">{editingPlans ? <><button className="primary compact" onClick={savePlanEdit} disabled={!addon.rows.every((row) => addon.weeks.every((week) => isValidPlanValue(planDraft[row.key]?.[week.key])))}>Save plans</button><button className="secondary" onClick={() => setEditingPlans(false)}>Cancel</button></> : <button className="secondary weekly-plan-edit" onClick={beginPlanEdit} aria-label="Edit weekly plans" title="Edit weekly plans">✎ Edit Plans</button>}<small>{editingPlans ? `Editing ${monthLabel(month)}; saving changes only this month’s plan.` : `Plans are saved separately for each month in this browser. ${hasMonthData ? 'Actuals use this month’s Check-In data.' : 'No Check-In rows for this month yet; actuals remain pending.'} Q.4 and Q.5 use the uploaded Secondary Order Report. Old Retailer Retained remains manual; New Retailer Added uses NCOT when uploaded.`}</small></div></div>
      <p className="q3-scope-note">Weekly buckets: 1–7, 8–15, 16–23, and 24–month end. Existing Q1–Q3 and Manager-only KPI rules are not changed.</p>
      <div className="weekly-source-upload-grid">
      <section className="card weekly-order-upload" aria-label="Secondary Order Report upload">
        <div><span className="eyebrow">SECONDARY ORDER SOURCE</span><h3>Upload Secondary Order Report</h3><p>Q.4 and Q.5 use same-day Visit Orders with status Approved or Pending, matched to the Check-In employee and date. Counts use unique Order IDs; sales use Basic Order Value.</p></div>
        <label className={`weekly-order-upload-button${secondaryOrderLoading ? ' is-loading' : ''}`}>{secondaryOrderLoading ? (secondaryOrderProgress || 'Reading…') : secondaryOrders ? 'Replace secondary report' : 'Choose secondary report'}<input aria-label="Upload Secondary Order Report" type="file" accept=".xlsx,.xls,.csv" disabled={secondaryOrderLoading} onChange={(event) => { uploadSecondaryOrderReport(event.target.files?.[0]); event.target.value = ''; }}/></label>
        {secondaryOrderFileName && <div className="weekly-order-file"><b>{secondaryOrderFileName}</b><span>{secondaryOrders?.stats?.rows?.toLocaleString()} rows · {addon.weeks.reduce((sum, week) => sum + (addon.matchedSecondaryOrdersByWeek[week.key]?.length || 0), 0).toLocaleString()} qualifying matched Visit Orders for {monthLabel(month)}</span></div>}
        {secondaryOrderError && <p className="weekly-order-error" role="alert">{secondaryOrderError}</p>}
      </section>
      <section className="card weekly-order-upload" aria-label="NCOT Report upload">
        <div><span className="eyebrow">NEW RETAILER SOURCE</span><h3>Upload NCOT Report</h3><p>Normally, a unique dealer counts when its Employee Code or Assign User matches a same-day Check-In with Joint Working = YES and its creation time is later. For November 2026, the confirmed Dealer IDs RET-100739 and 76762 count by NCOT Month and First Order Date; their audit rows identify this exception. {ncotReport && ncotReport.stats.validCreationTimestamps === 0 ? 'This upload has dates only, so other rows cannot confirm after-Check-In order.' : 'Creation time is required for other rows.'} Clear the report to return to manual entries.</p></div>
        <label className={`weekly-order-upload-button${ncotLoading ? ' is-loading' : ''}`}>{ncotLoading ? (ncotProgress || 'Reading…') : ncotReport ? 'Replace NCOT report' : 'Choose NCOT report'}<input aria-label="Upload NCOT Report" type="file" accept=".xlsx,.xls,.csv" disabled={ncotLoading} onChange={(event) => { uploadNcotReport(event.target.files?.[0]); event.target.value = ''; }}/></label>
        {ncotFileName && <div className="weekly-order-file"><b>{ncotFileName}</b><span>{ncotReport?.stats?.rows?.toLocaleString()} rows · {ncotReport?.stats?.validCreationTimestamps?.toLocaleString()} with creation time · {Object.values(addon.actualByRow.newRetailers).reduce((sum, value) => sum + (Number(value) || 0), 0).toLocaleString()} qualifying dealers this month</span><button className="secondary" type="button" onClick={() => { setNcotReport(null); setNcotFileName(''); setNcotError(''); }}>Clear NCOT report</button></div>}
        {ncotError && <p className="weekly-order-error" role="alert">{ncotError}</p>}
      </section>
      </div>
      <div className="table-scroll"><table className="q3-bucket-table weekly-sales-table"><thead><tr><th rowSpan="2">KPI</th>{addon.weeks.map((week) => <th key={week.key} colSpan="2">{week.label}</th>)}<th rowSpan="2" className="weekly-month-total">MONTH TOTAL</th></tr><tr>{addon.weeks.flatMap((week) => [<th key={`${week.key}-plan`}>PLAN</th>, <th key={`${week.key}-actual`}>ACTUAL</th>])}</tr></thead>
        <tbody>{addon.rows.map((row) => <tr key={row.key}><th><span>{row.label}</span><small>{row.actualSource}</small></th>{addon.weeks.flatMap((week) => {
          const isManual = row.key === 'retainedRetailers' || (row.key === 'newRetailers' && !addon.ncotActualsLoaded);
          const actual = getActual(row, week);
          const planValue = editingPlans ? (planDraft[row.key]?.[week.key] ?? row.plan) : Number(monthPlans[row.key]?.[week.key] ?? row.plan);
          return [<td className="weekly-plan" key={`${week.key}-plan`}>{editingPlans ? <input aria-label={`${row.label} ${week.label} plan`} type="number" min="0" step="any" value={planValue} className={isValidPlanValue(planValue) ? '' : 'invalid'} onChange={(event) => setPlanDraft((current) => ({ ...current, [row.key]: { ...(current[row.key] || {}), [week.key]: event.target.value } }))}/> : Number(planValue).toLocaleString('en-IN')}</td>, <td key={`${week.key}-actual`} className="weekly-actual">{isManual ? <input aria-label={`${row.label} ${week.label} actual`} type="number" min="0" step="any" value={monthManualActuals[row.key]?.[week.key] ?? ''} className={isValidManualActual(monthManualActuals[row.key]?.[week.key] ?? '') ? '' : 'invalid'} onChange={(event) => updateManual(row.key, week.key, event.target.value)} placeholder="Pending"/> : typeof actual === 'string' && !/^\d[\d,.]*$/.test(actual) ? <span className="weekly-status">{actual}</span> : actual}</td>];
        })}<td className="weekly-month-total">{typeof getMonthTotal(row) === 'number' ? formatMonthTotal(row) : <span className="weekly-status">{formatMonthTotal(row)}</span>}</td></tr>)}</tbody></table></div>
      <p className="q3-scope-note">SSP counts unique Manager + Territory employees with Joint Working = YES, by week; the Q1–Q3 Zonal Manager exclusions do not apply to this row. Total Days of Joint Working counts each eligible Manager + Territory employee/date once when that person has at least one Check-In qualifying under Manager + Territory Q.2. Q.4 counts unique matching Secondary Order Report Order IDs for Visit Orders with Approved or Pending status, matched to a same-day Check-In by employee ID (name fallback) + date; that Check-In must have Joint Working = YES and Secondary sales type. Q.5 sums Basic Order Value from those same matched orders. Average Order Value = Q.5 ÷ Q.4; currency actuals and average order value are rounded up to whole rupees. Old Retailer Retained remains manually editable. New Retailer Added uses the uploaded NCOT Report when present; without it, the saved manual actual is used.</p>
      <p className="q3-scope-note">The Joint Working Source Audit lists the Q.2 Check-In rows behind this count. Sum “Unique Employee-Date Pair Contribution” to reconcile each weekly actual; repeated qualifying Check-Ins for the same employee and date contribute 0 after the first. A Manager + Territory employee/date is included only if it has at least one qualifying Q.2 retailer Check-In.</p>
      <div className="q3-export-bar"><b>All Weekly Actuals · source rows and contribution columns</b><button className="secondary" disabled={!addon || editingPlans} onClick={exportWeeklyActualsCsv}>Actuals Detail CSV</button><button className="secondary" disabled={!addon || editingPlans} onClick={exportWeeklyActualsWorkbook}>Actuals Detail Excel</button></div>
      <section className="weekly-kpi-actual-downloads" aria-label="Individual weekly KPI actual reports">
        <h4>Individual Question Actual Reports</h4>
        <p>Download a separate report for each question. Each includes all four weekly actuals; calculated KPIs include the Check-In rows and contribution fields behind the totals.</p>
        <div className="weekly-kpi-actual-download-list">{addon.rows.map((row) => <div className="weekly-kpi-actual-download" key={row.key}>
          <span>{row.label}</span>
          <button className="secondary" disabled={!addon || editingPlans} onClick={() => exportKpiActualCsv(row)}>CSV</button>
          <button className="secondary" disabled={!addon || editingPlans} onClick={() => exportKpiActualWorkbook(row)}>Excel</button>
        </div>)}</div>
      </section>
      <div className="q3-export-bar"><b>Joint Working Actual Source</b><button className="secondary" disabled={!hasMonthData || editingPlans} onClick={exportJointAuditCsv}>Joint Working Audit CSV</button><button className="secondary" disabled={!hasMonthData || editingPlans} onClick={exportJointAuditWorkbook}>Joint Working Audit Excel</button></div>
      <div className="q3-export-bar"><b>Downloads</b><button className="secondary" disabled={editingPlans} onClick={() => downloadCsv(exportRows, `weekly-sales-performance-${month}.csv`)}>Weekly Plan vs Actual CSV</button><button className="secondary" disabled={editingPlans} onClick={exportWorkbook}>Weekly Plan vs Actual Excel</button></div>
    </section>}
  </main>;
}
