// Chấp nhận "Câu 1:", "Câu 1.", "Câu 1" (không dấu câu) hoặc chỉ số trần "1." / "1)".
// Với dạng số trần, BẮT BUỘC có dấu câu theo sau để tránh nhận nhầm số đầu câu (vd "10 người...").
export const QUESTION_RE = /^(?:C[aâ]u\s*\d+\s*[.):]?|\d+\s*[.):])\s*/iu;
// Không giới hạn số đáp án — chấp nhận toàn bộ A-Z (thực tế hiếm khi vượt quá vài chữ cái).
export const OPTION_RE = /^([A-Z])\s*[.):]\s*(.*)$/u;
export const MIN_OPTIONS = 2;
