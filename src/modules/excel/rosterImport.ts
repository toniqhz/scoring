import * as XLSX from 'xlsx';
import type { RosterEntry } from '../../types/roster';

function normalizeHeader(h: string): string {
  return h
    // "\u0110/\u0111" KH\u00d4NG t\u00e1ch \u0111\u01b0\u1ee3c qua NFD nh\u01b0 c\u00e1c d\u1ea5u kh\u00e1c (l\u00e0 1 ch\u1eef c\u00e1i ri\u00eang, kh\u00f4ng ph\u1ea3i "D" + d\u1ea5u k\u1ebft
    // h\u1ee3p) \u2014 n\u1ebfu kh\u00f4ng thay tay tr\u01b0\u1edbc, 1 ti\u00eau \u0111\u1ec1 b\u1eaft \u0111\u1ea7u b\u1eb1ng "\u0110" s\u1ebd b\u1ecb r\u1edbt h\u1eb3n ch\u1eef \u0111\u00f3 khi chu\u1ea9n h\u00f3a.
    .replace(/\u0111/gi, 'd')
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
