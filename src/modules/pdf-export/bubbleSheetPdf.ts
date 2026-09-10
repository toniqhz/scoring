import { PDFDocument, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { embedVietnameseFonts } from './fontLoader';
import { letterAt } from '../../lib/optionLetters';
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
  buildQuestionGridLayout,
  getQuestionBubbleCenter,
  getQuestionLabelPosition,
  CURRENT_TEMPLATE_VERSION,
  HOLLOW_CORNER_ID,
} from './bubbleSheetTemplate';

export interface FilledAnswer {
  position: number;
  /** 0-based: A=0, B=1, ... */
  optionIndex: number;
}

export interface BubbleSheetInput {
  totalQuestions: number;
  /** Số đáp án lớn nhất trong đề (quyết định số cột A/B/C.../trang) — mặc định 4 nếu không truyền. */
  maxOptions?: number;
  /**
   * Nếu truyền vào: tô sẵn đáp án đúng theo từng vị trí — dùng để in "phiếu đáp án" theo mã đề,
   * hỗ trợ chấm tay kiểu đục lỗ (đặt phiếu đáp án lên trên bài làm, đối chiếu qua các ô đã tô/lỗ).
   * Tọa độ ô hoàn toàn giống phiếu trắng phát cho thí sinh — chỉ khác các ô này được tô sẵn.
   */
  filledAnswers?: FilledAnswer[];
  /** Tô sẵn luôn ô Mã đề tương ứng, để dễ nhận biết phiếu đáp án này dùng cho mã đề nào. */
  filledExamCode?: string;
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

function drawMarker(page: PDFPage, marker: MarkerSpec, hollow = false) {
  const bottomLeftTD: PointMm = { xMm: marker.topLeft.xMm, yMm: marker.topLeft.yMm + marker.sizeMm };
  const { x, y } = topDownMmToPdfPt(bottomLeftTD);
  const sizePt = mmToPt(marker.sizeMm);
  if (hollow) {
    // Chỉ vẽ viền (không tô đặc) — OMR nhận ra góc này bằng cách kiểm tra tâm không có mực.
    page.drawRectangle({ x, y, width: sizePt, height: sizePt, borderColor: BLACK, borderWidth: mmToPt(1.5) });
  } else {
    page.drawRectangle({ x, y, width: sizePt, height: sizePt, color: BLACK });
  }
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

/** Bề rộng an toàn để đặt chữ căn giữa — chừa thêm lề bên TRONG 2 ô vuông marker góc trái/phải
 * (marker chiếm từ MARKER_MARGIN_MM đến MARKER_MARGIN_MM+MARKER_SIZE_MM = 8-18mm mỗi bên),
 * tránh chữ dài tràn ra đè lên/lấn quá sát marker.
 */
const SAFE_TEXT_WIDTH_MM = 170;

function wrapTextToWidth(font: PDFFont, text: string, size: number, maxWidthMm: number): string[] {
  const maxWidthPt = mmToPt(maxWidthMm);
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidthPt) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Vẽ danh sách gạch đầu dòng, căn TRÁI (không căn giữa) — dùng cho đoạn hướng dẫn trước lưới câu
 * hỏi. Mỗi phần tử của `lines` là 1 gạch đầu dòng riêng, không tự động ngắt theo bề rộng.
 */
function drawBulletedLines(
  page: PDFPage,
  xMm: number,
  startYMm: number,
  lines: string[],
  opts: { size: number; font: PDFFont; lineHeightMm: number },
) {
  lines.forEach((line, i) => {
    drawTextTD(page, { xMm, yMm: startYMm + i * opts.lineHeightMm }, `- ${line}`, {
      size: opts.size,
      font: opts.font,
    });
  });
}

/** Nhãn + đường kẻ trống để viết tay (vd "Môn thi: ..............."). */
function drawFormField(page: PDFPage, font: PDFFont, xMm: number, yMm: number, label: string, lineEndXMm: number) {
  drawTextTD(page, { xMm, yMm }, label, { size: 10, font });
  const start = topDownMmToPdfPt({ xMm, yMm: yMm + 1.2 });
  const end = topDownMmToPdfPt({ xMm: lineEndXMm, yMm: yMm + 1.2 });
  const lineStartX = start.x + font.widthOfTextAtSize(label, 10) + mmToPt(2);
  page.drawLine({ start: { x: lineStartX, y: start.y }, end: { x: end.x, y: end.y }, thickness: 0.75, color: BLACK });
}

/**
 * Sinh PDF phiếu trả lời trắc nghiệm (OMR) — DÙNG CHUNG cho mọi mã đề (chỉ cần sinh 1 lần).
 * Ô mã đề để TRỐNG, thí sinh tự tô (giống ô số báo danh) vì mã đề đã in sẵn trên đề thi của họ.
 */
export async function generateBubbleSheetPdf(input: BubbleSheetInput): Promise<Uint8Array> {
  const layout = buildQuestionGridLayout(input.maxOptions ?? 4, input.totalQuestions);
  if (input.totalQuestions > layout.maxQuestionsPerPage) {
    throw new Error(
      `Phiếu trả lời với ${layout.maxOptions} đáp án/câu chỉ hỗ trợ tối đa ${layout.maxQuestionsPerPage} câu/trang ` +
        `(đề có ${input.totalQuestions} câu). Hãy giảm số đáp án hoặc số câu, hoặc chia nhỏ đề.`,
    );
  }

  const pdfDoc = await PDFDocument.create();
  const { regular, bold } = await embedVietnameseFonts(pdfDoc);
  const page = pdfDoc.addPage([mmToPt(PAGE_WIDTH_MM), mmToPt(PAGE_HEIGHT_MM)]);

  // Marker góc để căn chỉnh phối cảnh ảnh scan — marker góc trên-trái có thể được vẽ RỖNG (xem
  // HOLLOW_CORNER_ID) giúp OMR tự nhận ra đúng góc nào là góc nào, tự sửa ảnh scan bị lật/xoay.
  for (const marker of CORNER_MARKERS) drawMarker(page, marker, marker.id === HOLLOW_CORNER_ID);

  const isAnswerKeySheet = Boolean(input.filledExamCode);

  // Tiêu đề
  drawTextTD(
    page,
    { xMm: PAGE_WIDTH_MM / 2, yMm: 24 },
    isAnswerKeySheet ? `PHIẾU ĐÁP ÁN — MÃ ĐỀ ${input.filledExamCode}` : 'PHIẾU TRẢ LỜI TRẮC NGHIỆM',
    { size: 15, font: bold, centered: true },
  );
  // Cảnh báo "KHÔNG phát cho thí sinh" phải nổi bật ngay dưới tiêu đề — giữ nguyên vị trí này.
  // Hướng dẫn tô bài của phiếu trắng thì chuyển xuống ngay trước lưới câu hỏi (xem bên dưới).
  if (isAnswerKeySheet) {
    const lines = wrapTextToWidth(
      regular,
      'Đã tô sẵn đáp án đúng theo mã đề trên — dùng làm mẫu đối chiếu/đục lỗ khi chấm tay. KHÔNG phát cho thí sinh.',
      8.5,
      SAFE_TEXT_WIDTH_MM,
    );
    lines.forEach((line, i) => {
      drawTextTD(page, { xMm: PAGE_WIDTH_MM / 2, yMm: 30 + i * 4.2 }, line, { size: 8.5, font: regular, centered: true });
    });
  }

  // ---- Ô điền tay: Môn thi / Kỳ thi / Họ và tên ----
  drawFormField(page, regular, 20, 42, 'Môn thi:', 105);
  drawFormField(page, regular, 112, 42, 'Kỳ thi:', 190);
  drawFormField(page, regular, 20, 50, 'Họ và tên:', 190);

  // ---- Lưới Mã số sinh viên (MSSV) ----
  drawTextTD(page, { xMm: MSSV_GRID_ORIGIN.xMm - MSSV_LABEL_OFFSET_MM, yMm: 60 }, 'MÃ SỐ SINH VIÊN', {
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

  // ---- Lưới Mã đề (thí sinh tự tô theo mã đề in trên đề thi của mình) ----
  drawTextTD(page, { xMm: EXAM_CODE_GRID_ORIGIN.xMm - EXAM_CODE_LABEL_OFFSET_MM, yMm: 60 }, 'MÃ ĐỀ', {
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
  for (let col = 0; col < EXAM_CODE_DIGIT_COUNT; col++) {
    for (let digit = 0; digit <= 9; digit++) {
      const isFilled = input.filledExamCode ? Number(input.filledExamCode[col]) === digit : false;
      drawBubble(page, getExamCodeBubbleCenter(col, digit), EXAM_CODE_BUBBLE_DIAMETER_MM, isFilled);
    }
  }

  // ---- Lưới câu hỏi ----
  if (isAnswerKeySheet) {
    drawTextTD(page, { xMm: QUESTION_GRID_ORIGIN.xMm, yMm: 134 }, 'PHẦN I — Trả lời trắc nghiệm', {
      size: 11,
      font: bold,
    });
  } else {
    drawBulletedLines(
      page,
      QUESTION_GRID_ORIGIN.xMm,
      134,
      [
        'Tô đen hoàn toàn ô tương ứng (kể cả Mã số sinh viên và Mã đề ghi trên đề thi) bằng bút chì/bút bi đen.',
        'Không tẩy xóa, không tô nhiều hơn 1 ô/câu.',
      ],
      { size: 8.5, font: regular, lineHeightMm: 4.2 },
    );
  }

  for (let subCol = 0; subCol < layout.subcolumnCount; subCol++) {
    const headerY = QUESTION_GRID_ORIGIN.yMm - 5;
    for (let optionIndex = 0; optionIndex < layout.maxOptions; optionIndex++) {
      const x = QUESTION_GRID_ORIGIN.xMm + subCol * layout.subcolumnPitchMm + 10 + optionIndex * QUESTION_OPTION_PITCH_MM;
      drawTextTD(page, { xMm: x, yMm: headerY }, letterAt(optionIndex), { size: 8, font: bold, centered: true });
    }
  }

  const filledOptionByPosition = new Map((input.filledAnswers ?? []).map((a) => [a.position, a.optionIndex]));
  for (let position = 1; position <= input.totalQuestions; position++) {
    const labelPos = getQuestionLabelPosition(layout, position);
    drawTextTD(page, labelPos, String(position), { size: 8.5, font: regular });
    const filledOptionIndex = filledOptionByPosition.get(position);
    for (let optionIndex = 0; optionIndex < layout.maxOptions; optionIndex++) {
      drawBubble(
        page,
        getQuestionBubbleCenter(layout, position, optionIndex),
        QUESTION_BUBBLE_DIAMETER_MM,
        optionIndex === filledOptionIndex,
      );
    }
  }

  // Ghi nhỏ version layout ở mép dưới trang — không dùng để tự động chấm (việc đó đã dựa vào
  // AnswerKeyBundle.templateVersion), chỉ để con người tham chiếu nếu cần tra cứu/so sánh tay.
  drawTextTD(page, { xMm: PAGE_WIDTH_MM / 2, yMm: PAGE_HEIGHT_MM - 3 }, `Mẫu phiếu v${CURRENT_TEMPLATE_VERSION}`, {
    size: 6,
    font: regular,
    centered: true,
  });

  return pdfDoc.save();
}
