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
