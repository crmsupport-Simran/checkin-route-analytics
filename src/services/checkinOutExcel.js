import XLSX from 'xlsx-js-style';
import { CHECKIN_OUT_COLUMNS, getCheckinOutCellAlerts, getCheckinOutExportRows } from './checkinOutReport.js';

const BORDER = {
  top: { style: 'thin', color: { rgb: '333333' } },
  bottom: { style: 'thin', color: { rgb: '333333' } },
  left: { style: 'thin', color: { rgb: '333333' } },
  right: { style: 'thin', color: { rgb: '333333' } },
};
const baseCellStyle = (fill, font = { name: 'Arial', sz: 10, color: { rgb: '111111' } }) => ({
  font, fill: { patternType: 'solid', fgColor: { rgb: fill } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: BORDER,
});
const cellAddress = (row, column) => XLSX.utils.encode_cell({ r: row, c: column });

export function buildCheckinOutExcelWorkbook(rows = [], title = 'CHECK-IN & CHECK-OUT REPORT') {
  const exportRows = getCheckinOutExportRows(rows);
  const [headers, ...dataRows] = exportRows;
  const worksheetRows = [Array(CHECKIN_OUT_COLUMNS.length).fill(''), headers, ...dataRows];
  worksheetRows[0][0] = title;
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetRows);
  const lastRow = worksheetRows.length;
  const titleStyle = baseCellStyle('9FC5E8', { name: 'Arial', sz: 15, bold: true, color: { rgb: '111111' } });
  for (let column = 0; column < CHECKIN_OUT_COLUMNS.length; column++) {
    const address = cellAddress(0, column);
    worksheet[address] = { t: 's', v: column === 0 ? title : '', s: titleStyle };
    worksheet[cellAddress(1, column)].s = baseCellStyle(column < 4 ? 'FFF200' : '8FCE4E', { name: 'Arial', sz: 10, bold: true, color: { rgb: '111111' } });
  }
  rows.forEach((row, index) => {
    const excelRow = index + 2;
    const alerts = getCheckinOutCellAlerts(row);
    const statusFill = ['Timestamp review required', 'Missing / invalid timestamp', 'Invalid duration'].includes(row.status)
      ? 'FFF6ED' : row.status === 'Unusual duration' ? 'FFF9DB' : index % 2 ? 'F7F7F7' : 'FFFFFF';
    for (let column = 0; column < CHECKIN_OUT_COLUMNS.length; column++) {
      let cell = worksheet[cellAddress(excelRow, column)];
      const isAlert = (column === 4 && alerts.has('checkIn')) || (column === 5 && alerts.has('checkOut'))
        || (column === 6 && alerts.has('duration')) || (column === 8 && alerts.has('counterVisited'));
      const isPending = column >= 10 && column <= 11 && (column === 10 ? row.orderCount == null : row.sale == null);
      const isMissing = cell && typeof cell.v === 'string' && cell.v.includes('SOURCE DATA REQUIRED');
      const font = {
        name: 'Arial', sz: 10, bold: isAlert || isPending || isMissing,
        color: { rgb: isAlert ? 'D71920' : (isPending || isMissing) ? '946400' : '111111' },
      };
      if (!cell) {
        cell = { t: 's', v: '', s: undefined };
        worksheet[cellAddress(excelRow, column)] = cell;
      }
      cell.s = baseCellStyle(statusFill, font);
      if (column === 11 && typeof cell.v === 'number') cell.z = '#,##0';
    }
  });
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: CHECKIN_OUT_COLUMNS.length - 1 } }];
  worksheet['!autofilter'] = { ref: `A2:M${Math.max(2, lastRow)}` };
  worksheet['!cols'] = [
    { wch: 13 }, { wch: 8 }, { wch: 28 }, { wch: 25 }, { wch: 14 }, { wch: 15 }, { wch: 18 },
    { wch: 17 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 17 }, { wch: 62 },
  ];
  worksheet['!rows'] = [
    { hpt: 30 }, { hpt: 34 },
    ...dataRows.map((cells) => {
      const remarksLength = String(cells[12] ?? '').length;
      return { hpt: Math.min(72, Math.max(25, 15 + Math.ceil(remarksLength / 68) * 12)) };
    }),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Check-In-Out Report');
  workbook.Props = { Title: title, Subject: 'Filtered Check-In / Check-Out report with matching web report formatting' };
  return workbook;
}

export function downloadCheckinOutExcel(rows = [], title, fileName) {
  XLSX.writeFile(buildCheckinOutExcelWorkbook(rows, title), fileName);
}
