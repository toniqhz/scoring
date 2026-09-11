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
  /**
   * Với MỖI chữ cái đáp án của câu này (không chỉ đáp án đúng) — chỉ số của đáp án đó trong danh
   * sách đáp án GỐC (trước khi xáo trộn theo mã đề) của câu hỏi. Dùng để so sánh 2 bài chọn "cùng 1
   * đáp án sai" xuyên suốt các mã đề KHÁC NHAU (đề bị xáo khác nhau nên cùng chữ cái ở 2 mã đề không
   * cùng nghĩa — phải quy về chỉ số đáp án GỐC mới so được, xem detectCollusion.ts). Optional — thiếu
   * khi đọc file dap-an.json cũ sinh ra trước khi có trường này (khi đó chỉ so được trong cùng mã đề).
   */
  optionOriginalIndexByLetter?: Record<AnswerLetter, number>;
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
