import { DateFormatOption } from '../types/tourism';

export function formatCurrency(amount: number, currencySymbol = '₹'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(Math.round(safe));
  return `${currencySymbol}${formatted}`;
}

export function formatDate(isoDate: string | undefined | null, format: DateFormatOption = 'DD-MM-YYYY'): string {
  if (!isoDate) return '—';
  const clean = isoDate.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  if (format === 'DD-MM-YYYY') return `${day}-${month}-${year}`;
  if (format === 'MM-DD-YYYY') return `${month}-${day}-${year}`;
  return `${year}-${month}-${day}`;
}

export function formatMonthYear(yyyyMm: string): string {
  if (!yyyyMm || !yyyyMm.includes('-')) return yyyyMm;
  const [y, m] = yyyyMm.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = parseInt(m, 10) - 1;
  return `${monthNames[idx] ?? m} ${y}`;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function generateNextId(prefix: string, existingIds: string[], pad = 3): string {
  let maxNum = 0;
  const regex = new RegExp(`^${prefix}-(?:\\d{4}-)?(\\d+)$`);
  for (const id of existingIds) {
    const match = id.match(regex);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(pad, '0')}`;
}

export function generateBookingId(existingIds: string[]): string {
  const year = new Date().getFullYear();
  let maxNum = 0;
  const regex = new RegExp(`^BK-${year}-(\\d+)$`);
  for (const id of existingIds) {
    const match = id.match(regex);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `BK-${year}-${String(maxNum + 1).padStart(3, '0')}`;
}

export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function isValidEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}
