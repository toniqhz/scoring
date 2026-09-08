/**
 * NGUỒN DUY NHẤT định nghĩa hình học của phiếu trả lời trắc nghiệm.
 * Cả bubbleSheetPdf.ts (sinh PDF để in) và pipeline OMR (đọc ảnh scan) đều PHẢI
 * import các hằng số/hàm từ file này — không hard-code tọa độ ở nơi khác.
 *
 * Hệ tọa độ mm dùng ở đây: gốc (0,0) ở góc TRÊN-TRÁI trang, trục y hướng XUỐNG
 * (giống tọa độ điểm ảnh của ảnh scan) để khớp trực tiếp với pipeline OMR sau này.
 * pdf-lib dùng gốc dưới-trái, trục y hướng lên — dùng topDownMmToPdfPt() để quy đổi.
 */

export const PAGE_WIDTH_MM = 210; // A4
export const PAGE_HEIGHT_MM = 297;

/** Độ phân giải chuẩn hóa cho ảnh scan sau khi đã warp về đúng khung mẫu. */
export const TEMPLATE_DPI = 300;

export interface PointMm {
  xMm: number;
  yMm: number;
}

// ---- Quy đổi đơn vị ----

export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

export function mmToPx(mm: number, dpi: number = TEMPLATE_DPI): number {
  return (mm * dpi) / 25.4;
}

/** Quy đổi 1 điểm trong hệ tọa độ mẫu (top-down, mm) sang hệ tọa độ pdf-lib (bottom-up, pt). */
export function topDownMmToPdfPt(p: PointMm): { x: number; y: number } {
  return { x: mmToPt(p.xMm), y: mmToPt(PAGE_HEIGHT_MM - p.yMm) };
}

// ---- Marker góc (dùng để chỉnh phối cảnh ảnh scan) ----

export const MARKER_SIZE_MM = 10;
export const MARKER_MARGIN_MM = 8;

export type MarkerId = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface MarkerSpec {
  id: MarkerId;
  sizeMm: number;
  /** Góc trên-trái của ô vuông marker (không phải tâm) — tiện cho vẽ hình chữ nhật. */
  topLeft: PointMm;
}

const markerHalf = MARKER_SIZE_MM;

export const CORNER_MARKERS: MarkerSpec[] = [
  { id: 'top-left', sizeMm: MARKER_SIZE_MM, topLeft: { xMm: MARKER_MARGIN_MM, yMm: MARKER_MARGIN_MM } },
  {
    id: 'top-right',
    sizeMm: MARKER_SIZE_MM,
    topLeft: { xMm: PAGE_WIDTH_MM - MARKER_MARGIN_MM - markerHalf, yMm: MARKER_MARGIN_MM },
  },
  {
    id: 'bottom-left',
    sizeMm: MARKER_SIZE_MM,
    topLeft: { xMm: MARKER_MARGIN_MM, yMm: PAGE_HEIGHT_MM - MARKER_MARGIN_MM - markerHalf },
  },
  {
    id: 'bottom-right',
    sizeMm: MARKER_SIZE_MM,
    topLeft: {
      xMm: PAGE_WIDTH_MM - MARKER_MARGIN_MM - markerHalf,
      yMm: PAGE_HEIGHT_MM - MARKER_MARGIN_MM - markerHalf,
    },
  },
];

// ---- Lưới Số báo danh / MSSV (8 chữ số, sinh viên tự tô) ----

export const MSSV_DIGIT_COUNT = 8;
export const MSSV_BUBBLE_DIAMETER_MM = 4;
export const MSSV_GRID_ORIGIN: PointMm = { xMm: 34, yMm: 62 };
export const MSSV_COL_PITCH_MM = 7;
export const MSSV_ROW_PITCH_MM = 6;
export const MSSV_LABEL_OFFSET_MM = 8;

export function getMssvBubbleCenter(colIndex: number, digit: number): PointMm {
  return {
    xMm: MSSV_GRID_ORIGIN.xMm + colIndex * MSSV_COL_PITCH_MM,
    yMm: MSSV_GRID_ORIGIN.yMm + digit * MSSV_ROW_PITCH_MM,
  };
}

// ---- Lưới Mã đề (3 chữ số, TÔ SẴN khi sinh PDF vì mã đề đã biết trước) ----

export const EXAM_CODE_DIGIT_COUNT = 3;
export const EXAM_CODE_BUBBLE_DIAMETER_MM = 4;
export const EXAM_CODE_GRID_ORIGIN: PointMm = { xMm: 120, yMm: 62 };
export const EXAM_CODE_COL_PITCH_MM = 7;
export const EXAM_CODE_ROW_PITCH_MM = 6;
export const EXAM_CODE_LABEL_OFFSET_MM = 8;

export function getExamCodeBubbleCenter(colIndex: number, digit: number): PointMm {
  return {
    xMm: EXAM_CODE_GRID_ORIGIN.xMm + colIndex * EXAM_CODE_COL_PITCH_MM,
    yMm: EXAM_CODE_GRID_ORIGIN.yMm + digit * EXAM_CODE_ROW_PITCH_MM,
  };
}

// ---- Lưới câu hỏi PHẦN I (A/B/C/D), nhiều cột con 10 câu/cột ----

export const QUESTION_GRID_ORIGIN: PointMm = { xMm: 15, yMm: 145 };
export const SUBCOLUMN_COUNT = 5;
export const QUESTIONS_PER_SUBCOLUMN = 10;
export const MAX_QUESTIONS_PER_PAGE = SUBCOLUMN_COUNT * QUESTIONS_PER_SUBCOLUMN; // 50
export const SUBCOLUMN_PITCH_MM = 38;
export const QUESTION_ROW_PITCH_MM = 7;
export const QUESTION_LABEL_WIDTH_MM = 10;
export const QUESTION_OPTION_PITCH_MM = 8;
export const QUESTION_BUBBLE_DIAMETER_MM = 4.5;

export const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

/** position: số thứ tự câu hỏi trên phiếu, 1-based (1..50). optionIndex: 0=A,1=B,2=C,3=D. */
export function getQuestionBubbleCenter(position: number, optionIndex: number): PointMm {
  const zeroBased = position - 1;
  const subCol = Math.floor(zeroBased / QUESTIONS_PER_SUBCOLUMN);
  const rowInSubCol = zeroBased % QUESTIONS_PER_SUBCOLUMN;
  return {
    xMm:
      QUESTION_GRID_ORIGIN.xMm +
      subCol * SUBCOLUMN_PITCH_MM +
      QUESTION_LABEL_WIDTH_MM +
      optionIndex * QUESTION_OPTION_PITCH_MM,
    yMm: QUESTION_GRID_ORIGIN.yMm + rowInSubCol * QUESTION_ROW_PITCH_MM,
  };
}

export function getQuestionLabelPosition(position: number): PointMm {
  const zeroBased = position - 1;
  const subCol = Math.floor(zeroBased / QUESTIONS_PER_SUBCOLUMN);
  const rowInSubCol = zeroBased % QUESTIONS_PER_SUBCOLUMN;
  return {
    xMm: QUESTION_GRID_ORIGIN.xMm + subCol * SUBCOLUMN_PITCH_MM,
    yMm: QUESTION_GRID_ORIGIN.yMm + rowInSubCol * QUESTION_ROW_PITCH_MM,
  };
}
