import type { AnswerLetter } from '../../types/answerKey';

export interface OmrTaskMessage {
  taskId: string;
  bitmap: ImageBitmap;
  totalQuestions: number;
  /** Số đáp án lớn nhất trong đề — quyết định số cột bubble/câu khi lấy mẫu. */
  maxOptions: number;
  /** Version layout lúc phiếu này được in ra (AnswerKeyBundle.templateVersion) — quyết định bộ tọa độ dùng để đọc. */
  templateVersion?: number | null;
}

export interface OmrAnswerReading {
  position: number;
  /** Mọi chữ cái đã tô cho câu này — rỗng nếu bỏ trống, >1 phần tử nếu tô nhiều hơn 1 ô. */
  letters: AnswerLetter[];
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
  /** Số ô trong cụm "Chỗ đánh dấu" đã được tô (0 nếu version phiếu không có cụm ô định hướng). */
  markedCount: number;
}
