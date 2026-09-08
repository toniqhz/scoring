import * as XLSX from 'xlsx';
import type { AnswerKeyBundle } from '../../types/answerKey';

function buildAnswerKeyWorkbook(bundle: AnswerKeyBundle): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const total = bundle.totalQuestions;

  const header = ['Mã đề', ...Array.from({ length: total }, (_, i) => `Câu ${i + 1}`)];
  const rows = bundle.variants.map((v) => {
    const byPosition = new Map(v.answers.map((a) => [a.position, a.correctLetter]));
    return [v.examCode, ...Array.from({ length: total }, (_, i) => byPosition.get(i + 1) ?? '')];
  });

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  XLSX.utils.book_append_sheet(wb, sheet, 'Đáp án');
  return wb;
}

/** Bản Excel dễ đọc của file đáp án (dap-an.json) — dùng để giáo viên đối chiếu tay khi cần. */
export function exportAnswerKeyToXlsxBytes(bundle: AnswerKeyBundle): Uint8Array {
  const wb = buildAnswerKeyWorkbook(bundle);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
