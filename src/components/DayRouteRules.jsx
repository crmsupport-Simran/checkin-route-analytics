import React, { useEffect, useState } from 'react';
import { haversine, isValidCoordinate } from '../utils/coordinateUtils';
import { num } from '../utils/formatUtils';

const blank = { dayType: 'Normal', startType: 'OTHER', endType: 'OTHER', startLat: '', startLng: '', endLat: '', endLng: '', benchmarkMin: '10', benchmarkMax: '15' };
const types = ['HOME', 'HOTEL', 'OFFICE', 'BASE', 'ATTENDANCE_START', 'OTHER'];
const numericCoordinate = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const configuredPoint = (latitudeInput, longitudeInput) => {
  const latText = String(latitudeInput ?? '').trim(), lngText = String(longitudeInput ?? '').trim();
  if (!latText && !lngText) return { point: null, status: 'Not set — blank values are not converted to (0, 0)' };
  const latitude = numericCoordinate(latitudeInput), longitude = numericCoordinate(longitudeInput);
  if (latitude === null || longitude === null) return { point: null, status: 'Invalid / unavailable coordinates — enter numeric latitude and longitude' };
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return { point: null, status: 'Invalid / unavailable coordinates — outside latitude/longitude bounds' };
  if (latitude === 0 && longitude === 0) return { point: null, status: 'Invalid / unavailable coordinates — (0, 0) is not a location' };
  return { point: [latitude, longitude], status: 'Valid reference coordinates; excluded from Actual Route' };
};
const coordText = (point) => point && isValidCoordinate(...point) ? `${point[0].toFixed(6)}, ${point[1].toFixed(6)}` : 'Invalid / unavailable coordinates';
const rawCoordText = (value) => value === null || value === undefined || String(value).trim() === '' ? 'blank' : String(value);

export default function DayRouteRules({ empId, date, visits, localMarketKm, attendance, attendanceDay, attendanceEndpoints }) {
  const storageKey = `route-day-rule:${empId}|${date}`;
  const [rule, setRule] = useState(blank);
  useEffect(() => { try { setRule({ ...blank, ...JSON.parse(localStorage.getItem(storageKey) || '{}') }); } catch { setRule(blank); } }, [storageKey]);

  const startCheck = configuredPoint(rule.startLat, rule.startLng), endCheck = configuredPoint(rule.endLat, rule.endLng);
  const start = startCheck.point, end = endCheck.point;
  const first = visits[0]?.start || visits[0]?.end || null, last = visits.at(-1)?.start || visits.at(-1)?.end || null;
  const travelToMarket = start && first ? haversine(start, first) : null;
  const returnKm = end && last ? haversine(last, end) : null;
  const total = localMarketKm + (travelToMarket || 0) + (returnKm || 0);
  const min = Number(rule.benchmarkMin) || 0, max = Number(rule.benchmarkMax) || 0;
  const status = localMarketKm < min ? 'Below configured reference' : localMarketKm > max ? 'Above configured reference' : 'Within reference';
  const update = (key, value) => setRule((current) => ({ ...current, [key]: value }));
  const save = () => localStorage.setItem(storageKey, JSON.stringify(rule));
  const firstVisit = visits[0], lastVisit = visits.at(-1);
  const attendanceStartSource = attendanceDay?.startPoint ? 'Matching Attendance record · Start Latitude / Start Longitude' : attendanceEndpoints?.startSource === 'Inferred Attendance Anchor' ? 'Inferred from this Employee ID historical Attendance GPS' : attendanceDay ? 'Matching Attendance record has no valid Start GPS; no historical anchor available' : attendance ? 'No matching Attendance record and no historical anchor available' : 'Attendance report not uploaded';
  const attendanceStopSource = attendanceDay?.stopPoint ? 'Matching Attendance record · Stop Latitude / Stop Longitude' : attendanceEndpoints?.endSource === 'Inferred Attendance Anchor' ? 'Inferred from this Employee ID historical Attendance GPS' : attendanceDay ? 'Matching Attendance record has no valid Stop GPS; no historical anchor available' : attendance ? 'No matching Attendance record and no historical anchor available' : 'Attendance report not uploaded';

  return <section className="card day-rule">
    <div className="section-head"><div><span className="eyebrow">STAY / TRAVEL DAY RULE</span><h2>Field Route Summary</h2></div><button className="secondary" onClick={save}>Save day rule</button></div>
    <div className="day-rule-controls">
      <div><label>Day type</label><select value={rule.dayType} onChange={(event) => update('dayType', event.target.value)}><option>Normal</option><option>Stay / Outstation</option><option>Travel</option></select></div>
      <div><label>Start location type</label><select value={rule.startType} onChange={(event) => update('startType', event.target.value)}>{types.map((type) => <option key={type}>{type}</option>)}</select></div>
      <div><label>Start latitude</label><input inputMode="decimal" placeholder="Optional" value={rule.startLat} onChange={(event) => update('startLat', event.target.value)}/><small className="coordinate-validation">{startCheck.status}</small></div>
      <div><label>Start longitude</label><input inputMode="decimal" placeholder="Optional" value={rule.startLng} onChange={(event) => update('startLng', event.target.value)}/></div>
      <div><label>End location type</label><select value={rule.endType} onChange={(event) => update('endType', event.target.value)}>{types.map((type) => <option key={type}>{type}</option>)}</select></div>
      <div><label>End latitude</label><input inputMode="decimal" placeholder="Optional" value={rule.endLat} onChange={(event) => update('endLat', event.target.value)}/><small className="coordinate-validation">{endCheck.status}</small></div>
      <div><label>End longitude</label><input inputMode="decimal" placeholder="Optional" value={rule.endLng} onChange={(event) => update('endLng', event.target.value)}/></div>
      <div><label>Local reference (KM)</label><div className="benchmark-inputs"><input inputMode="decimal" value={rule.benchmarkMin} onChange={(event) => update('benchmarkMin', event.target.value)}/><span>to</span><input inputMode="decimal" value={rule.benchmarkMax} onChange={(event) => update('benchmarkMax', event.target.value)}/></div></div>
    </div>
    <div className="day-breakdown"><span><b>Day type</b>{rule.dayType}</span><span><b>Start → first visit</b>{travelToMarket == null ? 'Start coordinates unavailable' : `${num(travelToMarket, 2)} km`}</span><span><b>Local market movement</b>{num(localMarketKm, 2)} km</span><span><b>Last visit → end</b>{returnKm == null ? 'End coordinates unavailable' : `${num(returnKm, 2)} km`}</span><span><b>Total field route</b>{num(total, 2)} km</span><span><b>Local movement status</b>{status} · {min}–{max} km reference</span></div>
    <p className="day-rule-note">Configured start/end coordinates are reference inputs for this summary only. Actual Route uses matching Attendance GPS and valid Check-In GPS; configured coordinates are not route endpoints.</p>
    <details className="route-debug"><summary>View route coordinate details</summary>
      <dl>
        <div><dt>Employee ID / Date</dt><dd>{empId} · {date}</dd></div>
        <div><dt>Attendance Start</dt><dd>{attendanceDay?.startAddress || 'Address unavailable'}<small>Lat {rawCoordText(attendanceDay?.startLatitude)} · Lon {rawCoordText(attendanceDay?.startLongitude)} · {attendanceStartSource}</small></dd></div>
        <div><dt>Attendance Stop</dt><dd>{attendanceDay?.stopAddress || 'Address unavailable'}<small>Lat {rawCoordText(attendanceDay?.stopLatitude)} · Lon {rawCoordText(attendanceDay?.stopLongitude)} · {attendanceStopSource}</small></dd></div>
        <div><dt>First Check-In</dt><dd>{firstVisit?.companyName || 'Unavailable'}<small>{coordText(firstVisit?.start || firstVisit?.end)} · {firstVisit?.coordinateSource || 'No valid GPS point'}</small></dd></div>
        <div><dt>Last Check-In</dt><dd>{lastVisit?.companyName || 'Unavailable'}<small>{coordText(lastVisit?.start || lastVisit?.end)} · {lastVisit?.coordinateSource || 'No valid GPS point'}</small></dd></div>
        <div><dt>Configured Start</dt><dd>Lat {rawCoordText(rule.startLat)} · Lon {rawCoordText(rule.startLng)}<small>{startCheck.status} · source: browser localStorage key {storageKey}</small></dd></div>
        <div><dt>Configured End</dt><dd>Lat {rawCoordText(rule.endLat)} · Lon {rawCoordText(rule.endLng)}<small>{endCheck.status} · source: browser localStorage key {storageKey}</small></dd></div>
        <div><dt>Endpoint selection</dt><dd>{attendanceStartSource}; {attendanceStopSource}<small>Valid matching Attendance GPS takes priority; otherwise only a valid historical GPS anchor for this employee is used. Invalid/unavailable configured values are never selected or plotted.</small></dd></div>
      </dl>
    </details>
  </section>;
}
