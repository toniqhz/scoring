import type { GradingResult } from '../../types/gradingResult';

export interface DuplicateStudentGroup {
  mssv: string;
  hoTen: string | null;
  sheets: { sheetId: string; fileName: string; examCode: string | null; score: number | null }[];
}

/**
 * Phát hiện các sinh viên có từ 2 phiếu chấm trở lên trong danh sách HIỆN TẠI — thường do scan
 * trùng 2 ảnh của cùng 1 phiếu, hoặc thao tác nhầm nộp/scan 2 lần. Chỉ nên gọi với `activeResults`
 * (đã loại bài "bỏ") — bỏ 1 trong 2 bài trùng qua nút "Bỏ bài thi" đã có sẵn là cách xử lý, và làm
 * vậy cũng tự động khiến nhóm đó biến mất khỏi cảnh báo này (không cần logic ẩn/bỏ qua riêng).
 */
export function detectDuplicateStudents(results: GradingResult[]): DuplicateStudentGroup[] {
  const byMssv = new Map<string, GradingResult[]>();
  for (const r of results) {
    if (!r.mssv) continue;
    if (!byMssv.has(r.mssv)) byMssv.set(r.mssv, []);
    byMssv.get(r.mssv)!.push(r);
  }

  const groups: DuplicateStudentGroup[] = [];
  for (const [mssv, rows] of byMssv) {
    if (rows.length < 2) continue;
    groups.push({
      mssv,
      hoTen: rows.find((r) => r.hoTen)?.hoTen ?? null,
      sheets: rows.map((r) => ({ sheetId: r.sheetId, fileName: r.fileName, examCode: r.examCode, score: r.score })),
    });
  }
  groups.sort((a, b) => a.mssv.localeCompare(b.mssv));
  return groups;
}
