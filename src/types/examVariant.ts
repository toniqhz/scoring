export interface ExamVariant {
  examCode: string;
  variantIndex: number;
  questionOrder: string[];
  optionOrderByQuestion: Record<string, string[]>;
  /**
   * Với các câu có đáp án nhắc tới chữ cái đáp án khác (vd "Cả A và B đều đúng") và được chọn xử lý
   * bằng cách "vẫn xáo + tự cập nhật chữ cái" (thay vì giữ nguyên thứ tự) — map chữ cái CŨ (trước
   * khi xáo) sang chữ cái MỚI (sau khi xáo) của câu đó, để generateExamDocx.ts tự sửa lại đúng chữ
   * cái được nhắc tới ngay trong file .docx đề thi in ra. Key = questionId. Chỉ có mặt cho câu cần
   * sửa; câu bình thường hoặc câu chọn "giữ nguyên thứ tự" thì không có entry.
   */
  optionLetterRewrites?: Record<string, Record<string, string>>;
  createdAt: string;
}
