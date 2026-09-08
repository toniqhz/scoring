export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  originalIndex: number;
  text: string;
  options: QuestionOption[];
  correctOptionId: string | null;
  parseIssues: string[];
}

/** Câu hỏi khi in ra đề thi — KHÔNG được chứa đáp án đúng. */
export interface PrintableQuestion {
  text: string;
  options: { letter: 'A' | 'B' | 'C' | 'D'; text: string }[];
}
