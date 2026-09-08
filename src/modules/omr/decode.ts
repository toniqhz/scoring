import { alignAndThreshold } from './alignSheet';
import { decodeMssv, decodeExamCode, decodeAnswers } from './bubbleSample';
import { PAGE_WIDTH_MM, PAGE_HEIGHT_MM, mmToPx } from '../pdf-export/bubbleSheetTemplate';
import type { OmrAnswerReading } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CvNamespace = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CvMat = any;

/** DPI xử lý nội bộ cho OMR — thấp hơn DPI in (300) để xử lý nhanh, vẫn đủ để phân biệt ô tô/không tô. */
export const PROCESS_DPI = 150;

export interface DecodeSheetResult {
  alignmentFailed: boolean;
  mssv: string | null;
  mssvAmbiguous: boolean;
  examCode: string | null;
  examCodeAmbiguous: boolean;
  answers: OmrAnswerReading[];
}

/** Giải mã 1 ảnh phiếu trả lời đã scan/chụp: căn chỉnh phối cảnh rồi đọc từng ô tròn. */
export function decodeSheet(cv: CvNamespace, srcMat: CvMat, totalQuestions: number): DecodeSheetResult {
  const canonicalWidthPx = Math.round(mmToPx(PAGE_WIDTH_MM, PROCESS_DPI));
  const canonicalHeightPx = Math.round(mmToPx(PAGE_HEIGHT_MM, PROCESS_DPI));
  const { warped, ok } = alignAndThreshold(cv, srcMat, canonicalWidthPx, canonicalHeightPx, PROCESS_DPI);

  if (!ok || !warped) {
    return {
      alignmentFailed: true,
      mssv: null,
      mssvAmbiguous: true,
      examCode: null,
      examCodeAmbiguous: true,
      answers: [],
    };
  }

  try {
    const mssvDecoding = decodeMssv(cv, warped, PROCESS_DPI);
    const examCodeDecoding = decodeExamCode(cv, warped, PROCESS_DPI);
    const answers = decodeAnswers(cv, warped, PROCESS_DPI, totalQuestions);
    return {
      alignmentFailed: false,
      mssv: mssvDecoding.value,
      mssvAmbiguous: mssvDecoding.ambiguous,
      examCode: examCodeDecoding.value,
      examCodeAmbiguous: examCodeDecoding.ambiguous,
      answers,
    };
  } finally {
    warped.delete();
  }
}
