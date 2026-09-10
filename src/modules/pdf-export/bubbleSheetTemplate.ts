/**
 * NGUỒN DUY NHẤT định nghĩa hình học của phiếu trả lời trắc nghiệm.
 * Cả bubbleSheetPdf.ts (sinh PDF để in) và pipeline OMR (đọc ảnh scan) đều PHẢI
 * import các hằng số/hàm từ file này — không hard-code tọa độ ở nơi khác.
 *
 * Hệ tọa độ mm dùng ở đây: gốc (0,0) ở góc TRÊN-TRÁI trang, trục y hướng XUỐNG
 * (giống tọa độ điểm ảnh của ảnh scan) để khớp trực tiếp với pipeline OMR sau này.
 * pdf-lib dùng gốc dưới-trái, trục y hướng lên — dùng topDownMmToPdfPt() để quy đổi.
 *
 * ---- VERSIONING (QUAN TRỌNG) ----
 * Phiếu trả lời được IN RA giấy ở 1 thời điểm, rồi SCAN/CHẤM ở 1 thời điểm khác (có thể cách
 * nhiều ngày/tháng) — nếu giữa 2 mốc đó code layout này bị đổi (đổi tọa độ ô, đổi kích thước lưới,
 * đổi vị trí marker...) mà không có cơ chế nào ghi nhớ, phiếu in cũ sẽ bị đọc SAI tọa độ khi chấm
 * bằng bản code mới hơn — và tệ nhất là sai điểm ÂM THẦM, không có lỗi nào hiện ra.
 *
 * Giải pháp: MỌI hằng số hình học được đóng gói thành 1 "geometry" theo từng version, lưu vĩnh
 * viễn trong TEMPLATE_GEOMETRY_BY_VERSION. Khi sinh đề (generateVariants.ts), CURRENT_TEMPLATE_VERSION
 * được ghi vào AnswerKeyBundle.templateVersion. Khi chấm (decode.ts), version đó được đọc lại từ
 * chính file dap-an.json đi kèm lô bài scan, để lấy ĐÚNG bộ tọa độ đã dùng lúc in phiếu đó.
 *
 * QUY TẮC khi cần đổi layout trong tương lai:
 *   1. KHÔNG sửa trực tiếp giá trị trong TEMPLATE_GEOMETRY_BY_VERSION[CURRENT_TEMPLATE_VERSION].
 *   2. Tăng CURRENT_TEMPLATE_VERSION lên 1, thêm 1 entry MỚI vào TEMPLATE_GEOMETRY_BY_VERSION với
 *      giá trị mới — entry của version cũ giữ nguyên để phiếu cũ vẫn chấm đúng.
 *   3. Nếu thay đổi không chỉ là hằng số mà là THUẬT TOÁN (vd cách chia cột), buildQuestionGridLayoutFor
 *      cần rẽ nhánh theo geometry.version thay vì áp dụng 1 công thức chung cho mọi version.
 */

export const PAGE_WIDTH_MM = 210; // A4
export const PAGE_HEIGHT_MM = 297;

/** Độ phân giải chuẩn hóa cho ảnh scan sau khi đã warp về đúng khung mẫu. */
export const TEMPLATE_DPI = 300;

export interface PointMm {
  xMm: number;
  yMm: number;
}

// ---- Quy đổi đơn vị (không phụ thuộc version) ----

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

export type MarkerId = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface MarkerSpec {
  id: MarkerId;
  sizeMm: number;
  /** Góc trên-trái của ô vuông marker (không phải tâm) — tiện cho vẽ hình chữ nhật. */
  topLeft: PointMm;
}

// ---- Định nghĩa 1 bộ hình học đầy đủ (1 "version" layout) ----

export interface TemplateGeometry {
  version: number;
  pageWidthMm: number;
  pageHeightMm: number;
  markerSizeMm: number;
  markerMarginMm: number;
  /**
   * Nếu khác null: marker góc này được vẽ RỖNG (chỉ viền, không tô đặc) thay vì đặc như 3 marker
   * còn lại — pipeline OMR nhận ra góc này bằng cách kiểm tra TÂM của chính nó có mực hay không
   * (không so sánh với marker khác), nên KHÔNG bị ảnh hưởng bởi phối cảnh ảnh chụp nghiêng (khác
   * với cách "so diện tích 4 marker" trước đây — bị ảnh chụp góc nghiêng làm sai lệch vì marker ở
   * góc gần camera luôn trông to hơn marker ở góc xa, bất kể kích thước in thật). null = không có
   * marker rỗng nào (vd version 1) -> không tự sửa được ảnh lật/xoay.
   */
  hollowCornerId: MarkerId | null;
  mssv: {
    digitCount: number;
    bubbleDiameterMm: number;
    gridOrigin: PointMm;
    colPitchMm: number;
    rowPitchMm: number;
    labelOffsetMm: number;
  };
  examCode: {
    digitCount: number;
    bubbleDiameterMm: number;
    gridOrigin: PointMm;
    colPitchMm: number;
    rowPitchMm: number;
    labelOffsetMm: number;
  };
  question: {
    gridOrigin: PointMm;
    questionsPerSubcolumn: number;
    rowPitchMm: number;
    labelWidthMm: number;
    optionPitchMm: number;
    bubbleDiameterMm: number;
    /** Chiều rộng khả dụng cho lưới câu hỏi, tính từ gridOrigin.xMm, chừa lề phải an toàn. */
    usableWidthMm: number;
    /** Số đáp án tối thiểu phải chừa chỗ, kể cả khi ngân hàng câu hỏi chỉ có 2 đáp án/câu. */
    minOptions: number;
    /** Cứ mỗi bấy nhiêu câu trong 1 cột con thì chèn 1 khoảng trống (clusterGapMm) — giúp mắt dễ
     * đếm/dò theo cụm thay vì 1 dải liền không ngắt. Đặt = questionsPerSubcolumn để tắt (không cụm). */
    rowsPerCluster: number;
    clusterGapMm: number;
  };
}

/**
 * Version 1 — layout hiện tại (kể từ khi có cơ chế versioning này). Tất cả các lần chỉnh layout
 * TRƯỚC thời điểm này trong quá trình phát triển đều chưa từng in phát cho thí sinh thật nên
 * không cần giữ lại — version 1 chính là điểm mốc bắt đầu.
 */
const TEMPLATE_GEOMETRY_V1: TemplateGeometry = {
  version: 1,
  pageWidthMm: 210,
  pageHeightMm: 297,
  markerSizeMm: 10,
  markerMarginMm: 8,
  hollowCornerId: null,
  mssv: {
    digitCount: 8,
    bubbleDiameterMm: 4,
    gridOrigin: { xMm: 34, yMm: 70 },
    colPitchMm: 7,
    rowPitchMm: 6,
    labelOffsetMm: 8,
  },
  examCode: {
    digitCount: 3,
    bubbleDiameterMm: 4,
    gridOrigin: { xMm: 120, yMm: 70 },
    colPitchMm: 7,
    rowPitchMm: 6,
    labelOffsetMm: 8,
  },
  question: {
    gridOrigin: { xMm: 15, yMm: 153 },
    questionsPerSubcolumn: 10,
    rowPitchMm: 7,
    labelWidthMm: 10,
    optionPitchMm: 8,
    bubbleDiameterMm: 4.5,
    usableWidthMm: 190,
    minOptions: 2,
    rowsPerCluster: 10, // = questionsPerSubcolumn -> không chia cụm
    clusterGapMm: 0,
  },
};

/**
 * Version 2 — giống hệt version 1, CHỈ khác:
 *   1. Marker góc trên-trái vẽ RỖNG (chỉ viền) thay vì đặc — pipeline OMR tự nhận ra góc này bằng
 *      cách kiểm tra tâm chính nó rỗng hay đặc, từ đó suy ra 3 góc còn lại theo khoảng cách — tự
 *      sửa được ảnh scan/chụp bị lật 180°/xoay 90°/270°, kể cả ảnh chụp nghiêng có phối cảnh thật
 *      (đã thử và loại bỏ phương án "4 marker kích thước khác nhau" vì bị ảnh chụp nghiêng làm sai
 *      lệch — marker gần camera luôn đo được to hơn marker xa, bất kể in to/nhỏ thế nào).
 *   2. Lưới câu hỏi chia cụm 5 câu/cụm (rowsPerCluster) thay vì 1 dải 10 câu liền không ngắt, cho
 *      dễ đếm/dò theo mắt.
 */
const TEMPLATE_GEOMETRY_V2: TemplateGeometry = {
  ...TEMPLATE_GEOMETRY_V1,
  version: 2,
  hollowCornerId: 'top-left',
  question: { ...TEMPLATE_GEOMETRY_V1.question, rowsPerCluster: 5, clusterGapMm: 4 },
};

export const CURRENT_TEMPLATE_VERSION = 2;

export const TEMPLATE_GEOMETRY_BY_VERSION: Record<number, TemplateGeometry> = {
  1: TEMPLATE_GEOMETRY_V1,
  2: TEMPLATE_GEOMETRY_V2,
};

/** Lấy geometry theo version — mặc định về CURRENT nếu version thiếu/không xác định (file dap-an.json cũ). */
export function getTemplateGeometry(version?: number | null): TemplateGeometry {
  if (version != null && TEMPLATE_GEOMETRY_BY_VERSION[version]) {
    return TEMPLATE_GEOMETRY_BY_VERSION[version];
  }
  return TEMPLATE_GEOMETRY_BY_VERSION[CURRENT_TEMPLATE_VERSION];
}

const CURRENT_GEOMETRY = TEMPLATE_GEOMETRY_BY_VERSION[CURRENT_TEMPLATE_VERSION];

// ---- Marker góc (dùng để chỉnh phối cảnh ảnh scan) ----

export function getCornerMarkersFor(geometry: TemplateGeometry): MarkerSpec[] {
  const { pageWidthMm, pageHeightMm, markerMarginMm, markerSizeMm } = geometry;
  return [
    { id: 'top-left', sizeMm: markerSizeMm, topLeft: { xMm: markerMarginMm, yMm: markerMarginMm } },
    {
      id: 'top-right',
      sizeMm: markerSizeMm,
      topLeft: { xMm: pageWidthMm - markerMarginMm - markerSizeMm, yMm: markerMarginMm },
    },
    {
      id: 'bottom-left',
      sizeMm: markerSizeMm,
      topLeft: { xMm: markerMarginMm, yMm: pageHeightMm - markerMarginMm - markerSizeMm },
    },
    {
      id: 'bottom-right',
      sizeMm: markerSizeMm,
      topLeft: {
        xMm: pageWidthMm - markerMarginMm - markerSizeMm,
        yMm: pageHeightMm - markerMarginMm - markerSizeMm,
      },
    },
  ];
}

export const CORNER_MARKERS: MarkerSpec[] = getCornerMarkersFor(CURRENT_GEOMETRY);

/** Marker góc nào (nếu có) được vẽ RỖNG ở version hiện tại — null nếu không có (vd version 1). */
export const HOLLOW_CORNER_ID: MarkerId | null = CURRENT_GEOMETRY.hollowCornerId;

// ---- Lưới Mã số sinh viên (MSSV, sinh viên tự tô) ----

export const MSSV_DIGIT_COUNT = CURRENT_GEOMETRY.mssv.digitCount;
export const MSSV_BUBBLE_DIAMETER_MM = CURRENT_GEOMETRY.mssv.bubbleDiameterMm;
export const MSSV_GRID_ORIGIN: PointMm = CURRENT_GEOMETRY.mssv.gridOrigin;
export const MSSV_COL_PITCH_MM = CURRENT_GEOMETRY.mssv.colPitchMm;
export const MSSV_ROW_PITCH_MM = CURRENT_GEOMETRY.mssv.rowPitchMm;
export const MSSV_LABEL_OFFSET_MM = CURRENT_GEOMETRY.mssv.labelOffsetMm;

export function getMssvBubbleCenterFor(geometry: TemplateGeometry, colIndex: number, digit: number): PointMm {
  const { gridOrigin, colPitchMm, rowPitchMm } = geometry.mssv;
  return { xMm: gridOrigin.xMm + colIndex * colPitchMm, yMm: gridOrigin.yMm + digit * rowPitchMm };
}

export function getMssvBubbleCenter(colIndex: number, digit: number): PointMm {
  return getMssvBubbleCenterFor(CURRENT_GEOMETRY, colIndex, digit);
}

// ---- Lưới Mã đề (TÔ SẴN khi sinh PDF vì mã đề đã biết trước, hoặc để trống cho thí sinh tự tô) ----

export const EXAM_CODE_DIGIT_COUNT = CURRENT_GEOMETRY.examCode.digitCount;
export const EXAM_CODE_BUBBLE_DIAMETER_MM = CURRENT_GEOMETRY.examCode.bubbleDiameterMm;
export const EXAM_CODE_GRID_ORIGIN: PointMm = CURRENT_GEOMETRY.examCode.gridOrigin;
export const EXAM_CODE_COL_PITCH_MM = CURRENT_GEOMETRY.examCode.colPitchMm;
export const EXAM_CODE_ROW_PITCH_MM = CURRENT_GEOMETRY.examCode.rowPitchMm;
export const EXAM_CODE_LABEL_OFFSET_MM = CURRENT_GEOMETRY.examCode.labelOffsetMm;

export function getExamCodeBubbleCenterFor(geometry: TemplateGeometry, colIndex: number, digit: number): PointMm {
  const { gridOrigin, colPitchMm, rowPitchMm } = geometry.examCode;
  return { xMm: gridOrigin.xMm + colIndex * colPitchMm, yMm: gridOrigin.yMm + digit * rowPitchMm };
}

export function getExamCodeBubbleCenter(colIndex: number, digit: number): PointMm {
  return getExamCodeBubbleCenterFor(CURRENT_GEOMETRY, colIndex, digit);
}

// ---- Lưới câu hỏi PHẦN I — số cột đáp án (A, B, C...) KHÔNG cố định, phụ thuộc số đáp án
// lớn nhất trong ngân hàng câu hỏi của đề đang tạo. Vì vậy layout được TÍNH ĐỘNG thay vì hằng
// số cố định — cả PDF (bubbleSheetPdf.ts) và OMR (bubbleSample.ts) đều dùng chung layout này
// để đảm bảo tọa độ khớp nhau tuyệt đối.

export const QUESTION_GRID_ORIGIN: PointMm = CURRENT_GEOMETRY.question.gridOrigin;
export const QUESTIONS_PER_SUBCOLUMN = CURRENT_GEOMETRY.question.questionsPerSubcolumn;
export const QUESTION_ROW_PITCH_MM = CURRENT_GEOMETRY.question.rowPitchMm;
export const QUESTION_LABEL_WIDTH_MM = CURRENT_GEOMETRY.question.labelWidthMm;
export const QUESTION_OPTION_PITCH_MM = CURRENT_GEOMETRY.question.optionPitchMm;
export const QUESTION_BUBBLE_DIAMETER_MM = CURRENT_GEOMETRY.question.bubbleDiameterMm;

const DEFAULT_MAX_OPTIONS = 4;

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
 *
 * NOTE: thuật toán này áp dụng chung cho version 1. Nếu 1 version tương lai cần đổi CÁCH chia
 * cột (không chỉ đổi hằng số), rẽ nhánh theo geometry.version tại đây.
 */
export function buildQuestionGridLayoutFor(
  geometry: TemplateGeometry,
  maxOptions: number,
  totalQuestions?: number,
): QuestionGridLayout {
  const { labelWidthMm, optionPitchMm, usableWidthMm, minOptions, questionsPerSubcolumn } = geometry.question;
  // Phòng trường hợp thiếu/hỏng giá trị (vd. file dap-an.json cũ từ trước khi có trường
  // maxOptionsPerQuestion) — dùng mặc định 4 thay vì để lan truyền NaN ra toàn bộ layout.
  const normalized = Number.isFinite(maxOptions) ? maxOptions : DEFAULT_MAX_OPTIONS;
  const safeMax = Math.max(minOptions, Math.round(normalized));
  const minPitchMm = labelWidthMm + (safeMax - 1) * optionPitchMm + 4;
  const maxFittableColumns = Math.max(1, Math.floor(usableWidthMm / minPitchMm));

  const safeTotalQuestions =
    Number.isFinite(totalQuestions) && (totalQuestions as number) > 0
      ? Math.round(totalQuestions as number)
      : maxFittableColumns * questionsPerSubcolumn;
  const columnsUsed = Math.min(maxFittableColumns, Math.max(1, Math.ceil(safeTotalQuestions / questionsPerSubcolumn)));

  // Dàn đều các cột đang dùng ra hết chiều rộng khả dụng — pitch luôn >= minPitchMm vì
  // columnsUsed <= maxFittableColumns (chứng minh: maxFittableColumns * minPitchMm <= usableWidthMm).
  const subcolumnPitchMm = usableWidthMm / columnsUsed;

  return {
    maxOptions: safeMax,
    subcolumnCount: columnsUsed,
    questionsPerSubcolumn,
    maxQuestionsPerPage: maxFittableColumns * questionsPerSubcolumn,
    subcolumnPitchMm,
  };
}

export function buildQuestionGridLayout(maxOptions: number, totalQuestions?: number): QuestionGridLayout {
  return buildQuestionGridLayoutFor(CURRENT_GEOMETRY, maxOptions, totalQuestions);
}

/** Khoảng cách dọc (mm) từ đầu cột con tới 1 hàng câu hỏi — cộng thêm clusterGapMm mỗi khi đã đi
 * qua đủ 1 cụm (rowsPerCluster câu) để tạo khoảng trống phân cụm cho dễ đếm/dò. */
function rowYOffsetMm(rowInSubCol: number, question: TemplateGeometry['question']): number {
  const { rowPitchMm, rowsPerCluster, clusterGapMm } = question;
  const clustersPassed = Math.floor(rowInSubCol / rowsPerCluster);
  return rowInSubCol * rowPitchMm + clustersPassed * clusterGapMm;
}

/** position: số thứ tự câu hỏi trên phiếu, 1-based. optionIndex: 0=A,1=B,2=C,... */
export function getQuestionBubbleCenterFor(
  geometry: TemplateGeometry,
  layout: QuestionGridLayout,
  position: number,
  optionIndex: number,
): PointMm {
  const zeroBased = position - 1;
  const subCol = Math.floor(zeroBased / layout.questionsPerSubcolumn);
  const rowInSubCol = zeroBased % layout.questionsPerSubcolumn;
  const { gridOrigin, labelWidthMm, optionPitchMm } = geometry.question;
  return {
    xMm: gridOrigin.xMm + subCol * layout.subcolumnPitchMm + labelWidthMm + optionIndex * optionPitchMm,
    yMm: gridOrigin.yMm + rowYOffsetMm(rowInSubCol, geometry.question),
  };
}

export function getQuestionBubbleCenter(layout: QuestionGridLayout, position: number, optionIndex: number): PointMm {
  return getQuestionBubbleCenterFor(CURRENT_GEOMETRY, layout, position, optionIndex);
}

export function getQuestionLabelPositionFor(
  geometry: TemplateGeometry,
  layout: QuestionGridLayout,
  position: number,
): PointMm {
  const zeroBased = position - 1;
  const subCol = Math.floor(zeroBased / layout.questionsPerSubcolumn);
  const rowInSubCol = zeroBased % layout.questionsPerSubcolumn;
  const { gridOrigin } = geometry.question;
  return { xMm: gridOrigin.xMm + subCol * layout.subcolumnPitchMm, yMm: gridOrigin.yMm + rowYOffsetMm(rowInSubCol, geometry.question) };
}

export function getQuestionLabelPosition(layout: QuestionGridLayout, position: number): PointMm {
  return getQuestionLabelPositionFor(CURRENT_GEOMETRY, layout, position);
}
