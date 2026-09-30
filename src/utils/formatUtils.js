export const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
export const num = (value, digits = 1) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: digits });
export const duration = (minutes) => { const n = Math.max(0, Math.round(Number(minutes) || 0)); return n >= 60 ? `${Math.floor(n / 60)}h ${n % 60}m` : `${n} min`; };
export const csvValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
export const formatDistance = (value, { first = false } = {}) => first ? 'START POINT' : (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? `${Number(value).toFixed(2)} km` : 'N/A — GPS unavailable');
