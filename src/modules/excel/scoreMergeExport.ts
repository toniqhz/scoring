import * as XLSX from 'xlsx';
import type { RosterEntry } from '../../types/roster';
import { postprocessMergedScoresWorkbook, type CellFillInstruction } from './xlsxPostprocess';

export interface ExamColumn {
  id: string;
  label: string;
  scoresByMssv: Map<string, number>;
}

/** Quy đổi chỉ số cột 0-based sang tên cột kiểu Excel (0->A, 25->Z, 26->AA...). */
function columnLetter(colIndex0: number): string {
  let n = colIndex0 + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const FIXED_COLUMN_COUNT = 2; // MSSV, Họ tên

/** Xuất bảng điểm tổng hợp (1 dòng/sinh viên, 1 cột/kỳ thi) ra .xlsx — ô thiếu điểm (sinh viên
 * không có trong file điểm kỳ thi đó) để trống và tô đỏ/hồng nhạt. */
export async function exportMergedScoresToXlsxBytes(roster: RosterEntry[], columns: ExamColumn[]): Promise<Uint8Array> {
  const header = ['MSSV', 'Họ tên', ...columns.map((c) => c.label)];
  const fills: CellFillInstruction[] = [];

  const rows = roster.map((student, rowIndex) => {
    const sheetRow = rowIndex + 2; // dòng 1 là header
    const scoreCells = columns.map((col, colIdx) => {
      const score = col.scoresByMssv.get(student.mssv);
      if (score === undefined) {
        fills.push({ cellRef: `${columnLetter(FIXED_COLUMN_COUNT + colIdx)}${sheetRow}`, kind: 'missingScore' });
        return '';
      }
      return score;
    });
    return [student.mssv, student.hoTen, ...scoreCells];
  });

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Bảng điểm tổng hợp');
  const baseBytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;

  return postprocessMergedScoresWorkbook(baseBytes, { sheetPath: 'xl/worksheets/sheet1.xml', fills });
}
