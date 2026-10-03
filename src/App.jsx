import React, { useRef, useState } from 'react';
import UploadPanel from './components/UploadPanel';
import FilterPanel from './components/FilterPanel';
import Dashboard from './components/Dashboard';
import IntegrityAnalysis from './components/IntegrityAnalysis';
import TourPlan from './components/TourPlan';
import JointWorkingKpi from './components/JointWorkingKpi';
import { parseReport } from './services/excelParser';
import { parseSupplemental } from './services/supplementalLoader';

const emptyFilters = { date: '', user: '', empId: '', manager: '', type: '', search: '' };

export default function App() {
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
  const [error, setError] = useState('');
  const uploadId = useRef(0);

  const handleReport = async (file) => {
    const current = ++uploadId.current;
    setError(''); setReport(null); setIntegrity(null); setFilters(emptyFilters); setLoading(true);
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

  return <>
    <header><div className="brand">
      <img className="company-logo" src={`${import.meta.env.BASE_URL}sparsh-pearl-logo.png`} alt="Sparsh Pearl"/>
      <div className="brand-divider"/><div><h1>Check-In Route Analytics</h1><p>Private sales visit intelligence · no API key required</p></div>
      <nav className="main-nav">
        <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>Dashboard</button>
        <button className={view === 'tour' ? 'active' : ''} onClick={() => setView('tour')}>Tour Plan</button>
        <button className={view === 'integrity' ? 'active' : ''} onClick={() => setView('integrity')}>Check-in Analysis</button>
        <button className={view === 'joint-working' ? 'active' : ''} onClick={() => setView('joint-working')}>Joint Working KPI</button>
      </nav>
    </div></header>
    <div className="container">
      <UploadPanel onFile={handleReport} onAttendanceFile={(file) => loadSupplemental(file, 'attendance')} onDealerFile={(file) => loadSupplemental(file, 'dealers')}
        loading={loading} supplementalLoading={supplementalLoading} supplementalProgress={supplementalProgress} progress={progress} report={report} attendance={attendance} dealers={dealers}/>
      {error && <div className="notice error">{error}</div>}
      {view === 'tour' && <TourPlan dealers={dealers} report={report} attendance={attendance}/>}
      {view === 'joint-working' && <JointWorkingKpi report={report}/>}
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
