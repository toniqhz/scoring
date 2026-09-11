import * as XLSX from 'xlsx';
import type { GradingResult } from '../../types/gradingResult';
import type { AnswerKeyBundle } from '../../types/answerKey';
import type { CollusionGroup } from '../grading/detectCollusion';
import { postprocessResultsWorkbook, type CellFillInstruction, type DistributionChartSpec } from './xlsxPostprocess';

/** Tab 1: chỉ MSSV + Điểm — để dễ import/đối chiếu với hệ thống quản lý điểm khác. */
function buildSummarySheet(results: GradingResult[]): XLSX.WorkSheet {
  const header = ['MSSV', 'Điểm'];
  const rows = results.map((r) => [r.mssv ?? '', r.score ?? '']);
  return XLSX.utils.aoa_to_sheet([header, ...rows]);
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

// STT, MSSV, Họ tên, Mã đề, Điểm, Số câu đúng, Tổng số câu, Cần xem lại, Số ô đánh dấu
const DETAIL_FIXED_COLUMN_COUNT = 9;
/** Chỉ số cột (0-based) của "Số ô đánh dấu" — cột cuối trong nhóm cột cố định, tô tím. */
const MARK_COUNT_COLUMN_INDEX = 8;

/** Tab 2: bảng chi tiết đầy đủ, kèm chỉ dẫn tô màu ô câu trả lời sai (hồng) / bỏ trống (xám) /
 * đã sửa tay (vàng — ưu tiên cao nhất, để giáo viên khác dễ nhận ra câu nào do người xác nhận) /
 * số ô đánh dấu (tím — cột riêng, không phải câu trả lời; chỉ tô khi phiếu thực sự có ô bị đánh
 * dấu, markCount > 0 — phiếu không đánh dấu gì để nền trắng bình thường). */
function buildDetailSheet(results: GradingResult[]): { sheet: XLSX.WorkSheet; fills: CellFillInstruction[] } {
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
    'Số ô đánh dấu',
    ...Array.from({ length: maxQuestions }, (_, i) => `Câu ${i + 1}`),
  ];

  const fills: CellFillInstruction[] = [];
  const rows = results.map((r, rowIndex) => {
    const byPosition = new Map(r.questionResults.map((q) => [q.position, q]));
    const sheetRow = rowIndex + 2; // dòng 1 là header
    if (r.markCount > 0) {
      fills.push({ cellRef: `${columnLetter(MARK_COUNT_COLUMN_INDEX)}${sheetRow}`, kind: 'marked' });
    }
    const questionCells = Array.from({ length: maxQuestions }, (_, idx) => {
      const q = byPosition.get(idx + 1);
      if (q) {
        const cellRef = `${columnLetter(DETAIL_FIXED_COLUMN_COUNT + idx)}${sheetRow}`;
        if (q.manuallyEdited) fills.push({ cellRef, kind: 'manual' });
        else if (q.detectedLetters.length === 0) fills.push({ cellRef, kind: 'blank' });
        else if (!q.isCorrect) fills.push({ cellRef, kind: 'wrong' });
      }
      return q?.detectedLetters.join(',') ?? '';
    });
    return [
      rowIndex + 1,
      r.mssv ?? '',
      r.hoTen ?? '',
      r.examCode ?? '',
      r.score ?? '',
      r.correctCount,
      r.totalQuestions,
      r.needsManualReview ? 'Có' : '',
      r.markCount,
      ...questionCells,
    ];
  });

  return { sheet: XLSX.utils.aoa_to_sheet([header, ...rows]), fills };
}

const DISTRIBUTION_MAX_SCORE = 10;

/** Tab 3: thống kê phổ điểm — tần suất theo khoảng điểm 1.0 + các chỉ số tổng quan + biểu đồ cột. */
function buildDistributionSheet(results: GradingResult[]): { sheet: XLSX.WorkSheet; chart: DistributionChartSpec } {
  const graded = results.filter((r): r is GradingResult & { score: number } => r.score !== null);
  const buckets = Array.from({ length: DISTRIBUTION_MAX_SCORE }, (_, i) => ({
    label: `${i} - ${i + 1}`,
    count: 0,
  }));
  for (const r of graded) {
    const idx = Math.min(DISTRIBUTION_MAX_SCORE - 1, Math.max(0, Math.floor(r.score)));
    buckets[idx].count++;
  }

  const total = graded.length;
  const sortedScores = graded.map((r) => r.score).sort((a, b) => a - b);
  const average = total > 0 ? sortedScores.reduce((sum, s) => sum + s, 0) / total : 0;
  const median =
    total === 0
      ? 0
      : total % 2 === 1
        ? sortedScores[(total - 1) / 2]
        : (sortedScores[total / 2 - 1] + sortedScores[total / 2]) / 2;
  const countLE1 = graded.filter((r) => r.score <= 1).length;
  const countBelowAverage = graded.filter((r) => r.score < 5).length;
  const peakIndex = buckets.reduce((best, b, i) => (b.count > buckets[best].count ? i : best), 0);
  const pct = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(2)}%` : '0%');

  const rows: (string | number)[][] = [
    ['Khoảng điểm', 'Số thí sinh'],
    ...buckets.map((b) => [b.label, b.count]),
    [],
    ['Tổng số thí sinh (đã có điểm)', total],
    ['Điểm trung bình', Number(average.toFixed(2))],
    ['Điểm trung vị', Number(median.toFixed(2))],
    ['Số thí sinh đạt điểm <= 1', `${countLE1} (${pct(countLE1)})`],
    ['Số thí sinh đạt điểm dưới trung bình (< 5)', `${countBelowAverage} (${pct(countBelowAverage)})`],
    ['Khoảng điểm có nhiều thí sinh đạt nhất', total > 0 ? buckets[peakIndex].label : ''],
  ];
  return {
    sheet: XLSX.utils.aoa_to_sheet(rows),
    chart: {
      sheetName: 'Phổ điểm',
      title: 'Phổ điểm',
      categories: buckets.map((b) => b.label),
      values: buckets.map((b) => b.count),
      firstDataRow: 2,
    },
  };
}

/**
 * Tab 4: tỷ lệ trả lời sai theo TỪNG CÂU HỎI GỐC (không theo vị trí trên phiếu, vì mỗi mã đề
 * đảo vị trí câu hỏi khác nhau) — dùng answerKeyBundle để quy đổi (mã đề, vị trí) -> câu hỏi gốc.
 */
function buildQuestionDifficultySheet(results: GradingResult[], answerKeyBundle: AnswerKeyBundle): XLSX.WorkSheet {
  const originalIndexByExamPosition = new Map<string, number>();
  // Nội dung câu hỏi/đáp án đúng không đổi theo mã đề (chỉ vị trí/chữ cái đáp án đổi do bị xáo) —
  // nên chỉ cần lấy 1 lần từ variant đầu tiên gặp mỗi câu gốc.
  const textByOriginalIndex = new Map<number, { questionText: string; correctOptionText: string }>();
  for (const variant of answerKeyBundle.variants) {
    for (const answer of variant.answers) {
      originalIndexByExamPosition.set(`${variant.examCode}|${answer.position}`, answer.originalQuestionIndex);
      if (!textByOriginalIndex.has(answer.originalQuestionIndex) && answer.questionText) {
        textByOriginalIndex.set(answer.originalQuestionIndex, {
          questionText: answer.questionText,
          correctOptionText: answer.correctOptionText ?? '',
        });
      }
    }
  }

  const totalByOriginalIndex = new Map<number, number>();
  const wrongByOriginalIndex = new Map<number, number>();

  for (const r of results) {
    if (!r.examCode) continue;
    for (const qr of r.questionResults) {
      const originalIndex = originalIndexByExamPosition.get(`${r.examCode}|${qr.position}`);
      if (originalIndex === undefined) continue;
      totalByOriginalIndex.set(originalIndex, (totalByOriginalIndex.get(originalIndex) ?? 0) + 1);
      if (!qr.isCorrect) {
        wrongByOriginalIndex.set(originalIndex, (wrongByOriginalIndex.get(originalIndex) ?? 0) + 1);
      }
    }
  }

  const header = [
    'Câu hỏi (theo đề gốc)',
    'Nội dung câu hỏi',
    'Đáp án đúng',
    'Số lượt trả lời',
    'Số lượt trả lời sai',
    'Tỷ lệ trả lời sai (%)',
  ];
  const rows = Array.from(totalByOriginalIndex.keys())
    .sort((a, b) => a - b)
    .map((originalIndex) => {
      const total = totalByOriginalIndex.get(originalIndex) ?? 0;
      const wrong = wrongByOriginalIndex.get(originalIndex) ?? 0;
      const pct = total > 0 ? Number(((wrong / total) * 100).toFixed(2)) : 0;
      const text = textByOriginalIndex.get(originalIndex);
      return [`Câu ${originalIndex + 1}`, text?.questionText ?? '', text?.correctOptionText ?? '', total, wrong, pct];
    });

  return XLSX.utils.aoa_to_sheet([header, ...rows]);
}

/**
 * Tab 5: nghi vấn trùng đáp án sai (xem detectCollusion.ts) — 1 cặp bài nghi vấn chiếm 2 dòng liền
 * nhau (mỗi dòng 1 sinh viên, xếp DỌC thay vì 2 sinh viên nằm ngang trên cùng 1 dòng), gộp theo
 * nhóm (nhiều bài liên quan bắc cầu qua nhau thì cùng 1 mã nhóm). Các cột số liệu so sánh (số câu
 * ít nhất 1 người sai, số câu trùng, % trùng) đặt TRƯỚC thông tin sinh viên. Các ô cùng giá trị vì
 * cùng thuộc 1 nhóm/1 cặp (cột "Nhóm" trải hết các dòng của nhóm; 3 cột số liệu trải 2 dòng của
 * từng cặp) được GỘP LẠI thay vì lặp lại nội dung — dễ nhìn hơn khi 1 nhóm có nhiều hơn 2 sinh viên.
 */
function buildCollusionSheet(groups: CollusionGroup[]): XLSX.WorkSheet {
  const header = [
    'Nhóm',
    'Số câu ít nhất 1 người sai',
    'Số câu trùng đáp án sai',
    '% trùng đáp án sai',
    'MSSV',
    'Họ tên',
    'Mã đề',
  ];
  const rows: (string | number)[][] = [];
  const merges: XLSX.Range[] = [];
  let rowIndex = 1; // dòng 0 là header

  for (const g of groups) {
    const groupStartRow = rowIndex;
    for (const p of g.pairs) {
      const pairStartRow = rowIndex;
      rows.push([g.groupId, p.eitherWrongCount, p.matchingWrongCount, p.matchPercent, p.mssvA ?? '', p.hoTenA ?? '', p.examCodeA]);
      rows.push(['', '', '', '', p.mssvB ?? '', p.hoTenB ?? '', p.examCodeB]);
      rowIndex += 2;
      // Gộp 3 cột số liệu (giống nhau trên cả 2 dòng của 1 cặp) thành 1 ô duy nhất.
      for (const col of [1, 2, 3]) {
        merges.push({ s: { r: pairStartRow, c: col }, e: { r: pairStartRow + 1, c: col } });
      }
    }
    // Gộp cột "Nhóm" trải hết mọi dòng (mọi cặp) thuộc nhóm này.
    merges.push({ s: { r: groupStartRow, c: 0 }, e: { r: rowIndex - 1, c: 0 } });
  }
  if (rows.length === 0) {
    rows.push(['Không phát hiện nhóm nghi vấn nào theo ngưỡng đã đặt (xem detectCollusion.ts).']);
  }
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  if (merges.length > 0) ws['!merges'] = merges;
  return ws;
}

/**
 * Xuất bảng điểm ra Excel gồm 5 tab:
 * 1. Bảng điểm (MSSV, Điểm) — gọn để đối chiếu/nhập hệ thống khác.
 * 2. Chi tiết (đầy đủ như trước: mã đề, đúng/sai từng câu theo vị trí phiếu — câu sai tô hồng,
 *    câu bỏ trống tô xám, câu sửa tay tô vàng — kèm cột "Số ô đánh dấu" tô tím, đếm số ô
 *    trong cụm "Chỗ đánh dấu" cạnh marker góc mà giáo viên đã tô trên phiếu).
 * 3. Phổ điểm — tần suất theo khoảng điểm + các chỉ số tổng quan + biểu đồ cột.
 * 4. Độ khó câu hỏi — tỷ lệ trả lời sai theo từng câu hỏi gốc trong ngân hàng câu hỏi.
 * 5. Nghi vấn gian lận — các cặp/nhóm bài trùng đáp án sai vượt ngưỡng, so được xuyên suốt mọi mã
 *    đề (detectCollusion.ts).
 *
 * LƯU Ý: thứ tự tab (sheet1..sheet4) phải khớp đúng thứ tự book_append_sheet bên dưới, vì bước
 * hậu xử lý XML thô (postprocessResultsWorkbook) tham chiếu trực tiếp tới sheet2.xml/sheet3.xml.
 */
export async function exportResultsToXlsxBytes(
  results: GradingResult[],
  answerKeyBundle: AnswerKeyBundle,
  collusionGroups: CollusionGroup[] = [],
): Promise<Uint8Array> {
  const wb = XLSX.utils.book_new();
  const detail = buildDetailSheet(results);
  const distribution = buildDistributionSheet(results);

  XLSX.utils.book_append_sheet(wb, buildSummarySheet(results), 'Bảng điểm'); // sheet1.xml
  XLSX.utils.book_append_sheet(wb, detail.sheet, 'Chi tiết'); // sheet2.xml
  XLSX.utils.book_append_sheet(wb, distribution.sheet, 'Phổ điểm'); // sheet3.xml
  XLSX.utils.book_append_sheet(wb, buildQuestionDifficultySheet(results, answerKeyBundle), 'Độ khó câu hỏi'); // sheet4.xml
  XLSX.utils.book_append_sheet(wb, buildCollusionSheet(collusionGroups), 'Nghi vấn gian lận'); // sheet5.xml

  const baseBytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  return postprocessResultsWorkbook(baseBytes, {
    detailSheetPath: 'xl/worksheets/sheet2.xml',
    detailFills: detail.fills,
    distributionSheetPath: 'xl/worksheets/sheet3.xml',
    distributionChart: distribution.chart,
  });
}
