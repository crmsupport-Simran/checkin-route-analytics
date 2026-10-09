import React, { useEffect, useMemo, useState } from 'react';
import { displayDate } from '../utils/dateUtils';

function FilterField({ label, value, clear, children }) {
  return <div className="filter-field"><label>{label}</label><div className="filter-control">{children}{value && <button className="clear-filter" type="button" title={`Clear ${label}`} onClick={clear}>×</button>}</div></div>;
}

export default function FilterPanel({ records, indexes, filters, setFilters, clear }) {
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  useEffect(() => setSearchDraft(filters.search), [filters.search]);
  useEffect(() => {
    if (searchDraft === filters.search) return undefined;
    const timer = setTimeout(() => update('search', searchDraft), 250);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search]);
  // Keep this list independent of the Date filter. A chosen employee must remain selected
  // while the user moves day-by-day through their history.
  const candidateEmployees = useMemo(() => indexes.employees.map((employee) => ({ ...employee, label: `${employee.name} — ${employee.empId}` })), [indexes.employees]);
  const visibleEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLocaleLowerCase();
    const matches = query ? candidateEmployees.filter((employee) => `${employee.name} ${employee.empId}`.toLocaleLowerCase().includes(query)) : candidateEmployees;
    const selected = candidateEmployees.find((employee) => employee.empId === filters.empId);
    return selected && !matches.some((employee) => employee.empId === selected.empId) ? [selected, ...matches] : matches;
  }, [candidateEmployees, employeeSearch, filters.empId]);
  const setEmployee = (empId) => { const employee = candidateEmployees.find((item) => item.empId === empId); setFilters((current) => ({ ...current, empId, user: employee?.name || '' })); };
  return <section className="card filters improved-filters">
    <FilterField label="Date — choose from this Excel" value={filters.date} clear={() => update('date', '')}><select value={filters.date} onChange={(event) => update('date', event.target.value)}><option value="">All dates ({indexes.dates.length})</option>{indexes.dates.map((date) => <option key={date} value={date}>{date} · {displayDate(new Date(`${date}T00:00:00`))}</option>)}</select></FilterField>
    <FilterField label="Sales User — select employee" value={filters.empId} clear={() => setEmployee('')}><select value={filters.empId} onChange={(event) => setEmployee(event.target.value)}><option value="">All employees ({candidateEmployees.length})</option>{visibleEmployees.map((employee) => <option key={employee.empId} value={employee.empId}>{employee.label}</option>)}</select></FilterField>
    <FilterField label="Emp ID" value={filters.empId} clear={() => setEmployee('')}><select value={filters.empId} onChange={(event) => setEmployee(event.target.value)}><option value="">Select employee ID</option>{visibleEmployees.map((employee) => <option key={employee.empId} value={employee.empId}>{employee.empId} — {employee.name}</option>)}</select></FilterField>
    <FilterField label="Search employees" value={employeeSearch} clear={() => setEmployeeSearch('')}><input type="search" placeholder="Name or employee ID…" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} aria-label="Search employees by name or ID"/></FilterField>
    <FilterField label="Reporting Manager" value={filters.manager} clear={() => update('manager', '')}><select value={filters.manager} onChange={(event) => update('manager', event.target.value)}><option value="">All managers</option>{indexes.managers.map((manager) => <option key={manager}>{manager}</option>)}</select></FilterField>
    <FilterField label="Type" value={filters.type} clear={() => update('type', '')}><select value={filters.type} onChange={(event) => update('type', event.target.value)}><option value="">All types</option>{indexes.types.map((type) => <option key={type}>{type}</option>)}</select></FilterField>
    <FilterField label="Search all data" value={searchDraft} clear={() => { setSearchDraft(''); update('search', ''); }}><input type="search" placeholder="Employee, company, dealer…" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)}/></FilterField>
    <button className="secondary clear-all" onClick={() => { setEmployeeSearch(''); setSearchDraft(''); clear(); }}>Clear all filters</button>
  </section>;
}
