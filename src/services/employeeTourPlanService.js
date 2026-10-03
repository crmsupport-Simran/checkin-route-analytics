import { haversine, isValidCoordinate } from '../utils/coordinateUtils';

const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const keyText = (value) => clean(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const coordKey = (point) => point?.map((value) => Number(value).toFixed(6)).join(',') || '';
const dateKeyOf = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
  return '';
};
export const dateLabel = (key) => { const [year, month, day] = key.split('-'); return `${day}-${month}-${year}`; };
const dayOffset = (key) => { const [year, month, day] = key.split('-').map(Number); return Math.floor(Date.UTC(year, month - 1, day) / 86400000); };
const safePoint = (point) => Array.isArray(point) && isValidCoordinate(point[0], point[1]) ? [Number(point[0]), Number(point[1])] : null;
const pointFor = (lat, lng) => { const point = [Number(lat), Number(lng)]; return isValidCoordinate(point[0], point[1]) ? point : null; };

function clusterAttendance(records) {
  const clusters = [];
  const assignment = new Map();
  const observations = [];
  for (const record of records) {
    for (const [kind, point, label] of [
      ['start', safePoint(record.startPoint), clean(record.startAddress)],
      ['stop', safePoint(record.stopPoint), clean(record.stopAddress)],
    ]) {
      if (!point && !label) continue;
      let winner = null; let best = Infinity;
      for (const cluster of clusters) {
        const nameKey = keyText(label);
        const distance = point && cluster.point ? haversine(point, cluster.point) : (!point && nameKey && cluster.names.has(nameKey) ? 0 : Infinity);
        if (distance <= 0.5 && distance < best) { best = distance; winner = cluster; }
      }
      if (!winner) {
        winner = { id: `anchor-${clusters.length + 1}`, point, names: new Set(), labels: new Map(), startCount: 0, stopCount: 0, observations: 0, dates: new Set(), pairDates: new Set(), coordinateCount: 0 };
        clusters.push(winner);
      } else if (point && !winner.point) {
        winner.point = point;
      } else if (point && winner.point && best > 0) {
        winner.point = [(winner.point[0] * winner.coordinateCount + point[0]) / (winner.coordinateCount + 1), (winner.point[1] * winner.coordinateCount + point[1]) / (winner.coordinateCount + 1)];
      }
      winner.coordinateCount += Number(Boolean(point));
      winner.observations += 1;
      if (keyText(label)) winner.names.add(keyText(label));
      winner[kind === 'start' ? 'startCount' : 'stopCount'] += 1;
      winner.labels.set(label || (point ? `${point[0].toFixed(5)}, ${point[1].toFixed(5)}` : 'Attendance location'), (winner.labels.get(label || (point ? `${point[0].toFixed(5)}, ${point[1].toFixed(5)}` : 'Attendance location')) || 0) + 1);
      const key = `${record.id}|${kind}`;
      assignment.set(key, winner);
      observations.push({ record, kind, cluster: winner });
      const dateKey = dateKeyOf(record.dateKey) || dateKeyOf(record.start) || dateKeyOf(record.stop);
      if (dateKey) winner.dates.add(dateKey);
    }
  }
  const attendanceDays = new Map();
  for (const record of records) {
    const dateKey = dateKeyOf(record.dateKey) || dateKeyOf(record.start) || dateKeyOf(record.stop);
    if (!dateKey) continue;
    if (!attendanceDays.has(dateKey)) attendanceDays.set(dateKey, []);
    attendanceDays.get(dateKey).push(record);
  }
  for (const [dateKey, sessions] of attendanceDays) {
    const ordered = [...sessions].sort((a, b) => (a.start?.getTime?.() ?? Infinity) - (b.start?.getTime?.() ?? Infinity));
    const first = ordered.find((record) => record.start) || ordered[0];
    const last = [...ordered].reverse().find((record) => record.stop) || ordered.at(-1);
    const startCluster = assignment.get(`${first.id}|start`);
    const stopCluster = assignment.get(`${last.id}|stop`);
    if (startCluster && startCluster === stopCluster) startCluster.pairDates.add(dateKey);
  }
  const rank = (a, b) => b.pairDates.size - a.pairDates.size || b.observations - a.observations || b.dates.size - a.dates.size || a.id.localeCompare(b.id);
  clusters.sort(rank);
  const primary = clusters[0] || null;
  const summaries = clusters.map((cluster) => {
    const confidence = cluster.pairDates.size >= 5 || cluster.observations >= 10 ? 'High' : cluster.pairDates.size >= 2 || cluster.observations >= 4 ? 'Medium' : 'Low';
    const label = [...cluster.labels].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || 'Attendance location';
    return { ...cluster, label, confidence, anchorType: cluster === primary ? 'HOME' : 'ATTENDANCE LOCATION' };
  });
  const byId = new Map(summaries.map((cluster) => [cluster.id, cluster]));
  return { clusters: summaries, byId, assignment, attendanceDays, primary: primary ? byId.get(primary.id) : null };
}

function temporaryStayRuns(anchorData) {
  const days = [...anchorData.attendanceDays].sort(([a], [b]) => a.localeCompare(b));
  const observations = days.map(([date, sessions]) => {
    const ordered = [...sessions].sort((a, b) => (a.start?.getTime?.() ?? Infinity) - (b.start?.getTime?.() ?? Infinity));
    const first = ordered.find((record) => record.start) || ordered[0];
    const last = [...ordered].reverse().find((record) => record.stop) || ordered.at(-1);
    const start = anchorData.assignment.get(`${first.id}|start`);
    const stop = anchorData.assignment.get(`${last.id}|stop`);
    return { date, clusterId: start && start === stop ? start.id : '', sessions: ordered, first, last };
  });
  const runs = [];
  let active = null;
  for (const item of observations) {
    if (item.clusterId && item.clusterId !== anchorData.primary?.id && active?.clusterId === item.clusterId && dayOffset(item.date) === dayOffset(active.endDate) + 1) {
      active.endDate = item.date;
      active.days.push(item.date);
    } else {
      if (active) runs.push(active);
      active = item.clusterId && item.clusterId !== anchorData.primary?.id ? { clusterId: item.clusterId, startDate: item.date, endDate: item.date, days: [item.date] } : null;
    }
  }
  if (active) runs.push(active);
  return runs.filter((run) => run.days.length >= 2);
}

function makeEndpoint(record, kind, cluster, anchorData, dayRuns, dateKey) {
  const isStart = kind === 'start';
  const point = safePoint(isStart ? record?.startPoint : record?.stopPoint);
  const label = clean(isStart ? record?.startAddress : record?.stopAddress);
  const assignedCluster = cluster || (dayRuns.find((run) => run.days.includes(dateKey)) && anchorData.byId.get(dayRuns.find((run) => run.days.includes(dateKey)).clusterId)) || anchorData.primary;
  const inferredPoint = !point && assignedCluster?.point ? assignedCluster.point : null;
  const resolvedPoint = point || inferredPoint;
  const clusterType = assignedCluster?.anchorType || 'UNKNOWN';
  const anchorType = assignedCluster && clusterType !== 'HOME' && dayRuns.some((run) => run.clusterId === assignedCluster.id && run.days.includes(dateKey)) ? 'HOTEL / TEMPORARY STAY' : clusterType;
  return {
    point: resolvedPoint,
    label: label || assignedCluster?.label || 'Not identified',
    type: anchorType,
    inferred: !point && Boolean(inferredPoint),
    confidence: assignedCluster?.confidence || 'Low',
    clusterId: assignedCluster?.id || '',
    source: point ? 'Attendance GPS' : (inferredPoint ? 'Historical attendance anchor' : 'Unavailable'),
  };
}

function selectAttendanceSessions(sessions) {
  return [...sessions].sort((a, b) => (a.start?.getTime?.() ?? Infinity) - (b.start?.getTime?.() ?? Infinity));
}

function buildEmployeeRows(employee, attendanceRecords, visits) {
  const attendanceByDay = new Map();
  for (const record of attendanceRecords) {
    const date = dateKeyOf(record.dateKey) || dateKeyOf(record.start) || dateKeyOf(record.stop);
    if (!date) continue;
    if (!attendanceByDay.has(date)) attendanceByDay.set(date, []);
    attendanceByDay.get(date).push(record);
  }
  const visitsByDay = new Map();
  for (const visit of visits) {
    const date = dateKeyOf(visit.dateKey) || dateKeyOf(visit.checkIn) || dateKeyOf(visit.date);
    if (!date) continue;
    if (!visitsByDay.has(date)) visitsByDay.set(date, []);
    visitsByDay.get(date).push(visit);
  }
  const anchorData = clusterAttendance(attendanceRecords);
  const stays = temporaryStayRuns(anchorData);
  const dates = [...new Set([...attendanceByDay.keys(), ...visitsByDay.keys()])].sort();
  const rows = [];
  for (const date of dates) {
    const sessions = selectAttendanceSessions(attendanceByDay.get(date) || []);
    const hasClockTime = (value) => value instanceof Date && (value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0);
    const dayVisits = [...(visitsByDay.get(date) || [])].sort((a, b) => {
      const aTime = hasClockTime(a.checkIn) ? a.checkIn.getTime() : Infinity;
      const bTime = hasClockTime(b.checkIn) ? b.checkIn.getTime() : Infinity;
      return aTime - bTime || (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0);
    });
    const firstSession = sessions.find((record) => record.start) || sessions[0] || null;
    const lastSession = [...sessions].reverse().find((record) => record.stop) || sessions.at(-1) || null;
    const startCluster = firstSession && anchorData.assignment.get(`${firstSession.id}|start`);
    const stopCluster = lastSession && anchorData.assignment.get(`${lastSession.id}|stop`);
    const startAnchor = makeEndpoint(firstSession, 'start', startCluster, anchorData, stays, date);
    const endAnchor = makeEndpoint(lastSession, 'stop', stopCluster, anchorData, stays, date);
    const mappedVisits = dayVisits.map((visit, index) => {
      const checkInPoint = safePoint(visit.start);
      const checkOutPoint = safePoint(visit.end);
      const dealerPoint = safePoint(visit.dealerMasterPoint);
      const point = checkInPoint || checkOutPoint || dealerPoint;
      const time = hasClockTime(visit.checkIn) ? visit.checkIn : null;
      return {
        sequence: index + 1,
        point,
        label: clean(visit.checkInLocation) || clean(visit.checkOutLocation) || clean(visit.companyName) || clean(visit.dealerChannelPartner) || 'Visit location unavailable',
        company: clean(visit.companyName) || clean(visit.dealerMasterCompany) || clean(visit.dealerChannelPartner) || '',
        type: clean(visit.type) || 'CHECK-IN',
        time,
        timeLabel: time ? time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Time unavailable',
        latitude: point?.[0] ?? '',
        longitude: point?.[1] ?? '',
        coordinateSource: checkInPoint ? 'Check-In GPS' : (checkOutPoint ? 'Check-Out GPS fallback' : (dealerPoint ? 'Dealer Master GPS fallback' : 'Unavailable')),
        raw: visit,
      };
    });
    const checkInTimes = mappedVisits.map((visit) => visit.time).filter(Boolean);
    const firstCheckIn = checkInTimes.length ? new Date(Math.min(...checkInTimes.map((time) => time.getTime()))) : null;
    const lastCheckIn = checkInTimes.length ? new Date(Math.max(...checkInTimes.map((time) => time.getTime()))) : null;
    const attendanceStart = firstSession?.start || null;
    const attendanceStop = lastSession?.stop || null;
    const reasons = [];
    if (!sessions.length && mappedVisits.length) reasons.push('Attendance missing; historical anchor inferred');
    if (sessions.length && !mappedVisits.length) reasons.push('Attendance exists but no check-ins');
    if (!startAnchor.point) reasons.push('Start anchor coordinates missing');
    if (!endAnchor.point) reasons.push('Stop anchor coordinates missing');
    if (mappedVisits.some((visit) => !visit.point)) reasons.push('One or more check-in coordinates missing');
    if (mappedVisits.some((visit) => visit.coordinateSource === 'Check-Out GPS fallback')) reasons.push('Check-Out GPS used for a visit without Check-In GPS');
    if (mappedVisits.some((visit) => visit.coordinateSource === 'Dealer Master GPS fallback')) reasons.push('Dealer Master GPS used for a check-in without GPS');
    if (startAnchor.inferred) reasons.push('Start anchor inferred from attendance history');
    if (endAnchor.inferred) reasons.push('End anchor inferred from attendance history');
    if (sessions.length > 1) reasons.push('Multiple attendance sessions');
    if (attendanceStart && firstCheckIn && firstCheckIn < attendanceStart) reasons.push('First check-in occurs before attendance start');
    if (attendanceStop && lastCheckIn && lastCheckIn > attendanceStop) reasons.push('Last check-in occurs after attendance stop');
    if (startAnchor.point && endAnchor.point && haversine(startAnchor.point, endAnchor.point) > 0.5) reasons.push('Start and stop locations differ');
    if (!startAnchor.point || !endAnchor.point || mappedVisits.some((visit) => !visit.point)) reasons.push('Insufficient anchor/location data');
    const routePoints = startAnchor.point && endAnchor.point && mappedVisits.every((visit) => visit.point)
      ? [startAnchor.point, ...mappedVisits.map((visit) => visit.point), endAnchor.point]
      : null;
    const dayStay = stays.find((run) => run.days.includes(date));
    const anchorConfidence = startAnchor.confidence === 'High' && endAnchor.confidence === 'High' ? 'High' : (startAnchor.confidence === 'Low' || endAnchor.confidence === 'Low' ? 'Low' : 'Medium');
    const confidence = !routePoints || anchorConfidence === 'Low' ? 'Low' : (reasons.length ? 'Medium' : anchorConfidence);
    const routeStatus = reasons.length ? [...new Set(reasons)].join('; ') : (dayStay ? 'Hotel/stay anchor inferred from consecutive attendance days' : 'Ready');
    const audit = [
      { sequence: 0, location: startAnchor.label, type: `${startAnchor.type} START`, time: attendanceStart, point: startAnchor.point, coordinateSource: startAnchor.source },
      ...mappedVisits.map((visit) => ({ sequence: visit.sequence, location: visit.label, company: visit.company, type: visit.type, time: visit.time, point: visit.point, coordinateSource: visit.coordinateSource })),
      { sequence: mappedVisits.length + 1, location: endAnchor.label, type: `${endAnchor.type} END`, time: attendanceStop, point: endAnchor.point, coordinateSource: endAnchor.source },
    ];
    rows.push({
      id: `${employee.key}|${date}`,
      employee: employee.name,
      empId: employee.empId,
      date,
      dateLabel: dateLabel(date),
      month: date.slice(0, 7),
      visits: mappedVisits,
      plannedVisits: mappedVisits.length,
      startAnchor,
      endAnchor,
      anchorType: startAnchor.type === endAnchor.type ? startAnchor.type : `${startAnchor.type} → ${endAnchor.type}`,
      routePoints,
      routeStatus,
      dataConfidence: confidence,
      attendanceCount: sessions.length,
      attendanceStart,
      attendanceStop,
      firstCheckIn,
      lastCheckIn,
      temporaryStay: dayStay || null,
      audit,
    });
  }
  const primary = anchorData.primary;
  const summary = {
    employee: employee.name,
    empId: employee.empId,
    primaryAnchor: primary?.label || 'Not identified',
    primaryAnchorType: primary ? 'HOME / REGULAR' : 'UNKNOWN',
    primaryPoint: primary?.point || null,
    startCount: primary?.startCount || 0,
    stopCount: primary?.stopCount || 0,
    matchedStartStopDays: primary?.pairDates.size || 0,
    confidence: primary?.confidence || 'Low',
    anchors: anchorData.clusters,
    temporaryStays: stays.map((run) => ({ ...run, label: anchorData.byId.get(run.clusterId)?.label || 'Attendance location', confidence: anchorData.byId.get(run.clusterId)?.confidence || 'Low' })),
  };
  return { rows, summary };
}

export function buildEmployeeTourPlan(report, attendance, dealers) {
  const people = new Map();
  const dealerByCode = new Map();
  const dealerByName = new Map();
  for (const dealer of dealers?.dealers || []) {
    if (!dealer.point) continue;
    const code = keyText(dealer.accountCode);
    const name = keyText(dealer.companyName || dealer.customerName);
    if (code && !dealerByCode.has(code)) dealerByCode.set(code, dealer);
    if (name) {
      const matches = dealerByName.get(name) || new Map();
      matches.set(coordKey(dealer.point), dealer);
      dealerByName.set(name, matches);
    }
  }
  const personKey = (empId, name) => clean(empId) ? `ID:${clean(empId)}` : (keyText(name) ? `NAME:${keyText(name)}` : '');
  const ensure = (empId, name) => {
    const key = personKey(empId, name);
    if (!key) return null;
    if (!people.has(key)) people.set(key, { key, empId: clean(empId), name: clean(name) || (clean(empId) ? `Employee ${clean(empId)}` : 'Unknown employee'), attendance: [], visits: [] });
    const person = people.get(key);
    if (!person.empId && clean(empId)) person.empId = clean(empId);
    if ((!person.name || person.name.startsWith('Employee ')) && clean(name)) person.name = clean(name);
    return person;
  };
  for (const record of attendance?.records || []) ensure(record.empId, record.employee)?.attendance.push(record);
  for (const record of report?.records || []) {
    const codeMatch = dealerByCode.get(keyText(record.typeId));
    const nameMatchSet = dealerByName.get(keyText(record.companyName));
    const nameMatch = nameMatchSet?.size === 1 ? [...nameMatchSet.values()][0] : null;
    const dealerMatch = codeMatch || nameMatch;
    ensure(record.empId, record.salesUserName)?.visits.push({
      ...record,
      dealerMasterPoint: dealerMatch?.point || null,
      dealerMasterCompany: dealerMatch?.companyName || dealerMatch?.customerName || '',
    });
  }
  for (const [empId, assigned] of Object.entries(dealers?.indexes?.byEmployeeId || {})) {
    const name = assigned.find((dealer) => dealer.assignedUsers?.[empId])?.assignedUsers?.[empId] || '';
    ensure(empId, name);
  }
  const rows = []; const anchors = [];
  for (const employee of people.values()) {
    const result = buildEmployeeRows(employee, employee.attendance, employee.visits);
    rows.push(...result.rows);
    anchors.push(result.summary);
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee) || a.empId.localeCompare(b.empId));
  anchors.sort((a, b) => a.employee.localeCompare(b.employee) || a.empId.localeCompare(b.empId));
  const months = [...new Set(rows.map((row) => row.month))].sort();
  return { rows, anchors, months };
}

export function enrichRouteAudit(row, routeMetrics) {
  const segments = routeMetrics?.segmentDistances || [];
  return row.audit.map((point, index) => ({
    ...point,
    company: point.company || '',
    nextLocation: row.audit[index + 1]?.location || '—',
    segmentKm: index < segments.length ? segments[index] : null,
    totalKm: Number.isFinite(routeMetrics?.totalKm) ? routeMetrics.totalKm : null,
    latitude: point.point?.[0] ?? '',
    longitude: point.point?.[1] ?? '',
    timeLabel: point.time instanceof Date ? point.time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—',
  }));
}
