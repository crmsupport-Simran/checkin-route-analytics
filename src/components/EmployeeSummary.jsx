import React, { useEffect, useState } from 'react';
import { duration, money } from '../utils/formatUtils';
import { displayDate } from '../utils/dateUtils';

const PAGE_SIZE = 100;

export default function EmployeeSummary({ rows, onSelect, analysis }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => setVisibleCount(PAGE_SIZE), [rows]);
  const visibleRows = rows.slice(0, visibleCount);
  return <section className="card table-card"><div className="section-head"><div><span className="eyebrow">DATE / ALL EMPLOYEES</span><h2>Employee Summary</h2></div><span>{rows.length.toLocaleString()} employee/day rows</span></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Employee</th><th>Emp ID</th><th>Visits</th><th>Visit Time</th><th>Order Value</th><th>Route Quality</th><th>Route Pattern</th><th/></tr></thead><tbody>{visibleRows.map((row) => { const item = analysis?.[`${row.empId}|${row.dateKey}`]; return <tr key={`${row.empId}-${row.dateKey}`}><td>{displayDate(new Date(`${row.dateKey}T00:00:00`))}</td><td><b>{row.name}</b><small>{row.designation}</small></td><td>{row.empId}</td><td>{row.visits}</td><td>{duration(row.minutes)}</td><td>{money(row.order)}</td><td>{item?.quality || 'Not analyzed'}</td><td>{item?.pattern || 'Not analyzed'}</td><td><button className="link" onClick={() => onSelect(row)}>View route</button></td></tr>; })}</tbody></table>{!rows.length && <p className="empty">No employee/day rows match these filters.</p>}</div>{visibleCount < rows.length && <button className="secondary load-more" onClick={() => setVisibleCount((count) => Math.min(rows.length, count + PAGE_SIZE))}>Show {Math.min(PAGE_SIZE, rows.length - visibleCount)} more of {rows.length.toLocaleString()}</button>}</section>;
}
