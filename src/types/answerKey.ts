/** Chữ cái đáp án — không giới hạn A-D, mỗi câu có thể có số đáp án khác nhau (A, A-B, A-B-C-D-E...). */
export type AnswerLetter = string;

export interface AnswerKeyAnswer {
  position: number;
  correctLetter: AnswerLetter;
  originalQuestionId: string;
  originalQuestionIndex: number;
  /** Optional — thiếu khi đọc file dap-an.json cũ sinh ra trước khi có 2 trường này. */
  questionText?: string;
  correctOptionText?: string;
}

export interface AnswerKeyVariant {
  examCode: string;
  answers: AnswerKeyAnswer[];
}

export interface AnswerKeyBundle {
  schemaVersion: 1;
  examTitle: string;
  createdAt: string;
  totalQuestions: number;
  /** Số đáp án LỚN NHẤT trong số các câu hỏi — quyết định số cột (A, B, C...) trên phiếu trả lời. */
  maxOptionsPerQuestion: number;
  /**
   * Version layout phiếu trả lời (bubbleSheetTemplate.ts) lúc bộ đề này được sinh ra — dùng để
   * chấm đúng tọa độ ô tô ngay cả khi code layout đã đổi sau này (xem "VERSIONING" trong
   * bubbleSheetTemplate.ts). Optional vì file dap-an.json cũ (trước khi có trường này) không có —
   * khi đó getTemplateGeometry() sẽ mặc định về version hiện tại.
   */
  templateVersion?: number;
  variants: AnswerKeyVariant[];
}
