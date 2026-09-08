export interface ExamVariant {
  examCode: string;
  variantIndex: number;
  questionOrder: string[];
  optionOrderByQuestion: Record<string, string[]>;
  createdAt: string;
}
