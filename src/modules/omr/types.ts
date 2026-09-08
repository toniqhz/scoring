import type { AnswerLetter } from '../../types/answerKey';

export interface OmrTaskMessage {
  taskId: string;
  bitmap: ImageBitmap;
  totalQuestions: number;
}

export interface OmrAnswerReading {
  position: number;
  letter: AnswerLetter | null;
  ambiguous: boolean;
}

export interface OmrResultMessage {
  taskId: string;
  ok: boolean;
  error?: string;
  alignmentFailed: boolean;
  mssv: string | null;
  mssvAmbiguous: boolean;
  examCode: string | null;
  examCodeAmbiguous: boolean;
  answers: OmrAnswerReading[];
}
