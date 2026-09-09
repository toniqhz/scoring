import JSZip from 'jszip';
import { generateBubbleSheetPdf } from '../../modules/pdf-export/bubbleSheetPdf';
import { extractExamXmlStructure } from '../../modules/docx-export/xmlBlockExtractor';
import { generateExamVariantDocx } from '../../modules/docx-export/generateExamDocx';
import { exportAnswerKeyToXlsxBytes } from '../../modules/excel/answerKeyExcelMirror';
import { indexOfLetter } from '../../lib/optionLetters';
import type { Question } from '../../types/question';
import type { ExamVariant } from '../../types/examVariant';
import type { AnswerKeyBundle } from '../../types/answerKey';

export interface BuildExportBundleInput {
  examTitle: string;
  questions: Question[];
  variants: ExamVariant[];
  answerKeyBundle: AnswerKeyBundle;
  /** File .docx gốc do giáo viên tải lên — dùng làm khung để giữ nguyên header/footer/font. */
  originalDocxBuffer: ArrayBuffer;
}

/**
 * Đóng gói N file đề thi (.docx, giữ nguyên định dạng gốc) + 1 phiếu trả lời DÙNG CHUNG (mã đề
 * để trống, thí sinh tự tô như số báo danh) + N phiếu đáp án đã tô sẵn theo từng mã đề (hỗ trợ
 * chấm đục lỗ) + đáp án thành 1 file zip.
 */
export async function buildExportBundle(input: BuildExportBundleInput): Promise<Blob> {
  const zip = new JSZip();
  const structure = await extractExamXmlStructure(input.originalDocxBuffer);

  for (const variant of input.variants) {
    const examDocxBytes = await generateExamVariantDocx({
      originalDocxBuffer: input.originalDocxBuffer,
      structure,
      questions: input.questions,
      variant,
      examCode: variant.examCode,
    });
    zip.file(`de-thi_${variant.examCode}.docx`, examDocxBytes);
  }

  const bubbleSheetBytes = await generateBubbleSheetPdf({
    totalQuestions: input.answerKeyBundle.totalQuestions,
    maxOptions: input.answerKeyBundle.maxOptionsPerQuestion,
  });
  zip.file('phieu-tra-loi.pdf', bubbleSheetBytes);

  // Phiếu đáp án đã tô sẵn theo từng mã đề — tọa độ ô giống hệt phiếu trắng ở trên, hỗ trợ giáo
  // viên chấm tay kiểu đục lỗ (đặt chồng lên bài làm của thí sinh để đối chiếu nhanh).
  for (const variant of input.answerKeyBundle.variants) {
    const answerSheetBytes = await generateBubbleSheetPdf({
      totalQuestions: input.answerKeyBundle.totalQuestions,
      maxOptions: input.answerKeyBundle.maxOptionsPerQuestion,
      filledExamCode: variant.examCode,
      filledAnswers: variant.answers.map((a) => ({
        position: a.position,
        optionIndex: indexOfLetter(a.correctLetter),
      })),
    });
    zip.file(`phieu-dap-an/phieu-dap-an_${variant.examCode}.pdf`, answerSheetBytes);
  }

  zip.file('dap-an.json', JSON.stringify(input.answerKeyBundle, null, 2));
  zip.file('dap-an.xlsx', exportAnswerKeyToXlsxBytes(input.answerKeyBundle));

  return zip.generateAsync({ type: 'blob' });
}
