import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { csvValue, money, num } from '../utils/formatUtils';
import {
  attachSecondaryOrders, buildCheckinOutReportRows, CHECKIN_OUT_COLUMNS, filterCheckinOutRows,
  formatWorkingTime, getCheckinOutCellAlerts, getCheckinOutExportRows, getCheckinOutSourceCoverage, summarizeCheckinOutRows,
} from '../services/checkinOutReport';
import { parseSupplemental } from '../services/supplementalLoader';

const PAGE_SIZE = 50;
const monthLabel = (month) => month === 'all' ? 'All months' : new Date(`${month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' });
const downloadCsv = (rows, fileName) => {
  const content = `\uFEFF${rows.map((row) => row.map(csvValue).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
};
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const displayNumber = (value) => value == null ? 'SOURCE DATA REQUIRED' : num(value, 0);
const displayMinutes = (value) => value == null ? 'SOURCE DATA REQUIRED' : formatWorkingTime(value);

export default function CheckinOutReport({ report }) {
  const sourceRows = report?.records || [];
  const coverage = useMemo(() => getCheckinOutSourceCoverage(report?.headers || []), [report?.headers]);
  const rows = useMemo(() => buildCheckinOutReportRows(sourceRows, report?.headers || []), [sourceRows, report?.headers]);
  const missingStateCount = useMemo(() => rows.filter((row) => !row.stateName).length, [rows]);
  const months = useMemo(() => [...new Set(rows.map((row) => row.dateKey?.slice(0, 7)).filter(Boolean))].sort().reverse(), [rows]);
  const [month, setMonth] = useState(() => months[0] || 'all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bdo, setBdo] = useState('');
  const [state, setState] = useState('');
  const [reportingManager, setReportingManager] = useState('');
  const [zonalManager, setZonalManager] = useState('');
  const [status, setStatus] = useState('');
  const [exception, setException] = useState('');
  const [sort, setSort] = useState({ key: 'dateKey', direction: 'asc' });
  const [page, setPage] = useState(0);
  const [screenshotViewOpen, setScreenshotViewOpen] = useState(false);
  const [secondaryOrders, setSecondaryOrders] = useState(null);
  const [secondaryFileName, setSecondaryFileName] = useState('');
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [secondaryError, setSecondaryError] = useState('');
  const [secondaryProgress, setSecondaryProgress] = useState('');

  useEffect(() => { if (month !== 'all' && !months.includes(month)) setMonth(months[0] || 'all'); }, [month, months]);
  const orderJoin = useMemo(() => attachSecondaryOrders(rows, secondaryOrders), [rows, secondaryOrders]);
  const reportRows = orderJoin.rows;
  const filteredRows = useMemo(() => filterCheckinOutRows(reportRows, { month, startDate, endDate, bdo, state, reportingManager, zonalManager, status, exception }), [reportRows, month, startDate, endDate, bdo, state, reportingManager, zonalManager, status, exception]);
  const sortedRows = useMemo(() => [...filteredRows].sort((left, right) => {
    const a = left[sort.key], b = right[sort.key];
    const cmp = a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : (a instanceof Date && b instanceof Date ? a - b : typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
    return sort.direction === 'asc' ? cmp : -cmp;
  }), [filteredRows, sort]);
  const summary = useMemo(() => summarizeCheckinOutRows(filteredRows, coverage, Boolean(secondaryOrders)), [filteredRows, coverage, secondaryOrders]);
  const bdos = useMemo(() => [...new Set(rows.map((row) => row.bdoName).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);
  const states = useMemo(() => [...new Set(rows.map((row) => row.stateName).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);
  const reportingManagers = useMemo(() => [...new Set(rows.map((row) => row.reportingManager).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);
  const zonalManagers = useMemo(() => [...new Set(rows.map((row) => row.zonalManager).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const visibleRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [month, startDate, endDate, bdo, state, reportingManager, zonalManager, status, exception]);
  useEffect(() => {
    if (!screenshotViewOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => { if (event.key === 'Escape') setScreenshotViewOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape); };
  }, [screenshotViewOpen]);
  const exportRows = getCheckinOutExportRows(filteredRows);
  const exportCsv = () => downloadCsv(exportRows, `checkin-out-report-${month}.csv`);
  const filterSummary = [
    month !== 'all' ? monthLabel(month) : '', startDate ? `From ${startDate}` : '', endDate ? `To ${endDate}` : '',
    bdo ? `BDO: ${bdo}` : '', state ? `State: ${state}` : '', zonalManager ? `Zonal Manager: ${zonalManager}` : '',
    reportingManager ? `Reporting Manager: ${reportingManager}` : '', status ? `Status: ${status}` : '', exception ? `Search: ${exception}` : '',
  ].filter(Boolean).join(' · ') || 'All available records';
  const printFilteredReport = () => {
    const [headers, ...data] = exportRows;
    const popup = window.open('', '_blank');
    if (!popup) return;
    const headerCells = headers.map((value, index) => `<th class="${index < 4 ? 'identity' : 'metric'}">${escapeHtml(value)}</th>`).join('');
    const bodyRows = data.map((row, rowIndex) => { const alerts = getCheckinOutCellAlerts(filteredRows[rowIndex]); return `<tr>${row.map((value, index) => { const alert = (index === 4 && alerts.has('checkIn')) || (index === 5 && alerts.has('checkOut')) || (index === 6 && alerts.has('duration')) || (index === 8 && alerts.has('counterVisited')); return `<td class="${alert ? 'alert' : ''}">${escapeHtml(value)}</td>`; }).join('')}</tr>`; }).join('');
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Check-In Check-Out filtered report</title><style>@page{size:landscape;margin:10mm}*{box-sizing:border-box}body{font:9px Arial,sans-serif;color:#111;margin:0}.title{background:#9fc5e8;border:1px solid #222;text-align:center;font-size:16px;font-weight:bold;padding:9px}.meta{padding:6px 2px 9px;font-size:9px}table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #333;padding:5px 4px;text-align:left;vertical-align:top}th{font-size:8px;text-transform:uppercase}.identity{background:#fff200}.metric{background:#8fce4e}td{font-weight:600}td:nth-child(n+9):nth-child(-n+12){text-align:center}.alert{color:#d71920;font-weight:850}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><div class="title">CHECK-IN &amp; CHECK-OUT REPORT · ${escapeHtml(monthLabel(month))}</div><div class="meta">${escapeHtml(filterSummary)} · ${filteredRows.length.toLocaleString()} filtered employee-day records</div><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`);
    popup.document.close();
  };
  const downloadPageImage = () => {
    const headers = CHECKIN_OUT_COLUMNS;
    const values = visibleRows.map((row) => ({ cells: getCheckinOutExportRows([row])[1], alerts: getCheckinOutCellAlerts(row) }));
    const widths = [92, 58, 175, 145, 112, 120, 132, 112, 112, 82, 115, 115, 260];
    const scale = 1.5; const rowHeight = 30; const headHeight = 32; const titleHeight = 42; const metaHeight = 28;
    const width = widths.reduce((sum, value) => sum + value, 0); const height = titleHeight + metaHeight + headHeight + values.length * rowHeight;
    const canvas = document.createElement('canvas'); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#9fc5e8'; ctx.fillRect(0, 0, width, titleHeight); ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.strokeRect(.5, .5, width - 1, titleHeight - 1);
    ctx.fillStyle = '#111'; ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`CHECK-IN & CHECK-OUT REPORT · ${monthLabel(month)}`, width / 2, titleHeight / 2);
    ctx.font = '10px Arial'; ctx.textAlign = 'left'; ctx.fillText(`${filterSummary} · ${filteredRows.length.toLocaleString()} filtered records · page ${page + 1}`, 4, titleHeight + metaHeight / 2);
    let y = titleHeight + metaHeight;
    const drawRow = (cells, isHeader = false, alerts = new Set()) => {
      let x = 0;
      cells.forEach((value, index) => {
        const cellWidth = widths[index]; ctx.fillStyle = isHeader ? (index < 4 ? '#fff200' : '#8fce4e') : '#fff'; ctx.fillRect(x, y, cellWidth, isHeader ? headHeight : rowHeight);
        ctx.strokeStyle = '#333'; ctx.lineWidth = .7; ctx.strokeRect(x, y, cellWidth, isHeader ? headHeight : rowHeight);
        ctx.save(); ctx.beginPath(); ctx.rect(x + 4, y + 1, cellWidth - 8, (isHeader ? headHeight : rowHeight) - 2); ctx.clip(); const alert = (index === 4 && alerts.has('checkIn')) || (index === 5 && alerts.has('checkOut')) || (index === 6 && alerts.has('duration')) || (index === 8 && alerts.has('counterVisited')); ctx.fillStyle = alert ? '#d71920' : '#111'; ctx.font = `${isHeader ? 'bold ' : alert ? 'bold ' : '600 '}${isHeader ? 9 : 10}px Arial`; ctx.textAlign = index >= 8 && index <= 11 ? 'center' : 'left';
        const textX = index >= 8 && index <= 11 ? x + cellWidth / 2 : x + 4; ctx.fillText(String(value ?? ''), textX, y + (isHeader ? headHeight : rowHeight) / 2); ctx.restore(); x += cellWidth;
      });
      y += isHeader ? headHeight : rowHeight;
    };
    drawRow(headers, true); values.forEach(({ cells, alerts }) => drawRow(cells, false, alerts));
    canvas.toBlob((blob) => { if (!blob) return; const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `checkin-out-report-${month}-page-${page + 1}.png`; anchor.click(); URL.revokeObjectURL(url); }, 'image/png');
  };
  const exportExcel = () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(exportRows), 'Check-In-Out Report');
    XLSX.writeFile(book, `checkin-out-report-${month}.xlsx`);
  };
  const toggleSort = (key) => setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  const clearFilters = () => { setMonth('all'); setStartDate(''); setEndDate(''); setBdo(''); setState(''); setReportingManager(''); setZonalManager(''); setStatus(''); setException(''); };
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
    ['Total counters planned', displayNumber(summary.totalCountersPlanned), 'Fixed plan: 10 counters per employee-day.'],
    ['Total counters visited', displayNumber(summary.totalCountersVisited), 'Count of Check-In rows with Type DEALER or OTHER/OTHERS.'],
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
      <div className="checkinout-exports"><button className="secondary" onClick={exportExcel} disabled={!filteredRows.length}>Export Excel</button><button className="secondary" onClick={exportCsv} disabled={!filteredRows.length}>Export CSV</button><button className="secondary" onClick={printFilteredReport} disabled={!filteredRows.length}>Print Filtered Report</button><button className="secondary" onClick={downloadPageImage} disabled={!visibleRows.length}>Download Page Image</button><button className="secondary checkinout-screenshot-button" onClick={() => setScreenshotViewOpen(true)} disabled={!filteredRows.length}>Screenshot View</button></div>
    </div>
    <div className="card checkinout-filters">
      <div><label htmlFor="checkinout-month">Month</label><select id="checkinout-month" value={month} onChange={(event) => setMonth(event.target.value)}><option value="all">All months</option>{months.map((key) => <option value={key} key={key}>{monthLabel(key)}</option>)}</select></div>
      <div><label htmlFor="checkinout-start">Start date</label><input id="checkinout-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
      <div><label htmlFor="checkinout-end">End date</label><input id="checkinout-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
      <div><label htmlFor="checkinout-bdo">BDO Name</label><select id="checkinout-bdo" value={bdo} onChange={(event) => setBdo(event.target.value)}><option value="">All BDOs</option>{bdos.map((name) => <option key={name}>{name}</option>)}</select></div>
      <div><label htmlFor="checkinout-state">State Name</label><select id="checkinout-state" value={state} onChange={(event) => setState(event.target.value)}><option value="">All states</option>{states.map((name) => <option key={name}>{name}</option>)}</select></div>
      <div><label htmlFor="checkinout-zonal-manager">Zonal Manager</label><select id="checkinout-zonal-manager" value={zonalManager} onChange={(event) => setZonalManager(event.target.value)}><option value="">All zonal managers</option>{zonalManagers.map((name) => <option key={name}>{name}</option>)}</select></div>
      <div><label htmlFor="checkinout-reporting-manager">Reporting Manager</label><select id="checkinout-reporting-manager" value={reportingManager} onChange={(event) => setReportingManager(event.target.value)}><option value="">All reporting managers</option>{reportingManagers.map((name) => <option key={name}>{name}</option>)}</select></div>
      <div><label htmlFor="checkinout-status">Attendance status</label><select id="checkinout-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option>Valid</option><option>Missing / invalid timestamp</option><option>Timestamp review required</option><option>Invalid duration</option><option>Unusual duration</option></select></div>
      <div><label htmlFor="checkinout-exception">Remarks / exceptions</label><input id="checkinout-exception" type="search" placeholder="Search remarks or status" value={exception} onChange={(event) => setException(event.target.value)} /></div>
      <button className="secondary checkinout-clear" onClick={clearFilters}>Clear filters</button>
    </div>
    <section className="card checkinout-table-card">
      <div className="section-head"><div><span className="eyebrow">DETAIL REPORT</span><h3>{filteredRows.length.toLocaleString()} employee-day records</h3><p>00:00:00 timestamps are flagged for validation, not accepted as valid attendance.</p></div><span>Page {page + 1} / {pageCount}</span></div>
      <p className="checkinout-export-hint">Excel and Print include all filtered rows. Page Image downloads the {visibleRows.length} rows currently shown on this page.</p>
      <div className="checkinout-excel-title">CHECK-IN &amp; CHECK-OUT REPORT · {monthLabel(month)}</div>
      <div className="checkinout-table-scroll"><table className="checkinout-table"><thead><tr>{CHECKIN_OUT_COLUMNS.map((label, index) => <th key={label} className={index < 4 ? 'checkinout-header-basic' : 'checkinout-header-data'} aria-sort={sort.key === sortKeys[index] ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button onClick={() => toggleSort(sortKeys[index])}>{label}{sort.key === sortKeys[index] ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>)}</tr></thead><tbody>{visibleRows.map((row, rowIndex) => { const alerts = getCheckinOutCellAlerts(row); return <tr key={row.key} className={`checkinout-row-${row.status.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`} title={`Attendance status: ${row.status}`}>
        {CHECKIN_OUT_COLUMNS.map((label, index) => { const alert = (index === 4 && alerts.has('checkIn')) || (index === 5 && alerts.has('checkOut')) || (index === 6 && alerts.has('duration')) || (index === 8 && alerts.has('counterVisited')); const pending = index >= 10 && index <= 11 && (index === 10 ? row.orderCount == null : row.sale == null); const classes = [alert ? 'checkinout-cell-alert' : '', pending ? 'checkinout-pending-cell' : ''].filter(Boolean).join(' '); return <td key={label} className={classes}>{index === 11 && row.sale != null ? num(row.sale, 2) : visibleExportRows[rowIndex][index]}</td>; })}
      </tr>; })}</tbody></table></div>
      {!filteredRows.length && <p className="empty checkinout-no-rows">No records match the active filters.</p>}
      <div className="q3-pagination"><span>{filteredRows.length ? `${(page * PAGE_SIZE + 1).toLocaleString()}–${Math.min((page + 1) * PAGE_SIZE, filteredRows.length).toLocaleString()} of ${filteredRows.length.toLocaleString()}` : '0 records'}</span><button className="secondary" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><button className="secondary" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</button></div>
    </section>
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
      <span>Check-in rows are grouped by employee ID + date. Counter Visited counts Check-In rows whose Type is DEALER or OTHER/OTHERS. CP Visit counts unique Type ID values in CHANNEL PARTNER and DIRECT DEALER. Secondary orders are deduplicated by Order ID, matched by employee ID (name fallback only if ID is missing) + Date Created. SALE sums Basic order value only.</span>
      {!coverage.type && <span className="checkinout-warning">COUNTER VISITED unavailable: the loaded workbook has no Check-In Type column.</span>}
      {(!coverage.type || !coverage.typeId) && <span className="checkinout-warning">CP VISIT unavailable: required source field(s) missing: {[!coverage.type && 'Type', !coverage.typeId && 'Type ID'].filter(Boolean).join(', ')}.</span>}
      {missingStateCount > 0 && <span className="checkinout-warning">STATE NAME unavailable for {missingStateCount.toLocaleString()} employee-day record(s): add a State/State Name value or include an Indian State/UT name in Check-In Location or Check-Out Location.</span>}
      {!coverage.checkOut && <span className="checkinout-warning">CHECK OUT TIME unavailable: the loaded workbook has no Check Out or Check Out Time column.</span>}
      {!coverage.remark && <span className="checkinout-warning">REMARKS unavailable: the loaded workbook has no Remark or Remarks column.</span>}
    </div>
    <div className="checkinout-kpis">{metricCards.map(([label, value, note]) => <article className="card checkinout-kpi" key={label}><span>{label}</span><strong className={String(value).includes('PENDING') || String(value).includes('REQUIRED') ? 'checkinout-pending' : ''}>{value}</strong><small>{note}</small></article>)}</div>
    {screenshotViewOpen && <div className="checkinout-screen-view" role="dialog" aria-modal="true" aria-label="Full-page filtered Check-In and Check-Out report">
      <div className="checkinout-screen-toolbar"><div><span className="eyebrow">SCREENSHOT VIEW · FILTERED REPORT</span><h2>CHECK-IN &amp; CHECK-OUT REPORT · {monthLabel(month)}</h2><p>{filterSummary} · {filteredRows.length.toLocaleString()} filtered employee-day records</p></div><div><button className="secondary" onClick={printFilteredReport}>Print / Save PDF</button><button className="secondary" onClick={() => setScreenshotViewOpen(false)}>Close</button></div></div>
      <div className="checkinout-screen-table-wrap"><table className="checkinout-table checkinout-screen-table"><colgroup>{[6, 4, 13, 10, 7, 7, 9, 6, 7, 5, 6, 7, 13].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup><thead><tr>{CHECKIN_OUT_COLUMNS.map((label, index) => <th key={label} className={index < 4 ? 'checkinout-header-basic' : 'checkinout-header-data'}>{label}</th>)}</tr></thead><tbody>{sortedRows.map((row) => {
        const alerts = getCheckinOutCellAlerts(row); const cells = getCheckinOutExportRows([row])[1];
        return <tr key={row.key} title={`Attendance status: ${row.status}`}>{cells.map((value, index) => { const alert = (index === 4 && alerts.has('checkIn')) || (index === 5 && alerts.has('checkOut')) || (index === 6 && alerts.has('duration')) || (index === 8 && alerts.has('counterVisited')); const pending = index >= 10 && index <= 11 && (index === 10 ? row.orderCount == null : row.sale == null); return <td key={CHECKIN_OUT_COLUMNS[index]} className={`${alert ? 'checkinout-cell-alert' : ''}${pending ? ' checkinout-pending-cell' : ''}`}>{index === 11 && row.sale != null ? num(row.sale, 2) : value}</td>; })}</tr>;
      })}</tbody></table>{!sortedRows.length && <p className="empty checkinout-no-rows">No records match the active filters.</p>}</div>
    </div>}
    <p className="checkinout-footnote">Total working time is calculated per employee-day as earliest valid Check In to latest valid Check Out; it is not a sum of visit durations. Durations over 18 hours or negative spans are flagged for review. Uploaded order data is matched by employee and date and is held in this browser tab only.</p>
  </section>;
}
