export function getConfirmedAttendanceEndpoints(attendanceDay, historicalAnchor = null) {
  const startPoint = attendanceDay?.startPoint || null;
  const endPoint = attendanceDay?.stopPoint || null;
  return {
    startPoint,
    endPoint,
    startSource: startPoint ? 'Attendance Start GPS' : 'Unavailable',
    endSource: endPoint ? 'Attendance Stop GPS' : 'Unavailable',
    historicalAnchor,
  };
}
