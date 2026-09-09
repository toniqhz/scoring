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
export const MSSV_GRID_ORIGIN: PointMm = { xMm: 34, yMm: 70 };
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
export const EXAM_CODE_GRID_ORIGIN: PointMm = { xMm: 120, yMm: 70 };
export const EXAM_CODE_COL_PITCH_MM = 7;
export const EXAM_CODE_ROW_PITCH_MM = 6;
export const EXAM_CODE_LABEL_OFFSET_MM = 8;

export function getExamCodeBubbleCenter(colIndex: number, digit: number): PointMm {
  return {
    xMm: EXAM_CODE_GRID_ORIGIN.xMm + colIndex * EXAM_CODE_COL_PITCH_MM,
    yMm: EXAM_CODE_GRID_ORIGIN.yMm + digit * EXAM_CODE_ROW_PITCH_MM,
  };
}

// ---- Lưới câu hỏi PHẦN I — số cột đáp án (A, B, C...) KHÔNG cố định, phụ thuộc số đáp án
// lớn nhất trong ngân hàng câu hỏi của đề đang tạo. Vì vậy layout được TÍNH ĐỘNG thay vì hằng
// số cố định — cả PDF (bubbleSheetPdf.ts) và OMR (bubbleSample.ts) đều dùng chung layout này
// để đảm bảo tọa độ khớp nhau tuyệt đối.

export const QUESTION_GRID_ORIGIN: PointMm = { xMm: 15, yMm: 153 };
export const QUESTIONS_PER_SUBCOLUMN = 10;
export const QUESTION_ROW_PITCH_MM = 7;
export const QUESTION_LABEL_WIDTH_MM = 10;
export const QUESTION_OPTION_PITCH_MM = 8;
export const QUESTION_BUBBLE_DIAMETER_MM = 4.5;
/** Chiều rộng khả dụng cho lưới câu hỏi, tính từ QUESTION_GRID_ORIGIN.xMm, chừa lề phải an toàn. */
const QUESTION_GRID_USABLE_WIDTH_MM = 190;
/** Số đáp án tối thiểu phải chừa chỗ, kể cả khi ngân hàng câu hỏi chỉ có 2 đáp án/câu. */
const MIN_LAYOUT_OPTIONS = 2;

export interface QuestionGridLayout {
  maxOptions: number;
  subcolumnCount: number;
  questionsPerSubcolumn: number;
  maxQuestionsPerPage: number;
  subcolumnPitchMm: number;
}

/**
 * Tính layout lưới câu hỏi theo số đáp án lớn nhất (maxOptions) của đề. Số đáp án càng nhiều
 * thì mỗi cột con càng rộng, nên số cột con vừa trên 1 trang càng ít — đánh đổi vật lý khi in.
 *
 * Số cột con THỰC SỰ dùng phụ thuộc totalQuestions — nếu đề chỉ cần ít cột hơn số cột tối đa
 * vừa trang, các cột đó được dàn đều ra hết chiều rộng khả dụng (thay vì dồn về bên trái, để
 * lại 1 cột trống bên phải chỉ có tiêu đề A/B/C mà không có ô nào).
 */
const DEFAULT_MAX_OPTIONS = 4;

export function buildQuestionGridLayout(maxOptions: number, totalQuestions?: number): QuestionGridLayout {
  // Phòng trường hợp thiếu/hỏng giá trị (vd. file dap-an.json cũ từ trước khi có trường
  // maxOptionsPerQuestion) — dùng mặc định 4 thay vì để lan truyền NaN ra toàn bộ layout.
  const normalized = Number.isFinite(maxOptions) ? maxOptions : DEFAULT_MAX_OPTIONS;
  const safeMax = Math.max(MIN_LAYOUT_OPTIONS, Math.round(normalized));
  const minPitchMm = QUESTION_LABEL_WIDTH_MM + (safeMax - 1) * QUESTION_OPTION_PITCH_MM + 4;
  const maxFittableColumns = Math.max(1, Math.floor(QUESTION_GRID_USABLE_WIDTH_MM / minPitchMm));

  const safeTotalQuestions =
    Number.isFinite(totalQuestions) && (totalQuestions as number) > 0
      ? Math.round(totalQuestions as number)
      : maxFittableColumns * QUESTIONS_PER_SUBCOLUMN;
  const columnsUsed = Math.min(maxFittableColumns, Math.max(1, Math.ceil(safeTotalQuestions / QUESTIONS_PER_SUBCOLUMN)));

  // Dàn đều các cột đang dùng ra hết chiều rộng khả dụng — pitch luôn >= minPitchMm vì
  // columnsUsed <= maxFittableColumns (chứng minh: maxFittableColumns * minPitchMm <= USABLE_WIDTH).
  const subcolumnPitchMm = QUESTION_GRID_USABLE_WIDTH_MM / columnsUsed;

  return {
    maxOptions: safeMax,
    subcolumnCount: columnsUsed,
    questionsPerSubcolumn: QUESTIONS_PER_SUBCOLUMN,
    maxQuestionsPerPage: maxFittableColumns * QUESTIONS_PER_SUBCOLUMN,
    subcolumnPitchMm,
  };
}

/** position: số thứ tự câu hỏi trên phiếu, 1-based. optionIndex: 0=A,1=B,2=C,... */
export function getQuestionBubbleCenter(layout: QuestionGridLayout, position: number, optionIndex: number): PointMm {
  const zeroBased = position - 1;
  const subCol = Math.floor(zeroBased / layout.questionsPerSubcolumn);
  const rowInSubCol = zeroBased % layout.questionsPerSubcolumn;
  return {
    xMm:
      QUESTION_GRID_ORIGIN.xMm +
      subCol * layout.subcolumnPitchMm +
      QUESTION_LABEL_WIDTH_MM +
      optionIndex * QUESTION_OPTION_PITCH_MM,
    yMm: QUESTION_GRID_ORIGIN.yMm + rowInSubCol * QUESTION_ROW_PITCH_MM,
  };
}

export function getQuestionLabelPosition(layout: QuestionGridLayout, position: number): PointMm {
  const zeroBased = position - 1;
  const subCol = Math.floor(zeroBased / layout.questionsPerSubcolumn);
  const rowInSubCol = zeroBased % layout.questionsPerSubcolumn;
  return {
    xMm: QUESTION_GRID_ORIGIN.xMm + subCol * layout.subcolumnPitchMm,
    yMm: QUESTION_GRID_ORIGIN.yMm + rowInSubCol * QUESTION_ROW_PITCH_MM,
  };
}
