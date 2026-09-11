import {
  mmToPx,
  getMssvBubbleCenterFor,
  getExamCodeBubbleCenterFor,
  getQuestionBubbleCenterFor,
  getOrientationMarksFor,
  type QuestionGridLayout,
  type TemplateGeometry,
} from '../pdf-export/bubbleSheetTemplate';
import { letterAt } from '../../lib/optionLetters';
import { decideFromScores, decideAnswerFromScores } from './decision';
import type { AnswerLetter } from '../../types/answerKey';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CvNamespace = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CvMat = any;

/**
 * Tỉ lệ đường kính vùng lấy mẫu so với đường kính ô tròn in ra — nhỏ hơn 1 để lấy mẫu phần LÕI
 * bên trong, tránh viền in sẵn của ô trống (chưa tô) làm tăng nhiễu độ đen nền.
 */
const SAMPLE_CORE_RATIO = 0.62;

/** Đo tỉ lệ điểm ảnh "có mực" (đã nhị phân hóa, ink=255) trong vùng vuông bao quanh 1 ô tròn. */
export function sampleBubbleDarkness(
  cv: CvNamespace,
  mat: CvMat,
  centerPx: { x: number; y: number },
  diameterPx: number,
): number {
  const sampleSize = diameterPx * SAMPLE_CORE_RATIO;
  const half = sampleSize / 2;
  const x0 = Math.max(0, Math.round(centerPx.x - half));
  const y0 = Math.max(0, Math.round(centerPx.y - half));
  const w = Math.min(mat.cols - x0, Math.round(sampleSize));
  const h = Math.min(mat.rows - y0, Math.round(sampleSize));
  if (w <= 0 || h <= 0) return 0;
  const roi = mat.roi(new cv.Rect(x0, y0, w, h));
  const ratio = cv.countNonZero(roi) / (w * h);
  roi.delete();
  return ratio;
}

export interface DigitsDecoding {
  value: string | null;
  ambiguous: boolean;
}

function decodeDigitGrid(
  cv: CvNamespace,
  mat: CvMat,
  dpi: number,
  digitCount: number,
  bubbleDiameterMm: number,
  getCenterMm: (col: number, digit: number) => { xMm: number; yMm: number },
): DigitsDecoding {
  const digits: (number | null)[] = [];
  let ambiguous = false;
  const diameterPx = mmToPx(bubbleDiameterMm, dpi);

  for (let col = 0; col < digitCount; col++) {
    const scores: number[] = [];
    for (let digit = 0; digit <= 9; digit++) {
      const c = getCenterMm(col, digit);
      scores.push(sampleBubbleDarkness(cv, mat, { x: mmToPx(c.xMm, dpi), y: mmToPx(c.yMm, dpi) }, diameterPx));
    }
    const decision = decideFromScores(scores);
    digits.push(decision.index);
    if (decision.index === null || decision.ambiguous) ambiguous = true;
  }

  const value = digits.every((d) => d !== null) ? digits.join('') : null;
  return { value, ambiguous: ambiguous || value === null };
}

export function decodeMssv(cv: CvNamespace, mat: CvMat, dpi: number, geometry: TemplateGeometry): DigitsDecoding {
  return decodeDigitGrid(cv, mat, dpi, geometry.mssv.digitCount, geometry.mssv.bubbleDiameterMm, (col, digit) =>
    getMssvBubbleCenterFor(geometry, col, digit),
  );
}

export function decodeExamCode(cv: CvNamespace, mat: CvMat, dpi: number, geometry: TemplateGeometry): DigitsDecoding {
  return decodeDigitGrid(
    cv,
    mat,
    dpi,
    geometry.examCode.digitCount,
    geometry.examCode.bubbleDiameterMm,
    (col, digit) => getExamCodeBubbleCenterFor(geometry, col, digit),
  );
}

/** Tỉ lệ mực tối thiểu trong lõi 1 ô định hướng để coi là "đã đánh dấu" — cao hơn hẳn ngưỡng phát
 * hiện đáp án (0.18) vì mục đích chỉ cần phân biệt RÕ RỆT ô trống (giấy trắng, gần 0) với ô đã tô
 * kín/gạch tay (thường phủ phần lớn lõi lấy mẫu), tránh báo nhầm khi ảnh chụp có nhiễu nền cục bộ. */
const ORIENTATION_MARK_FILL_THRESHOLD = 0.4;

export interface OrientationMarksDecoding {
  /** Số ô trong cụm đã được đánh dấu (0..count). */
  markedCount: number;
  /** Trạng thái từng ô, đúng thứ tự getOrientationMarksFor trả về. */
  states: boolean[];
}

/** Đọc cụm ô vuông nhỏ "Chỗ đánh dấu" (nếu geometry này có) — chỉ đếm số ô đã tô, không liên quan
 * tới việc chỉnh phối cảnh (đã dùng ở alignSheet.ts, đây là bước đọc NỘI DUNG sau khi đã warp xong). */
export function decodeOrientationMarks(
  cv: CvNamespace,
  mat: CvMat,
  dpi: number,
  geometry: TemplateGeometry,
): OrientationMarksDecoding {
  const marks = getOrientationMarksFor(geometry);
  const sizePx = mmToPx(geometry.orientationMarks?.sizeMm ?? 0, dpi);
  const states = marks.map((mark) => {
    const centerPx = {
      x: mmToPx(mark.topLeft.xMm + mark.sizeMm / 2, dpi),
      y: mmToPx(mark.topLeft.yMm + mark.sizeMm / 2, dpi),
    };
    return sampleBubbleDarkness(cv, mat, centerPx, sizePx) >= ORIENTATION_MARK_FILL_THRESHOLD;
  });
  return { markedCount: states.filter(Boolean).length, states };
}

export interface AnswerReading {
  position: number;
  /** Mọi chữ cái đã tô cho câu này — rỗng nếu bỏ trống, >1 phần tử nếu tô nhiều hơn 1 ô. */
  letters: AnswerLetter[];
  ambiguous: boolean;
}

export function decodeAnswers(
  cv: CvNamespace,
  mat: CvMat,
  dpi: number,
  totalQuestions: number,
  layout: QuestionGridLayout,
  geometry: TemplateGeometry,
): AnswerReading[] {
  const diameterPx = mmToPx(geometry.question.bubbleDiameterMm, dpi);
  const readings: AnswerReading[] = [];
  for (let position = 1; position <= totalQuestions; position++) {
    const scores: number[] = [];
    for (let optionIndex = 0; optionIndex < layout.maxOptions; optionIndex++) {
      const c = getQuestionBubbleCenterFor(geometry, layout, position, optionIndex);
      scores.push(sampleBubbleDarkness(cv, mat, { x: mmToPx(c.xMm, dpi), y: mmToPx(c.yMm, dpi) }, diameterPx));
    }
    const decision = decideAnswerFromScores(scores);
    readings.push({
      position,
      letters: decision.indices.map((i) => letterAt(i)),
      ambiguous: decision.ambiguous,
    });
  }
  return readings;
}
