export interface QuestionOption {
  id: string;
  text: string;
  /** true nếu giáo viên đã sửa tay nội dung đáp án này (khác với nội dung đọc được từ file gốc). */
  edited?: boolean;
  /**
   * Chữ cái (A, B, C...) của đáp án này trong file .docx GỐC lúc parse — dùng để đối chiếu đúng
   * đoạn XML gốc khi xuất đề in ra, KHÔNG PHỤ THUỘC vị trí hiện tại trong mảng `options` (vị trí có
   * thể đổi nếu giáo viên xóa/thêm đáp án trên web). undefined nếu đáp án này được thêm mới trên
   * web, không có trong file gốc (khi in sẽ tự dựng đoạn văn bản thuần thay vì dùng run XML gốc).
   */
  sourceLetter?: string;
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
