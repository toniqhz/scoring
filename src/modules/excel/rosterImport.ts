import * as XLSX from 'xlsx';
import type { RosterEntry } from '../../types/roster';

function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isMssvHeader(h: string): boolean {
  return h.includes('mssv') || h.includes('masosv') || h.includes('masv') || h.includes('sobaodanh') || h === 'sbd';
}

function isNameHeader(h: string): boolean {
  return h.includes('hoten') || h.includes('hovaten') || h.includes('name') || h === 'ten';
}

/** Đọc danh sách lớp từ file Excel — tự dò cột MSSV và Họ tên theo tên tiêu đề (không phân biệt dấu/hoa thường). */
export function parseRosterWorkbook(buffer: ArrayBuffer): RosterEntry[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const entries: RosterEntry[] = [];
  for (const row of rows) {
    let mssv = '';
    let hoTen = '';
    for (const [key, value] of Object.entries(row)) {
      const norm = normalizeHeader(key);
      if (!mssv && isMssvHeader(norm)) mssv = String(value).trim();
      if (!hoTen && isNameHeader(norm)) hoTen = String(value).trim();
    }
    if (mssv) entries.push({ mssv, hoTen });
  }
  return entries;
}

export async function parseRosterFile(file: File): Promise<RosterEntry[]> {
  const buffer = await file.arrayBuffer();
  return parseRosterWorkbook(buffer);
}
