import React, { useEffect, useMemo, useState } from 'react';
import { haversine } from '../utils/coordinateUtils';
import { num } from '../utils/formatUtils';

const blank = { dayType: 'Normal', startType: 'OTHER', endType: 'OTHER', startLat: '', startLng: '', endLat: '', endLng: '', benchmarkMin: '10', benchmarkMax: '15' };
const point = (lat, lng) => { const a = Number(lat), b = Number(lng); return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180 ? [a, b] : null; };
const types = ['HOME', 'HOTEL', 'OFFICE', 'BASE', 'ATTENDANCE_START', 'OTHER'];

export default function DayRouteRules({ empId, date, visits, localMarketKm, onEndpoints }) {
  const storageKey = `route-day-rule:${empId}|${date}`;
  const [rule, setRule] = useState(blank);
  useEffect(() => { try { setRule({ ...blank, ...JSON.parse(localStorage.getItem(storageKey) || '{}') }); } catch { setRule(blank); } }, [storageKey]);
  const start = point(rule.startLat, rule.startLng), end = point(rule.endLat, rule.endLng);
  const first = visits[0]?.start || visits[0]?.end, last = visits.at(-1)?.end || visits.at(-1)?.start;
  const travelToMarket = start && first ? haversine(start, first) : null;
  const returnKm = end && last ? haversine(last, end) : null;
  const total = localMarketKm + (travelToMarket || 0) + (returnKm || 0);
  const min = Number(rule.benchmarkMin) || 0, max = Number(rule.benchmarkMax) || 0;
  const status = localMarketKm < min ? 'Below configured reference' : localMarketKm > max ? 'Above configured reference' : 'Within reference';
  const update = (key, value) => setRule((current) => ({ ...current, [key]: value }));
  const save = () => { localStorage.setItem(storageKey, JSON.stringify(rule)); onEndpoints?.({ start, end, startType: rule.startType, endType: rule.endType, dayType: rule.dayType }); };
  useEffect(() => { onEndpoints?.({ start, end, startType: rule.startType, endType: rule.endType, dayType: rule.dayType }); }, [rule.startLat, rule.startLng, rule.endLat, rule.endLng, rule.startType, rule.endType, rule.dayType]);
  return <section className="card day-rule"><div className="section-head"><div><span className="eyebrow">STAY / TRAVEL DAY RULE</span><h2>Field Route Summary</h2></div><button className="secondary" onClick={save}>Save day rule</button></div><div className="day-rule-controls"><div><label>Day type</label><select value={rule.dayType} onChange={(event) => update('dayType', event.target.value)}><option>Normal</option><option>Stay / Outstation</option><option>Travel</option></select></div><div><label>Start location type</label><select value={rule.startType} onChange={(event) => update('startType', event.target.value)}>{types.map((type) => <option key={type}>{type}</option>)}</select></div><div><label>Start latitude</label><input inputMode="decimal" placeholder="Optional" value={rule.startLat} onChange={(event) => update('startLat', event.target.value)}/></div><div><label>Start longitude</label><input inputMode="decimal" placeholder="Optional" value={rule.startLng} onChange={(event) => update('startLng', event.target.value)}/></div><div><label>End location type</label><select value={rule.endType} onChange={(event) => update('endType', event.target.value)}>{types.map((type) => <option key={type}>{type}</option>)}</select></div><div><label>End latitude</label><input inputMode="decimal" placeholder="Optional" value={rule.endLat} onChange={(event) => update('endLat', event.target.value)}/></div><div><label>End longitude</label><input inputMode="decimal" placeholder="Optional" value={rule.endLng} onChange={(event) => update('endLng', event.target.value)}/></div><div><label>Local reference (KM)</label><div className="benchmark-inputs"><input inputMode="decimal" value={rule.benchmarkMin} onChange={(event) => update('benchmarkMin', event.target.value)}/><span>to</span><input inputMode="decimal" value={rule.benchmarkMax} onChange={(event) => update('benchmarkMax', event.target.value)}/></div></div></div><div className="day-breakdown"><span><b>Day type</b>{rule.dayType}</span><span><b>Start → first visit</b>{travelToMarket == null ? 'Start coordinates unavailable' : `${num(travelToMarket, 2)} km`}</span><span><b>Local market movement</b>{num(localMarketKm, 2)} km</span><span><b>Last visit → end</b>{returnKm == null ? 'End coordinates unavailable' : `${num(returnKm, 2)} km`}</span><span><b>Total field route</b>{num(total, 2)} km</span><span><b>Local movement status</b>{status} · {min}–{max} km reference</span></div><p className="day-rule-note">Start/end distances are only calculated when coordinates are explicitly supplied. Attendance addresses are retained as text and never converted into guessed coordinates.</p></section>;
}
