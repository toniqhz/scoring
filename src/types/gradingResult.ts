import type { AnswerLetter } from './answerKey';

export interface QuestionResult {
  position: number;
  /** Mọi chữ cái đã tô cho câu này — rỗng nếu bỏ trống. Tô >1 ô vẫn được lưu lại đủ, nhưng luôn tính sai. */
  detectedLetters: AnswerLetter[];
  correctLetter: AnswerLetter;
  isCorrect: boolean;
  ambiguous: boolean;
  /** true nếu đáp án câu này do giáo viên tự chọn tay (không phải máy đọc) — dùng để tô vàng khi xuất Excel. */
  manuallyEdited?: boolean;
}

/** Đáp án thô đọc được từ ảnh, độc lập với mã đề (dùng để chấm lại tay khi giáo viên chỉnh mã đề/câu trả lời). */
export interface RawAnswerReading {
  position: number;
  letters: AnswerLetter[];
  ambiguous: boolean;
}

export interface GradingFlags {
  alignmentFailed: boolean;
  examCodeNotFound: boolean;
  examCodeAmbiguous: boolean;
  mssvNotFound: boolean;
  mssvAmbiguous: boolean;
  lowConfidenceCount: number;
}

export interface GradingResult {
  sheetId: string;
  fileName: string;
  /** Ảnh bài scan (object URL) để giáo viên mở xem lại — null nếu không tạo được ảnh xem lại. */
  previewUrl: string | null;
  mssv: string | null;
  hoTen: string | null;
  examCode: string | null;
  score: number | null;
  correctCount: number;
  totalQuestions: number;
  questionResults: QuestionResult[];
  /** Đáp án thô theo vị trí, giữ lại để chấm lại khi giáo viên sửa tay (đổi mã đề/chọn lại đáp án). */
  rawAnswers: RawAnswerReading[];
  flags: GradingFlags;
  needsManualReview: boolean;
  /** true nếu giáo viên đã xác nhận/chỉnh tay ít nhất 1 lần. */
  manuallyReviewed?: boolean;
  processError?: string;
}
