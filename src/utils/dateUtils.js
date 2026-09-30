import * as XLSX from 'xlsx';
const INDIA = 'en-IN';
export function parseExcelDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value)) return value;
  if (typeof value === 'number') { const parsed = XLSX.SSF.parse_date_code(value); return parsed ? new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S)) : null; }
  const text = String(value).trim();
  const dmY = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmY) { const [, d, m, y, h = 0, min = 0, s = 0] = dmY; return new Date(Number(y.length === 2 ? `20${y}` : y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s)); }
  const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? null : parsed;
}
export const dateKey = (date) => date ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` : '';
export const displayDate = (date) => date ? new Intl.DateTimeFormat(INDIA, { day: '2-digit', month: 'short', year: 'numeric' }).format(date) : '—';
export const displayTime = (date) => date ? new Intl.DateTimeFormat(INDIA, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date) : '—';
export function parseDuration(value, checkIn, checkOut) {
  if (checkIn && checkOut) return Math.max(0, (checkOut - checkIn) / 60000);
  if (typeof value === 'number') return value < 1 ? value * 24 * 60 : value;
  const m = String(value || '').match(/(?:(\d+)\s*(?:h|hour))?\s*:?(\d+)?\s*(?:m|min)?/i); return m ? Number(m[1] || 0) * 60 + Number(m[2] || 0) : 0;
}
