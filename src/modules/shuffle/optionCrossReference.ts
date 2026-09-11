import type { QuestionOption } from '../../types/question';

/**
 * Phát hiện đáp án có NHẮC TỚI chữ cái đáp án khác ngay trong nội dung của nó (vd "Cả A và B đều
 * đúng", "A, B và C đều sai", "Chỉ có đáp án A đúng") — nếu xáo thứ tự đáp án, các chữ cái được
 * nhắc tới không còn trỏ đúng đáp án nào nữa (sau khi xáo, "A" có thể là 1 đáp án hoàn toàn khác).
 *
 * Đây là suy đoán dựa trên mẫu câu thường gặp, KHÔNG bắt mọi chữ cái viết hoa đơn lẻ nói chung — vì
 * nhiều câu (đặc biệt sinh học/di truyền) dùng chữ cái đơn lẻ cho mục đích khác không liên quan gì
 * tới việc tham chiếu đáp án (vd "nhóm máu A", "alen A", "gen B") — nếu bắt mọi chữ hoa đơn lẻ sẽ
 * khóa/sửa nhầm rất nhiều câu không cần thiết. Chỉ bắt các mẫu có TỪ NỐI ("và"/"hoặc") giữa 2 chữ
 * cái, hoặc từ "chỉ" đứng trước 1 chữ cái — các mẫu này gần như chắc chắn đang nói tới đáp án khác
 * trong cùng câu.
 *
 * 2 cách xử lý câu bị phát hiện (giáo viên chọn ở ExamCreationPage, xem generateVariants.ts):
 *   - "lock": giữ nguyên thứ tự đáp án gốc cho câu đó (an toàn tuyệt đối, không cần sửa gì thêm).
 *   - "rewrite": vẫn xáo đáp án như bình thường, rồi TỰ THAY chữ cái được nhắc tới bằng chữ cái MỚI
 *     tương ứng sau khi xáo — chỉ thay các chữ cái nằm trong đúng phần văn bản đã khớp mẫu (không
 *     thay chữ cái nào khác trong câu), nhưng quy tắc nhận diện không thể bắt hết MỌI cách diễn đạt
 *     có thể có nên vẫn cần giáo viên tự mở lại đề đã tạo để kiểm tra trước khi in.
 */
// 1 chữ cái tham chiếu, CÓ THỂ được bọc trong ngoặc đơn (vd "(A)" — cách viết khá phổ biến trong
// các đáp án kiểu "(A), (B) và (C)") — mỗi dấu ngoặc là optional ĐỘC LẬP, không cần cân bằng.
const LETTER_TOKEN = '\\(?\\b[A-E]\\b\\)?';
const REWRITE_SCAN_PATTERNS: RegExp[] = [
  // "A và B", "A, B và C", "A hoặc B", "(A), (B) và (C)", "Cả A và B đều đúng"...
  new RegExp(`${LETTER_TOKEN}(?:\\s*,\\s*${LETTER_TOKEN})*\\s*(?:và|hoặc)\\s*${LETTER_TOKEN}`, 'g'),
  // "Chỉ A đúng", "Chỉ có đáp án A", "Chỉ phương án B là đúng", "Chỉ (A) đúng"...
  new RegExp(`chỉ\\s+(?:có\\s+)?(?:đáp\\s*án\\s+|phương\\s*án\\s+)?${LETTER_TOKEN}`, 'gi'),
];

function textReferencesOtherLetter(text: string): boolean {
  return REWRITE_SCAN_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/** true nếu BẤT KỲ đáp án nào của câu hỏi này nhắc tới chữ cái đáp án khác trong nội dung — dùng để
 * quyết định GIỮ NGUYÊN thứ tự đáp án khi trộn đề, hoặc để biết câu nào cần chạy qua bước tự cập
 * nhật chữ cái (xem generateVariants.ts). */
export function questionHasOptionCrossReference(options: Pick<QuestionOption, 'text'>[]): boolean {
  return options.some((o) => textReferencesOtherLetter(o.text));
}

/** true nếu RIÊNG đáp án này nhắc tới chữ cái đáp án khác (đáp án "ghép", vd "Cả A và B đều đúng") —
 * false = đáp án "đơn" (không nhắc tới đáp án nào khác). Dùng cho chiến lược "partition" (xem
 * generateVariants.ts): tách riêng 2 nhóm để xáo, đáp án đơn lên đầu, đáp án ghép xuống cuối. */
export function optionReferencesOtherLetter(option: Pick<QuestionOption, 'text'>): boolean {
  return textReferencesOtherLetter(option.text);
}

export interface LetterReplacement {
  /** Vị trí ký tự (0-based, tính trên chuỗi text gốc) cần thay. */
  index: number;
  oldLetter: string;
  newLetter: string;
}

/**
 * Tìm mọi vị trí chữ cái cần thay trong `text` theo `letterMap` (chữ cũ -> chữ mới sau khi xáo) —
 * CHỈ trong phạm vi các đoạn đã khớp mẫu tham chiếu (REWRITE_SCAN_PATTERNS), không quét/thay bừa
 * mọi chữ cái đơn lẻ trong toàn bộ text.
 */
export function findLetterReplacements(text: string, letterMap: Record<string, string>): LetterReplacement[] {
  const replacements: LetterReplacement[] = [];
  for (const pattern of REWRITE_SCAN_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text))) {
      const span = m[0];
      const spanStart = m.index;
      const letterRe = /[A-E]/g;
      let lm: RegExpExecArray | null;
      while ((lm = letterRe.exec(span))) {
        const oldLetter = lm[0];
        const newLetter = letterMap[oldLetter];
        if (newLetter && newLetter !== oldLetter) {
          replacements.push({ index: spanStart + lm.index, oldLetter, newLetter });
        }
      }
      if (m[0].length === 0) pattern.lastIndex++; // an toàn, tránh vòng lặp vô hạn với match rỗng
    }
  }
  replacements.sort((a, b) => a.index - b.index);
  return replacements;
}

/** Áp dụng danh sách thay thế (từ findLetterReplacements) vào 1 chuỗi text thuần. */
export function applyLetterReplacementsToText(text: string, replacements: LetterReplacement[]): string {
  if (replacements.length === 0) return text;
  let result = '';
  let cursor = 0;
  for (const r of replacements) {
    result += text.slice(cursor, r.index) + r.newLetter;
    cursor = r.index + 1;
  }
  result += text.slice(cursor);
  return result;
}

/** Đổi toàn bộ chữ cái tham chiếu trong 1 chuỗi text theo letterMap — tiện dùng khi không cần giữ
 * lại danh sách vị trí đã thay (vd cho các trường text thuần trong AnswerKeyBundle). */
export function rewriteOptionTextReferences(text: string, letterMap: Record<string, string>): string {
  return applyLetterReplacementsToText(text, findLetterReplacements(text, letterMap));
}
