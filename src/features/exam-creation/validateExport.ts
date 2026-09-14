import type { Question } from '../../types/question';

/**
 * Kiểm tra các lỗi nghiêm trọng trước khi xuất bộ đề — nếu có bất kỳ lỗi nào ở đây, KHÔNG được xuất
 * file (xem ExamCreationPage.tsx: chặn hẳn nút "Tạo bộ đề" thay vì chỉ cảnh báo), vì đề sinh ra có
 * thể sai/thiếu đáp án hoặc gây nhầm lẫn cho sinh viên. Khác với `parseIssues` (đã có sẵn, hiện theo
 * từng câu trong bước "Kiểm tra câu hỏi"): các kiểm tra ở đây tổng hợp lại + bổ sung 2 loại lỗi mới
 * (trùng nội dung câu hỏi, trùng đáp án trong cùng 1 câu) mà bước parse ban đầu không phát hiện.
 */

export interface ExportValidationResult {
  /** Các dòng cảnh báo hiển thị trong banner đỏ. */
  messages: string[];
  /** Vị trí (1-based, khớp với "Câu N" hiển thị ở QuestionReviewList) của mọi câu dính lỗi — dùng
   * để khoanh viền đỏ câu đó trong danh sách, giúp giáo viên tìm nhanh hơn thay vì phải đọc hết
   * banner rồi tự đếm. */
  errorPositions: Set<number>;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function validateExport(questions: Question[]): ExportValidationResult {
  const messages: string[] = [];
  const errorPositions = new Set<number>();
  const markError = (pos: number) => errorPositions.add(pos);

  // 1) Thiếu đáp án đúng (chưa xác định đáp án nào đúng cho câu hỏi này).
  const missingCorrect = questions
    .map((q, i) => ({ q, num: i + 1 }))
    .filter(({ q }) => !q.correctOptionId);
  if (missingCorrect.length > 0) {
    missingCorrect.forEach((x) => markError(x.num));
    messages.push(
      `${missingCorrect.length} câu chưa xác định đáp án đúng: Câu ${missingCorrect.map((x) => x.num).join(', ')}.`,
    );
  }

  // 2) Thiếu đáp án theo đúng thứ tự chữ cái (vd có A, B, D nhưng thiếu C) — đã phát hiện sẵn lúc
  // parse (questionSegmenter.ts), ở đây chỉ tổng hợp lại các câu còn issue này.
  const missingOptionLetter = questions
    .map((q, i) => ({ q, num: i + 1 }))
    .filter(({ q }) => q.parseIssues.some((issue) => issue.startsWith('Thiếu đáp án ')));
  if (missingOptionLetter.length > 0) {
    missingOptionLetter.forEach((x) => markError(x.num));
    messages.push(
      `${missingOptionLetter.length} câu thiếu đáp án theo đúng thứ tự chữ cái (vd có A, B, D nhưng thiếu C): Câu ${missingOptionLetter
        .map((x) => x.num)
        .join(', ')}.`,
    );
  }

  // 3) Nhảy số thứ tự câu hỏi TRONG CHÍNH VĂN BẢN GỐC (vd "Câu 1", "Câu 2", "Câu 5" — thiếu câu 3, 4)
  // — khác với (2), đây là số ghi trong file .docx gốc, không phải vị trí trong danh sách đã đọc.
  const numbered = questions
    .map((q, i) => ({ pos: i + 1, declared: q.declaredNumber }))
    .filter((x): x is { pos: number; declared: number } => x.declared !== null);
  const gaps: string[] = [];
  for (let i = 1; i < numbered.length; i++) {
    const prev = numbered[i - 1];
    const cur = numbered[i];
    if (cur.declared - prev.declared > 1) {
      const missing = Array.from({ length: cur.declared - prev.declared - 1 }, (_, k) => prev.declared + 1 + k);
      gaps.push(`${prev.declared} → ${cur.declared} (thiếu câu ${missing.join(', ')})`);
      markError(prev.pos);
      markError(cur.pos);
    }
  }
  if (gaps.length > 0) {
    messages.push(`Phát hiện nhảy số thứ tự câu hỏi trong file gốc: ${gaps.join('; ')}.`);
  }

  // 4) Câu hỏi bị trùng nội dung với nhau.
  const textGroups = new Map<string, number[]>();
  questions.forEach((q, i) => {
    const key = normalize(q.text);
    if (!key) return;
    if (!textGroups.has(key)) textGroups.set(key, []);
    textGroups.get(key)!.push(i + 1);
  });
  const dupQuestionGroups = Array.from(textGroups.values()).filter((nums) => nums.length > 1);
  if (dupQuestionGroups.length > 0) {
    dupQuestionGroups.forEach((nums) => nums.forEach(markError));
    messages.push(
      `Phát hiện ${dupQuestionGroups.length} nhóm câu hỏi bị trùng nội dung: ${dupQuestionGroups
        .map((nums) => `Câu ${nums.join(' & ')}`)
        .join('; ')}.`,
    );
  }

  // 5) Đáp án bị trùng nội dung với nhau trong CÙNG 1 câu hỏi.
  const dupOptionQuestions: number[] = [];
  questions.forEach((q, i) => {
    const seen = new Set<string>();
    let hasDup = false;
    for (const opt of q.options) {
      const key = normalize(opt.text);
      if (!key) continue;
      if (seen.has(key)) hasDup = true;
      seen.add(key);
    }
    if (hasDup) dupOptionQuestions.push(i + 1);
  });
  if (dupOptionQuestions.length > 0) {
    dupOptionQuestions.forEach(markError);
    messages.push(
      `${dupOptionQuestions.length} câu có 2 đáp án trở lên bị trùng nội dung với nhau: Câu ${dupOptionQuestions.join(', ')}.`,
    );
  }

  return { messages, errorPositions };
}
