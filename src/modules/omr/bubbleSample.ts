import {
  mmToPx,
  getMssvBubbleCenterFor,
  getExamCodeBubbleCenterFor,
  getQuestionBubbleCenterFor,
  type QuestionGridLayout,
  type TemplateGeometry,
} from '../pdf-export/bubbleSheetTemplate';
import { letterAt } from '../../lib/optionLetters';
import { decideFromScores } from './decision';
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

export interface AnswerReading {
  position: number;
  letter: AnswerLetter | null;
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
    const decision = decideFromScores(scores);
    readings.push({
      position,
      letter: decision.index === null ? null : letterAt(decision.index),
      ambiguous: decision.ambiguous,
    });
  }
  return readings;
}
