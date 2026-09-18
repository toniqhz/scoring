import * as XLSX from 'xlsx';

function normalizeHeader(h: string): string {
  return h
    // "Đ/đ" (U+0110/U+0111) KHÔNG tách được qua NFD như các dấu khác (nó là 1 chữ cái riêng, không
    // phải "D" + dấu kết hợp) — nếu không thay tay, "Điểm" bị normalize NHẦM thành "iem" (rớt hẳn
    // chữ Đ) thay vì "diem", khiến isScoreHeader không bao giờ khớp được cột "Điểm".
    .replace(/đ/gi, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isMssvHeader(h: string): boolean {
  return h.includes('mssv') || h.includes('masosv') || h.includes('masv') || h.includes('sobaodanh') || h === 'sbd';
}

function isScoreHeader(h: string): boolean {
  return h.includes('diem') || h.includes('score');
}

export interface ScoreFileResult {
  /** MSSV -> điểm — chỉ chứa các dòng đọc được CẢ MSSV lẫn điểm là số hợp lệ. */
  scoresByMssv: Map<string, number>;
  /** Tổng số dòng đọc được MSSV (kể cả dòng điểm trống/không phải số — dùng để báo "đọc được N dòng"). */
  rowCount: number;
}

/**
 * Đọc 1 file điểm (Excel) của 1 kỳ thi — tự dò cột MSSV và Điểm theo tên tiêu đề, giống cách
 * rosterImport.ts dò MSSV/Họ tên. File điểm thường CHÍNH LÀ file do bước "Chấm bài" xuất ra (tab
 * "Bảng điểm": cột MSSV + Điểm), nhưng không bắt buộc — miễn đúng 2 cột tên như trên ở sheet đầu.
 * Dòng có MSSV nhưng điểm trống/không phải số: vẫn đếm vào rowCount, nhưng KHÔNG có trong
 * scoresByMssv — khi ghép bảng (mergeScores) sẽ hiện là "thiếu điểm" giống hệt trường hợp không nộp
 * bài (không phân biệt được 2 trường hợp này từ dữ liệu, và cũng không cần phân biệt — với giáo
 * viên cả 2 đều là "cần xem lại").
 */
export function parseScoreWorkbook(buffer: ArrayBuffer): ScoreFileResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const scoresByMssv = new Map<string, number>();
  let rowCount = 0;
  for (const row of rows) {
    let mssv = '';
    let scoreRaw: unknown = '';
    let scoreFound = false;
    for (const [key, value] of Object.entries(row)) {
      const norm = normalizeHeader(key);
      if (!mssv && isMssvHeader(norm)) mssv = String(value).trim();
      if (!scoreFound && isScoreHeader(norm)) {
        scoreRaw = value;
        scoreFound = true;
      }
    }
    if (!mssv) continue;
    rowCount++;
    const scoreNum = typeof scoreRaw === 'number' ? scoreRaw : parseFloat(String(scoreRaw).replace(',', '.'));
    if (Number.isFinite(scoreNum)) scoresByMssv.set(mssv, scoreNum);
  }
  return { scoresByMssv, rowCount };
}

export async function parseScoreFile(file: File): Promise<ScoreFileResult> {
  const buffer = await file.arrayBuffer();
  return parseScoreWorkbook(buffer);
}
