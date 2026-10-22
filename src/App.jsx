import React, { useEffect, useRef, useState } from 'react';
import UploadPanel from './components/UploadPanel';
import FilterPanel from './components/FilterPanel';
import Dashboard from './components/Dashboard';
import IntegrityAnalysis from './components/IntegrityAnalysis';
import TourPlan from './components/TourPlan';
import JointWorkingKpi from './components/JointWorkingKpi';
import EmployeeTourPlanReport from './components/EmployeeTourPlanReport';
import Q1Q3ReportsDashboard from './components/Q1Q3ReportsDashboard';
import { parseReport } from './services/excelParser';
import { parseSupplemental } from './services/supplementalLoader';

const emptyFilters = { date: '', user: '', empId: '', manager: '', type: '', search: '' };
const APPEARANCE_KEY = 'checkin-route-analytics-appearance';

function getStoredAppearance() {
  try {
    const saved = localStorage.getItem(APPEARANCE_KEY);
    return ['light', 'dark', 'system'].includes(saved) ? saved : 'light';
  } catch {
    return 'light';
  }
}

export default function App() {
  const [appearance, setAppearance] = useState(getStoredAppearance);
  const [report, setReport] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [dealers, setDealers] = useState(null);
  const [view, setView] = useState('dashboard');
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [supplementalLoading, setSupplementalLoading] = useState({ attendance: false, dealers: false });
  const [supplementalProgress, setSupplementalProgress] = useState({ attendance: null, dealers: null });
  const [progress, setProgress] = useState({ stage: '', progress: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const uploadId = useRef(0);
  const reportFile = useRef(null);
  const supplementalFiles = useRef({ attendance: null, dealers: null });

  useEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applyAppearance = () => {
      const resolved = appearance === 'system' ? (systemTheme.matches ? 'dark' : 'light') : appearance;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    applyAppearance();
    systemTheme.addEventListener?.('change', applyAppearance);
    try { localStorage.setItem(APPEARANCE_KEY, appearance); } catch { /* Keep the theme usable when storage is unavailable. */ }
    return () => systemTheme.removeEventListener?.('change', applyAppearance);
  }, [appearance]);

  const handleReport = async (file, { keepCurrent = false } = {}) => {
    reportFile.current = file;
    const current = ++uploadId.current;
    setError('');
    if (!keepCurrent) { setReport(null); setIntegrity(null); setFilters(emptyFilters); }
    setLoading(true);
    setProgress({ stage: 'Reading Excel file…', progress: 0 });
    try {
      const parsed = await parseReport(file, (next) => { if (current === uploadId.current) setProgress(next); });
      if (current !== uploadId.current) return;
      setIntegrity(parsed.integrity);
      setReport({ ...parsed, fileName: file.name });
      setProgress({ stage: 'Ready', progress: 100 });
    } catch (exception) {
      if (current === uploadId.current) { setReport(null); setIntegrity(null); setError(exception.message || 'That file could not be read.'); }
    } finally {
      if (current === uploadId.current) setLoading(false);
    }
  };

  const loadSupplemental = async (file, kind) => {
    supplementalFiles.current[kind] = file;
    setError('');
    setSupplementalLoading((current) => ({ ...current, [kind]: true }));
    setSupplementalProgress((current) => ({ ...current, [kind]: { stage: 'Reading file…', progress: 0 } }));
    try {
      const parsed = await parseSupplemental(file, kind, (next) => setSupplementalProgress((current) => ({ ...current, [kind]: next })));
      if (kind === 'attendance') setAttendance(parsed);
      else setDealers(parsed);
    } catch (exception) {
      setError(exception.message || 'The supplemental file could not be read.');
    } finally {
      setSupplementalLoading((current) => ({ ...current, [kind]: false }));
      setSupplementalProgress((current) => ({ ...current, [kind]: null }));
    }
  };

  const refreshLoadedData = async () => {
    setRefreshing(true);
    try {
      const refreshes = [];
      if (reportFile.current) refreshes.push(handleReport(reportFile.current, { keepCurrent: true }));
      if (supplementalFiles.current.attendance) refreshes.push(loadSupplemental(supplementalFiles.current.attendance, 'attendance'));
      if (supplementalFiles.current.dealers) refreshes.push(loadSupplemental(supplementalFiles.current.dealers, 'dealers'));
      await Promise.all(refreshes);
    } finally {
      setRefreshing(false);
    }
  };

  return <>
    <header><div className="brand">
      <img className="company-logo" src={`${import.meta.env.BASE_URL}check-in-route-analytics-logo.png`} alt="Check-In Route Analytics"/>
      <div className="brand-divider"/><div><h1>Check-In Route Analytics</h1><p>Private sales visit intelligence · no API key required</p></div>
      <nav className="main-nav">
        <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>Dashboard</button>
        <button className={view === 'tour' ? 'active' : ''} onClick={() => setView('tour')}>Tour Plan</button>
        <button className={view === 'integrity' ? 'active' : ''} onClick={() => setView('integrity')}>Check-in Analysis</button>
        <button className={view === 'joint-working' ? 'active' : ''} onClick={() => setView('joint-working')}>Joint Working KPI</button>
        <button className={view === 'q1-q3-reports' ? 'active' : ''} onClick={() => setView('q1-q3-reports')}>Q1–Q2 Reports</button>
        <button className={view === 'employee-tour' ? 'active' : ''} onClick={() => setView('employee-tour')}>Employee Tour Plan</button>
        <label className="appearance-control">Appearance
          <select aria-label="Appearance" value={appearance} onChange={(event) => setAppearance(event.target.value)}>
            <option value="light">☀️ Light</option>
            <option value="dark">🌙 Dark</option>
            <option value="system">System</option>
          </select>
        </label>
        <button className="refresh-button" onClick={refreshLoadedData} disabled={refreshing || (!reportFile.current && !supplementalFiles.current.attendance && !supplementalFiles.current.dealers)} title="Re-read the currently loaded report files">{refreshing ? 'Refreshing…' : '↻ Refresh Data'}</button>
      </nav>
    </div></header>
    <div className="container">
      <UploadPanel onFile={handleReport} onAttendanceFile={(file) => loadSupplemental(file, 'attendance')} onDealerFile={(file) => loadSupplemental(file, 'dealers')}
        loading={loading} supplementalLoading={supplementalLoading} supplementalProgress={supplementalProgress} progress={progress} report={report} attendance={attendance} dealers={dealers}/>
      {error && <div className="notice error">{error}</div>}
      {view === 'tour' && <TourPlan dealers={dealers} report={report} attendance={attendance}/>}
      {view === 'joint-working' && <JointWorkingKpi report={report}/>}
      {view === 'q1-q3-reports' && <Q1Q3ReportsDashboard report={report}/>}
      {view === 'employee-tour' && <EmployeeTourPlanReport report={report} attendance={attendance} dealers={dealers}/>}
      {report && view === 'dashboard' && <>
        <FilterPanel indexes={report.indexes} filters={filters} setFilters={setFilters} clear={() => setFilters(emptyFilters)}/>
        {report.missingGpsCount > 0 && <div className="notice">{report.missingGpsCount.toLocaleString()} records have invalid or incomplete GPS. They remain available in the table but are excluded from route points.</div>}
        <Dashboard report={report} filters={filters} setFilters={setFilters} attendance={attendance} dealers={dealers}/>
      </>}
      {report && integrity && view === 'integrity' && <IntegrityAnalysis integrity={integrity}/>}
      <footer>Designed for Pearl Precision Products Pvt. Ltd. by Simrandeep Singh</footer>
    </div>
  </>;
}
