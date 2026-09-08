import { PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import { embedVietnameseFonts } from './fontLoader';
import { wrapText } from './textLayout';
import type { PrintableQuestion } from '../../types/question';

const PAGE_WIDTH = 595.28; // A4, pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const FONT_SIZE = 11;
const OPTION_INDENT = 16;

export interface ExamPaperInput {
  examTitle: string;
  examCode: string;
  questions: PrintableQuestion[];
}

/**
 * Sinh PDF đề thi để in cho sinh viên.
 * Lưu ý: PrintableQuestion không mang trường đáp án đúng — không thể vô tình làm lộ đáp án ở đây.
 */
export async function generateExamPaperPdf(input: ExamPaperInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const { regular, bold } = await embedVietnameseFonts(pdfDoc);

  const state: { page: PDFPage; y: number } = {
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
  };

  const drawLine = (text: string, x: number, font: PDFFont, size: number) => {
    const lineHeight = size * 1.4;
    if (state.y < MARGIN + lineHeight) {
      state.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      state.y = PAGE_HEIGHT - MARGIN;
    }
    state.page.drawText(text, { x, y: state.y, size, font });
    state.y -= lineHeight;
  };

  drawLine(input.examTitle, MARGIN, bold, 14);
  drawLine(`Mã đề: ${input.examCode}`, MARGIN, bold, 12);
  state.y -= 6;

  input.questions.forEach((q, index) => {
    const stemLines = wrapText(
      `Câu ${index + 1}: ${q.text}`,
      regular,
      FONT_SIZE,
      PAGE_WIDTH - 2 * MARGIN,
    );
    stemLines.forEach((line) => drawLine(line, MARGIN, regular, FONT_SIZE));

    for (const opt of q.options) {
      const optLines = wrapText(
        `${opt.letter}. ${opt.text}`,
        regular,
        FONT_SIZE,
        PAGE_WIDTH - 2 * MARGIN - OPTION_INDENT,
      );
      optLines.forEach((line) => drawLine(line, MARGIN + OPTION_INDENT, regular, FONT_SIZE));
    }
    state.y -= 6;
  });

  return pdfDoc.save();
}
