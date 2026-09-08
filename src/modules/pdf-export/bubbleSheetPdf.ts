import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { embedVietnameseFonts } from './fontLoader';
import {
  PAGE_WIDTH_MM,
  PAGE_HEIGHT_MM,
  mmToPt,
  topDownMmToPdfPt,
  type PointMm,
  type MarkerSpec,
  CORNER_MARKERS,
  MSSV_DIGIT_COUNT,
  MSSV_BUBBLE_DIAMETER_MM,
  MSSV_LABEL_OFFSET_MM,
  MSSV_GRID_ORIGIN,
  MSSV_ROW_PITCH_MM,
  getMssvBubbleCenter,
  EXAM_CODE_DIGIT_COUNT,
  EXAM_CODE_BUBBLE_DIAMETER_MM,
  EXAM_CODE_LABEL_OFFSET_MM,
  EXAM_CODE_GRID_ORIGIN,
  EXAM_CODE_ROW_PITCH_MM,
  getExamCodeBubbleCenter,
  QUESTION_BUBBLE_DIAMETER_MM,
  QUESTION_OPTION_PITCH_MM,
  QUESTION_GRID_ORIGIN,
  SUBCOLUMN_PITCH_MM,
  SUBCOLUMN_COUNT,
  MAX_QUESTIONS_PER_PAGE,
  OPTION_LETTERS,
  getQuestionBubbleCenter,
  getQuestionLabelPosition,
} from './bubbleSheetTemplate';

export interface BubbleSheetInput {
  examTitle: string;
  examCode: string;
  totalQuestions: number;
}

const BLACK = rgb(0, 0, 0);

function drawBubble(page: PDFPage, center: PointMm, diameterMm: number, filled: boolean) {
  const { x, y } = topDownMmToPdfPt(center);
  const radiusPt = mmToPt(diameterMm) / 2;
  page.drawEllipse({
    x,
    y,
    xScale: radiusPt,
    yScale: radiusPt,
    borderColor: BLACK,
    borderWidth: 1,
    color: filled ? BLACK : undefined,
  });
}

function drawMarker(page: PDFPage, marker: MarkerSpec) {
  const bottomLeftTD: PointMm = { xMm: marker.topLeft.xMm, yMm: marker.topLeft.yMm + marker.sizeMm };
  const { x, y } = topDownMmToPdfPt(bottomLeftTD);
  page.drawRectangle({ x, y, width: mmToPt(marker.sizeMm), height: mmToPt(marker.sizeMm), color: BLACK });
}

function drawTextTD(
  page: PDFPage,
  p: PointMm,
  text: string,
  opts: { size: number; font: PDFFont; centered?: boolean },
) {
  const { x, y } = topDownMmToPdfPt(p);
  const width = opts.centered ? opts.font.widthOfTextAtSize(text, opts.size) : 0;
  page.drawText(text, {
    x: x - width / 2,
    y: y - opts.size * 0.35,
    size: opts.size,
    font: opts.font,
    color: BLACK,
  });
}

/** Sinh PDF phiếu trả lời trắc nghiệm (OMR) — layout cố định, chỉ mã đề khác nhau giữa các biến thể. */
export async function generateBubbleSheetPdf(input: BubbleSheetInput): Promise<Uint8Array> {
  if (input.totalQuestions > MAX_QUESTIONS_PER_PAGE) {
    throw new Error(
      `Phiếu trả lời hiện chỉ hỗ trợ tối đa ${MAX_QUESTIONS_PER_PAGE} câu/trang (đề có ${input.totalQuestions} câu).`,
    );
  }
  if (!/^\d+$/.test(input.examCode) || input.examCode.length > EXAM_CODE_DIGIT_COUNT) {
    throw new Error(`Mã đề "${input.examCode}" phải là số có tối đa ${EXAM_CODE_DIGIT_COUNT} chữ số.`);
  }

  const pdfDoc = await PDFDocument.create();
  const { regular, bold } = await embedVietnameseFonts(pdfDoc);
  const page = pdfDoc.addPage([mmToPt(PAGE_WIDTH_MM), mmToPt(PAGE_HEIGHT_MM)]);

  // Marker góc để căn chỉnh phối cảnh ảnh scan
  for (const marker of CORNER_MARKERS) drawMarker(page, marker);

  // Tiêu đề
  drawTextTD(page, { xMm: PAGE_WIDTH_MM / 2, yMm: 24 }, 'PHIẾU TRẢ LỜI TRẮC NGHIỆM', {
    size: 15,
    font: bold,
    centered: true,
  });
  drawTextTD(page, { xMm: PAGE_WIDTH_MM / 2, yMm: 32 }, input.examTitle, {
    size: 11,
    font: regular,
    centered: true,
  });
  drawTextTD(
    page,
    { xMm: PAGE_WIDTH_MM / 2, yMm: 40 },
    'Tô đen hoàn toàn ô tương ứng bằng bút chì/bút bi đen. Không tẩy xóa, không tô nhiều hơn 1 ô/câu.',
    { size: 8.5, font: regular, centered: true },
  );

  // ---- Lưới Số báo danh (MSSV) ----
  drawTextTD(page, { xMm: MSSV_GRID_ORIGIN.xMm - MSSV_LABEL_OFFSET_MM, yMm: 52 }, 'SỐ BÁO DANH', {
    size: 9,
    font: bold,
  });
  for (let digit = 0; digit <= 9; digit++) {
    drawTextTD(
      page,
      { xMm: MSSV_GRID_ORIGIN.xMm - MSSV_LABEL_OFFSET_MM, yMm: MSSV_GRID_ORIGIN.yMm + digit * MSSV_ROW_PITCH_MM },
      String(digit),
      { size: 8, font: regular },
    );
  }
  for (let col = 0; col < MSSV_DIGIT_COUNT; col++) {
    for (let digit = 0; digit <= 9; digit++) {
      drawBubble(page, getMssvBubbleCenter(col, digit), MSSV_BUBBLE_DIAMETER_MM, false);
    }
  }

  // ---- Lưới Mã đề (tô sẵn) ----
  drawTextTD(page, { xMm: EXAM_CODE_GRID_ORIGIN.xMm - EXAM_CODE_LABEL_OFFSET_MM, yMm: 52 }, 'MÃ ĐỀ', {
    size: 9,
    font: bold,
  });
  for (let digit = 0; digit <= 9; digit++) {
    drawTextTD(
      page,
      {
        xMm: EXAM_CODE_GRID_ORIGIN.xMm - EXAM_CODE_LABEL_OFFSET_MM,
        yMm: EXAM_CODE_GRID_ORIGIN.yMm + digit * EXAM_CODE_ROW_PITCH_MM,
      },
      String(digit),
      { size: 8, font: regular },
    );
  }
  const examCodeDigits = input.examCode.padStart(EXAM_CODE_DIGIT_COUNT, '0').split('').map(Number);
  for (let col = 0; col < EXAM_CODE_DIGIT_COUNT; col++) {
    for (let digit = 0; digit <= 9; digit++) {
      const filled = examCodeDigits[col] === digit;
      drawBubble(page, getExamCodeBubbleCenter(col, digit), EXAM_CODE_BUBBLE_DIAMETER_MM, filled);
    }
  }

  // ---- Lưới câu hỏi PHẦN I ----
  drawTextTD(page, { xMm: QUESTION_GRID_ORIGIN.xMm, yMm: 126 }, 'PHẦN I — Trả lời trắc nghiệm', {
    size: 11,
    font: bold,
  });

  for (let subCol = 0; subCol < SUBCOLUMN_COUNT; subCol++) {
    const headerY = QUESTION_GRID_ORIGIN.yMm - 5;
    OPTION_LETTERS.forEach((letter, optionIndex) => {
      const x = QUESTION_GRID_ORIGIN.xMm + subCol * SUBCOLUMN_PITCH_MM + 10 + optionIndex * QUESTION_OPTION_PITCH_MM;
      drawTextTD(page, { xMm: x, yMm: headerY }, letter, { size: 8, font: bold, centered: true });
    });
  }

  for (let position = 1; position <= input.totalQuestions; position++) {
    const labelPos = getQuestionLabelPosition(position);
    drawTextTD(page, labelPos, String(position), { size: 8.5, font: regular });
    OPTION_LETTERS.forEach((_, optionIndex) => {
      drawBubble(page, getQuestionBubbleCenter(position, optionIndex), QUESTION_BUBBLE_DIAMETER_MM, false);
    });
  }

  return pdfDoc.save();
}
