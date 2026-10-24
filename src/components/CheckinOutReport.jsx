import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { csvValue, money, num } from '../utils/formatUtils';
import {
  attachSecondaryOrders, buildCheckinOutReportRows, CHECKIN_OUT_COLUMNS, filterCheckinOutRows,
  formatWorkingTime, getCheckinOutExportRows, getCheckinOutSourceCoverage, summarizeCheckinOutRows,
} from '../services/checkinOutReport';
import { parseSupplemental } from '../services/supplementalLoader';

const PAGE_SIZE = 50;
const monthLabel = (month) => month === 'all' ? 'All months' : new Date(`${month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' });
const downloadCsv = (rows, fileName) => {
  const content = `\uFEFF${rows.map((row) => row.map(csvValue).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
};
const displayNumber = (value) => value == null ? 'SOURCE DATA REQUIRED' : num(value, 0);
const displayMinutes = (value) => value == null ? 'SOURCE DATA REQUIRED' : formatWorkingTime(value);

export default function CheckinOutReport({ report }) {
  const sourceRows = report?.records || [];
  const coverage = useMemo(() => getCheckinOutSourceCoverage(report?.headers || []), [report?.headers]);
  const rows = useMemo(() => buildCheckinOutReportRows(sourceRows, report?.headers || []), [sourceRows, report?.headers]);
  const months = useMemo(() => [...new Set(rows.map((row) => row.dateKey?.slice(0, 7)).filter(Boolean))].sort().reverse(), [rows]);
  const [month, setMonth] = useState(() => months[0] || 'all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bdo, setBdo] = useState('');
  const [state, setState] = useState('');
  const [status, setStatus] = useState('');
  const [exception, setException] = useState('');
  const [sort, setSort] = useState({ key: 'dateKey', direction: 'asc' });
  const [page, setPage] = useState(0);
  const [secondaryOrders, setSecondaryOrders] = useState(null);
  const [secondaryFileName, setSecondaryFileName] = useState('');
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [secondaryError, setSecondaryError] = useState('');
  const [secondaryProgress, setSecondaryProgress] = useState('');

  useEffect(() => { if (month !== 'all' && !months.includes(month)) setMonth(months[0] || 'all'); }, [month, months]);
  const orderJoin = useMemo(() => attachSecondaryOrders(rows, secondaryOrders), [rows, secondaryOrders]);
  const reportRows = orderJoin.rows;
  const filteredRows = useMemo(() => filterCheckinOutRows(reportRows, { month, startDate, endDate, bdo, state, status, exception }), [reportRows, month, startDate, endDate, bdo, state, status, exception]);
  const sortedRows = useMemo(() => [...filteredRows].sort((left, right) => {
    const a = left[sort.key], b = right[sort.key];
    const cmp = a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : (a instanceof Date && b instanceof Date ? a - b : typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
    return sort.direction === 'asc' ? cmp : -cmp;
  }), [filteredRows, sort]);
  const summary = useMemo(() => summarizeCheckinOutRows(filteredRows, coverage, Boolean(secondaryOrders)), [filteredRows, coverage, secondaryOrders]);
  const bdos = useMemo(() => [...new Set(rows.map((row) => row.bdoName).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);
  const states = useMemo(() => [...new Set(rows.map((row) => row.stateName).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const visibleRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [month, startDate, endDate, bdo, state, status, exception]);
  const exportRows = getCheckinOutExportRows(filteredRows);
  const exportCsv = () => downloadCsv(exportRows, `checkin-out-report-${month}.csv`);
  const exportExcel = () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(exportRows), 'Check-In-Out Report');
    XLSX.writeFile(book, `checkin-out-report-${month}.xlsx`);
  };
  const toggleSort = (key) => setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  const clearFilters = () => { setMonth('all'); setStartDate(''); setEndDate(''); setBdo(''); setState(''); setStatus(''); setException(''); };
  const uploadSecondaryOrders = async (file) => {
    if (!file) return;
    setSecondaryLoading(true); setSecondaryError(''); setSecondaryProgress('Reading secondary orders…');
    try {
      const parsed = await parseSupplemental(file, 'secondary-orders', ({ stage }) => setSecondaryProgress(stage));
      setSecondaryOrders(parsed); setSecondaryFileName(file.name); setSecondaryProgress('');
    } catch (error) { setSecondaryOrders(null); setSecondaryFileName(''); setSecondaryError(error.message || 'Could not read this secondary order report.'); setSecondaryProgress(''); }
    finally { setSecondaryLoading(false); }
  };

  if (!report) return <section className="card checkinout-empty"><span className="eyebrow">CHECK-IN REPORT · ATTENDANCE</span><h2>CHECKIN-OUT REPORT</h2><p>Upload the existing Check-In / Check-Out workbook in Dashboard to build this report. No second upload is required.</p></section>;

  const metricCards = [
    ['Unique BDOs', num(summary.uniqueBdos, 0), 'Unique employee identities in filtered employee-day rows.'],
    ['Employee-day records', num(summary.employeeDayRecords, 0), 'Grouped by employee ID and date; rows without either key remain separate.'],
    ['Valid check-ins', num(summary.validCheckIns, 0), 'Valid non-midnight check-in timestamps.'],
    ['Valid check-outs', num(summary.validCheckOuts, 0), 'Valid non-midnight check-out timestamps.'],
    ['Total working time', displayMinutes(summary.totalWorkingMinutes), 'Sum of valid daily first-check-in to last-check-out spans.'],
    ['Average working time', displayMinutes(summary.averageWorkingMinutes), `Total valid span ÷ ${num(summary.validWorkingRecords, 0)} valid employee-day records.`],
    ['Total counters planned', displayNumber(summary.totalCountersPlanned), 'Requires a source Counter Planned field on every filtered row.'],
    ['Total counters visited', displayNumber(summary.totalCountersVisited), 'Distinct Type ID under DEALER + OTHER/OTHERS.'],
    ['Counter achievement', summary.counterAchievement == null ? (summary.totalCountersPlanned === 0 ? 'N/A' : 'SOURCE DATA REQUIRED') : `${summary.counterAchievement.toFixed(1)}%`, 'Total counters visited ÷ total counters planned.'],
    ['Total CP visits', displayNumber(summary.totalCpVisits), 'Distinct Type ID under CHANNEL PARTNER + DIRECT DEALER.'],
    ['Total order count', summary.ordersPending ? 'PENDING SOURCE DATA' : num(summary.totalOrderCount, 0), 'Unique order IDs matched to employee and order date in the uploaded Secondary Orders file.'],
    ['Total sales', summary.salesPending ? 'PENDING SOURCE DATA' : money(summary.totalSales), 'Sum of Basic Order Value only, for matched unique orders.'],
    ['Records with missing/invalid attendance timestamps', num(summary.missingAttendance, 0), 'Midnight 00:00:00 values need source convention validation.'],
  ];

  const visibleExportRows = visibleRows.map((row) => getCheckinOutExportRows([row])[1]);
  const sortKeys = ['dateKey', 'month', 'bdoName', 'stateName', 'checkIn', 'checkOut', 'durationMinutes', 'counterPlanned', 'counterVisited', 'cpVisit', 'orderCount', 'sale', 'remarks'];
  return <section className="checkinout-report">
    <div className="joint-kpi-heading checkinout-heading">
      <div><span className="eyebrow">CHECK-IN REPORT · ATTENDANCE SUMMARY</span><h2>CHECKIN-OUT REPORT</h2><p>{monthLabel(month)} · based on the currently loaded Check-In workbook.</p></div>
      <div className="checkinout-exports"><button className="secondary" onClick={exportExcel} disabled={!filteredRows.length}>Export Excel</button><button className="secondary" onClick={exportCsv} disabled={!filteredRows.length}>Export CSV</button></div>
    </div>
    <div className="card checkinout-order-upload">
      <div><span className="eyebrow">SECONDARY ORDER SOURCE</span><b>Upload Secondary Orders</b><small>Upload the secondary order Excel or CSV here. Order date uses Date Created; sales uses Basic order value (Excel column V) only.</small></div>
      <label className={`checkinout-upload-button${secondaryLoading ? ' is-loading' : ''}`}>
        {secondaryLoading ? (secondaryProgress || 'Reading…') : secondaryFileName ? 'Replace report' : 'Choose secondary report'}
        <input aria-label="Upload Secondary Orders report" type="file" accept=".xlsx,.xls,.csv" disabled={secondaryLoading} onChange={(event) => { uploadSecondaryOrders(event.target.files?.[0]); event.target.value = ''; }} />
      </label>
      {secondaryFileName && <span className="checkinout-upload-meta"><b>{secondaryFileName}</b><span>{secondaryOrders?.records?.length?.toLocaleString()} source rows · {orderJoin.stats?.matchedOrders?.toLocaleString()} matched unique orders</span></span>}
      {secondaryError && <span className="checkinout-warning" role="alert">{secondaryError}</span>}
      {orderJoin.stats && <span className="checkinout-upload-note">Unmatched: {orderJoin.stats.unmatchedOrders.toLocaleString()} · skipped without order ID: {orderJoin.stats.skippedNoOrderId.toLocaleString()} · skipped without date: {orderJoin.stats.skippedNoDate.toLocaleString()} · skipped without employee: {orderJoin.stats.skippedNoEmployee.toLocaleString()}{orderJoin.stats.missingAmounts ? ` · missing Basic Order Value: ${orderJoin.stats.missingAmounts}` : ''}</span>}
    </div>
    <div className="card checkinout-source-note">
      <b>Source and pending values</b>
      <span>Check-in rows are grouped by employee ID + date. Counter Visited counts unique Type ID values in DEALER and OTHER/OTHERS; CP Visit counts unique Type ID values in CHANNEL PARTNER and DIRECT DEALER. Secondary orders are deduplicated by Order ID, matched by employee ID (name fallback only if ID is missing) + Date Created. SALE sums Basic order value only.</span>
      {!coverage.counterPlanned && <span className="checkinout-warning">COUNTER PLANNED unavailable: the loaded workbook has no Counter Planned source field.</span>}
      {(!coverage.type || !coverage.typeId) && <span className="checkinout-warning">Visit-category counts unavailable: required source field(s) missing: {[!coverage.type && 'Type', !coverage.typeId && 'Type ID'].filter(Boolean).join(', ')}.</span>}
      {!coverage.state && <span className="checkinout-warning">STATE NAME unavailable: the loaded workbook has no State Name or State column.</span>}
      {!coverage.checkOut && <span className="checkinout-warning">CHECK OUT TIME unavailable: the loaded workbook has no Check Out or Check Out Time column.</span>}
      {!coverage.remark && <span className="checkinout-warning">REMARKS unavailable: the loaded workbook has no Remark or Remarks column.</span>}
    </div>
    <div className="checkinout-kpis">{metricCards.map(([label, value, note]) => <article className="card checkinout-kpi" key={label}><span>{label}</span><strong className={String(value).includes('PENDING') || String(value).includes('REQUIRED') ? 'checkinout-pending' : ''}>{value}</strong><small>{note}</small></article>)}</div>
    <div className="card checkinout-filters">
      <div><label htmlFor="checkinout-month">Month</label><select id="checkinout-month" value={month} onChange={(event) => setMonth(event.target.value)}><option value="all">All months</option>{months.map((key) => <option value={key} key={key}>{monthLabel(key)}</option>)}</select></div>
      <div><label htmlFor="checkinout-start">Start date</label><input id="checkinout-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
      <div><label htmlFor="checkinout-end">End date</label><input id="checkinout-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
      <div><label htmlFor="checkinout-bdo">BDO Name</label><select id="checkinout-bdo" value={bdo} onChange={(event) => setBdo(event.target.value)}><option value="">All BDOs</option>{bdos.map((name) => <option key={name}>{name}</option>)}</select></div>
      <div><label htmlFor="checkinout-state">State Name</label><select id="checkinout-state" value={state} onChange={(event) => setState(event.target.value)}><option value="">All states</option>{states.map((name) => <option key={name}>{name}</option>)}</select></div>
      <div><label htmlFor="checkinout-status">Attendance status</label><select id="checkinout-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option>Valid</option><option>Missing / invalid timestamp</option><option>Timestamp review required</option><option>Invalid duration</option><option>Unusual duration</option></select></div>
      <div><label htmlFor="checkinout-exception">Remarks / exceptions</label><input id="checkinout-exception" type="search" placeholder="Search remarks or status" value={exception} onChange={(event) => setException(event.target.value)} /></div>
      <button className="secondary checkinout-clear" onClick={clearFilters}>Clear filters</button>
    </div>
    <section className="card checkinout-table-card">
      <div className="section-head"><div><span className="eyebrow">DETAIL REPORT</span><h3>{filteredRows.length.toLocaleString()} employee-day records</h3><p>00:00:00 timestamps are flagged for validation, not accepted as valid attendance.</p></div><span>Page {page + 1} / {pageCount}</span></div>
      <div className="checkinout-table-scroll"><table className="checkinout-table"><thead><tr>{CHECKIN_OUT_COLUMNS.map((label, index) => <th key={label} aria-sort={sort.key === sortKeys[index] ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button onClick={() => toggleSort(sortKeys[index])}>{label}{sort.key === sortKeys[index] ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>)}</tr></thead><tbody>{visibleRows.map((row, rowIndex) => <tr key={row.key} className={`checkinout-row-${row.status.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`} title={`Attendance status: ${row.status}`}>{CHECKIN_OUT_COLUMNS.map((label, index) => <td key={label} className={index >= 10 && index <= 11 && (index === 10 ? row.orderCount == null : row.sale == null) ? 'checkinout-pending-cell' : ''}>{index === 11 && row.sale != null ? num(row.sale, 2) : visibleExportRows[rowIndex][index]}</td>)}</tr>)}</tbody></table></div>
      {!filteredRows.length && <p className="empty checkinout-no-rows">No records match the active filters.</p>}
      <div className="q3-pagination"><span>{filteredRows.length ? `${(page * PAGE_SIZE + 1).toLocaleString()}–${Math.min((page + 1) * PAGE_SIZE, filteredRows.length).toLocaleString()} of ${filteredRows.length.toLocaleString()}` : '0 records'}</span><button className="secondary" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><button className="secondary" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</button></div>
    </section>
    <p className="checkinout-footnote">Total working time is calculated per employee-day as earliest valid Check In to latest valid Check Out; it is not a sum of visit durations. Durations over 18 hours or negative spans are flagged for review. Uploaded order data is matched by employee and date and is held in this browser tab only.</p>
  </section>;
}
