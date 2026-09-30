import React, { useEffect, useMemo, useState } from 'react';
import { displayDate, displayTime } from '../utils/dateUtils';
import { csvValue } from '../utils/formatUtils';
import { INTEGRITY_TYPES } from '../services/integrityAnalysis';

const defaultFilters = { from: '', to: '', employee: '', empId: '', location: '', type: '', status: '' };
const includes = (value, query) => String(value || '').toLowerCase().includes(String(query || '').toLowerCase());

function exportVerification(groups) {
  const rows = [['Employee Name', 'Emp ID', 'Date', 'Location', 'Type', 'Check-in Count', 'First Check-in Time', 'Last Check-in Time', 'Duplicate Status', 'Verification Required'], ...groups.map((group) => [group.employee, group.empId, group.date, group.location, group.type, group.count, displayTime(group.firstCheckIn), displayTime(group.lastCheckIn), group.status, 'Yes'])];
  const csv = rows.map((row) => row.map(csvValue).join(',')).join('\n');
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'duplicate-checkin-verification-report.csv'; link.click(); URL.revokeObjectURL(link.href);
}

const card = (label, value, className = '') => <div className={`integrity-kpi ${className}`}><span>{label}</span><strong>{value.toLocaleString()}</strong></div>;

export default function IntegrityAnalysis({ integrity }) {
  const [filters, setFilters] = useState(defaultFilters);
  const [filterDraft, setFilterDraft] = useState(defaultFilters);
  const [tab, setTab] = useState('overview');
  const [visibleCount, setVisibleCount] = useState(100);
  const update = (key, value) => setFilterDraft((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    if (JSON.stringify(filterDraft) === JSON.stringify(filters)) return undefined;
    const timer = setTimeout(() => setFilters(filterDraft), 220);
    return () => clearTimeout(timer);
  }, [filterDraft, filters]);
  const filtered = useMemo(() => integrity.groups.filter((group) =>
    (!filters.from || group.date >= filters.from) && (!filters.to || group.date <= filters.to) &&
    (!filters.employee || includes(group.employee, filters.employee)) && (!filters.empId || includes(group.empId, filters.empId)) &&
    (!filters.location || includes(group.location, filters.location)) && (!filters.type || group.type === filters.type) && (!filters.status || group.status === filters.status)
  ), [integrity.groups, filters]);
  const duplicates = useMemo(() => filtered.filter((group) => group.count > 1), [filtered]);
  const totalRecords = filtered.reduce((sum, group) => sum + group.count, 0);
  const high = duplicates.filter((group) => group.count >= 4).length;
  const topEmployees = useMemo(() => Object.values(filtered.reduce((map, group) => { if (group.count > 1) { const item = map[group.empId] || (map[group.empId] = { employee: group.employee, empId: group.empId, groups: 0, records: 0 }); item.groups += 1; item.records += group.count; } return map; }, {})).sort((a, b) => b.records - a.records).slice(0, 10), [filtered]);
  const topLocations = useMemo(() => Object.values(filtered.reduce((map, group) => { if (group.count > 1) { const item = map[group.location] || (map[group.location] = { location: group.location, groups: 0, records: 0 }); item.groups += 1; item.records += group.count; } return map; }, {})).sort((a, b) => b.records - a.records).slice(0, 10), [filtered]);
  const typeStats = useMemo(() => INTEGRITY_TYPES.map((type) => { const groups = filtered.filter((group) => group.type === type); const duplicate = groups.filter((group) => group.count > 1); return { type, total: groups.reduce((sum, group) => sum + group.count, 0), normal: groups.filter((group) => group.count === 1).length, duplicate: duplicate.reduce((sum, group) => sum + group.count, 0), groups: duplicate.length, max: Math.max(0, ...groups.map((group) => group.count)) }; }), [filtered]);
  const maxType = Math.max(1, ...typeStats.map((stat) => stat.duplicate));
  const visibleGroups = useMemo(() => tab === 'verification' ? duplicates : filtered, [tab, duplicates, filtered]);
  useEffect(() => setVisibleCount(100), [visibleGroups, tab]);
  const tableRows = visibleGroups.slice(0, visibleCount);
  return <main className="integrity-view">
    <div className="integrity-title"><div><span className="eyebrow">CHECK-IN ANALYSIS</span><h2>Check-in Integrity &amp; Duplicate Analysis</h2><p>Repeated patterns require verification; they are not automatically classified as fake.</p></div><button className="secondary" onClick={() => exportVerification(duplicates)}>Export verification CSV</button></div>
    <section className="integrity-filters card"><div><label>From date</label><input type="date" value={filterDraft.from} onChange={(event) => update('from', event.target.value)}/></div><div><label>To date</label><input type="date" value={filterDraft.to} onChange={(event) => update('to', event.target.value)}/></div><div><label>Employee</label><input placeholder="Search employee" value={filterDraft.employee} onChange={(event) => update('employee', event.target.value)}/></div><div><label>Emp ID</label><input placeholder="Search ID" value={filterDraft.empId} onChange={(event) => update('empId', event.target.value)}/></div><div><label>Location</label><input placeholder="Search location" value={filterDraft.location} onChange={(event) => update('location', event.target.value)}/></div><div><label>Type</label><select value={filterDraft.type} onChange={(event) => update('type', event.target.value)}><option value="">All</option>{INTEGRITY_TYPES.map((type) => <option key={type}>{type}</option>)}</select></div><div><label>Duplicate status</label><select value={filterDraft.status} onChange={(event) => update('status', event.target.value)}><option value="">All statuses</option><option>Normal Check-in</option><option>Duplicate Check-in</option><option>High Duplicate Activity</option><option>Very High Duplicate Activity</option></select></div><button className="secondary" onClick={() => { setFilterDraft(defaultFilters); setFilters(defaultFilters); }}>Clear</button></section>
    <nav className="integrity-tabs">{[['overview', 'Overview'], ['employee', 'Employee Analysis'], ['location', 'Location Analysis'], ['type', 'Type Analysis'], ['verification', 'Duplicate Verification']].map(([id, label]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
    <section className="integrity-kpis">{card('Total Check-ins', totalRecords)}{card('Normal Check-ins', filtered.filter((group) => group.count === 1).length, 'normal')}{card('Duplicate Groups', duplicates.length, 'duplicate')}{card('Duplicate Records', duplicates.reduce((sum, group) => sum + group.count, 0), 'duplicate')}{card('High / Very High Groups', high, 'high')}{card('Verification Required', duplicates.length, 'high')}</section>
    {(tab === 'overview' || tab === 'type') && <section className="card type-analysis"><div className="section-head"><div><span className="eyebrow">TYPE-WISE ANALYSIS</span><h2>Normal vs. duplicate check-ins</h2></div></div><div className="type-grid">{typeStats.map((stat) => <article key={stat.type}><h3>{stat.type}</h3><div className="type-bar"><i style={{ width: `${(stat.duplicate / maxType) * 100}%` }}/></div><dl><div><dt>Total check-ins</dt><dd>{stat.total}</dd></div><div><dt>Normal single check-ins</dt><dd>{stat.normal}</dd></div><div><dt>Duplicate groups</dt><dd>{stat.groups}</dd></div><div><dt>Duplicate records</dt><dd>{stat.duplicate}</dd></div><div><dt>Maximum at one location</dt><dd>{stat.max}</dd></div></dl></article>)}</div></section>}
    {(tab === 'overview' || tab === 'employee' || tab === 'location') && <section className="integrity-top-grid"><section className="card top-table"><h3>Top employees by duplicate activity</h3><table><thead><tr><th>Employee</th><th>Emp ID</th><th>Groups</th><th>Records</th></tr></thead><tbody>{topEmployees.map((item) => <tr key={item.empId}><td>{item.employee}</td><td>{item.empId}</td><td>{item.groups}</td><td>{item.records}</td></tr>)}</tbody></table></section><section className="card top-table"><h3>Top locations by duplicate activity</h3><table><thead><tr><th>Location</th><th>Groups</th><th>Records</th></tr></thead><tbody>{topLocations.map((item) => <tr key={item.location}><td>{item.location}</td><td>{item.groups}</td><td>{item.records}</td></tr>)}</tbody></table></section></section>}
    <section className="card verification-table"><div className="section-head"><div><span className="eyebrow">{tab === 'verification' ? 'VERIFICATION REQUIRED' : 'EMPLOYEE / LOCATION DETAIL'}</span><h2>{tab === 'verification' ? 'Duplicate Check-in Verification Report' : 'Repeated check-in groups'}</h2></div><span>{visibleGroups.length.toLocaleString()} groups</span></div><div className="table-scroll"><table><thead><tr><th>Employee</th><th>Emp ID</th><th>Date</th><th>Location</th><th>Type</th><th>Check-ins</th><th>First check-in</th><th>Last check-in</th><th>Status</th><th>Verification</th></tr></thead><tbody>{tableRows.map((group) => <tr key={group.key}><td>{group.employee}</td><td>{group.empId}</td><td>{group.date === 'Invalid date' ? 'Invalid date' : displayDate(new Date(`${group.date}T00:00:00`))}</td><td>{group.location}</td><td>{group.type}</td><td><b>{group.count}</b></td><td>{displayTime(group.firstCheckIn) || '—'}</td><td>{displayTime(group.lastCheckIn) || '—'}</td><td><span className={`integrity-status ${group.status.toLowerCase().replaceAll(' ', '-')}`}>{group.status}</span></td><td>{group.verificationRequired ? 'Required' : '—'}</td></tr>)}</tbody></table>{visibleCount < visibleGroups.length && <button className="secondary load-more" onClick={() => setVisibleCount((count) => count + 100)}>Show next 100 groups</button>}</div></section>
  </main>;
}
