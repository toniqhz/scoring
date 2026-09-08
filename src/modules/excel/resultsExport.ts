import * as XLSX from 'xlsx';
import type { GradingResult } from '../../types/gradingResult';

function buildResultsWorkbook(results: GradingResult[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const maxQuestions = Math.max(0, ...results.map((r) => r.totalQuestions));

  const header = [
    'STT',
    'MSSV',
    'Họ tên',
    'Mã đề',
    'Điểm',
    'Số câu đúng',
    'Tổng số câu',
    'Cần xem lại',
    ...Array.from({ length: maxQuestions }, (_, i) => `Câu ${i + 1}`),
  ];

  const rows = results.map((r, i) => {
    const byPosition = new Map(r.questionResults.map((q) => [q.position, q]));
    const questionCells = Array.from({ length: maxQuestions }, (_, idx) => {
      const q = byPosition.get(idx + 1);
      return q?.detectedLetter ?? '';
    });
    return [
      i + 1,
      r.mssv ?? '',
      r.hoTen ?? '',
      r.examCode ?? '',
      r.score ?? '',
      r.correctCount,
      r.totalQuestions,
      r.needsManualReview ? 'Có' : '',
      ...questionCells,
    ];
  });

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  XLSX.utils.book_append_sheet(wb, sheet, 'Bang diem');
  return wb;
}

/** Xuất bảng điểm (STT, MSSV, Họ tên, Mã đề, Điểm, chi tiết từng câu) ra file Excel. */
export function exportResultsToXlsxBytes(results: GradingResult[]): Uint8Array {
  const wb = buildResultsWorkbook(results);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
