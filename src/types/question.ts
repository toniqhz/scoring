export interface QuestionOption {
  id: string;
  text: string;
  /** true nếu giáo viên đã sửa tay nội dung đáp án này (khác với nội dung đọc được từ file gốc). */
  edited?: boolean;
}

export interface Question {
  id: string;
  originalIndex: number;
  text: string;
  options: QuestionOption[];
  correctOptionId: string | null;
  parseIssues: string[];
  /** true nếu giáo viên đã sửa tay nội dung câu hỏi này (khác với nội dung đọc được từ file gốc). */
  stemEdited?: boolean;
}
