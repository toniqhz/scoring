export type AnswerLetter = 'A' | 'B' | 'C' | 'D';

export interface AnswerKeyAnswer {
  position: number;
  correctLetter: AnswerLetter;
  originalQuestionId: string;
  originalQuestionIndex: number;
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
  variants: AnswerKeyVariant[];
}
