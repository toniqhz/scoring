import type { AnswerLetter } from './answerKey';

export interface QuestionResult {
  position: number;
  detectedLetter: AnswerLetter | null;
  correctLetter: AnswerLetter;
  isCorrect: boolean;
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
  mssv: string | null;
  hoTen: string | null;
  examCode: string | null;
  score: number | null;
  correctCount: number;
  totalQuestions: number;
  questionResults: QuestionResult[];
  flags: GradingFlags;
  needsManualReview: boolean;
  processError?: string;
}
