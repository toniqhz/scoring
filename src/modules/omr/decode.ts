import { alignAndThreshold } from './alignSheet';
import { decodeMssv, decodeExamCode, decodeAnswers } from './bubbleSample';
import { mmToPx, buildQuestionGridLayoutFor, getTemplateGeometry } from '../pdf-export/bubbleSheetTemplate';
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

/**
 * Giải mã 1 ảnh phiếu trả lời đã scan/chụp: căn chỉnh phối cảnh rồi đọc từng ô tròn.
 * `templateVersion` PHẢI lấy từ chính AnswerKeyBundle.templateVersion đi kèm lô bài đang chấm —
 * đây là version layout lúc phiếu này được IN RA, có thể khác version hiện tại của code.
 */
export function decodeSheet(
  cv: CvNamespace,
  srcMat: CvMat,
  totalQuestions: number,
  maxOptions: number,
  templateVersion?: number | null,
): DecodeSheetResult {
  const geometry = getTemplateGeometry(templateVersion);
  const canonicalWidthPx = Math.round(mmToPx(geometry.pageWidthMm, PROCESS_DPI));
  const canonicalHeightPx = Math.round(mmToPx(geometry.pageHeightMm, PROCESS_DPI));
  const { warped, ok } = alignAndThreshold(cv, srcMat, canonicalWidthPx, canonicalHeightPx, PROCESS_DPI, geometry);

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
    const layout = buildQuestionGridLayoutFor(geometry, maxOptions, totalQuestions);
    const mssvDecoding = decodeMssv(cv, warped, PROCESS_DPI, geometry);
    const examCodeDecoding = decodeExamCode(cv, warped, PROCESS_DPI, geometry);
    const answers = decodeAnswers(cv, warped, PROCESS_DPI, totalQuestions, layout, geometry);
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
