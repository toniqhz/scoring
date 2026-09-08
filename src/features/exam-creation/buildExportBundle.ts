import JSZip from 'jszip';
import { generateExamPaperPdf } from '../../modules/pdf-export/examPaper';
import { generateBubbleSheetPdf } from '../../modules/pdf-export/bubbleSheetPdf';
import { toPrintableQuestions } from '../../modules/shuffle/toPrintable';
import { exportAnswerKeyToXlsxBytes } from '../../modules/excel/answerKeyExcelMirror';
import type { Question } from '../../types/question';
import type { ExamVariant } from '../../types/examVariant';
import type { AnswerKeyBundle } from '../../types/answerKey';

export interface BuildExportBundleInput {
  examTitle: string;
  questions: Question[];
  variants: ExamVariant[];
  answerKeyBundle: AnswerKeyBundle;
}

/** Đóng gói N file PDF đề thi + file đáp án (json/xlsx) thành 1 file zip để tải xuống. */
export async function buildExportBundle(input: BuildExportBundleInput): Promise<Blob> {
  const zip = new JSZip();

  for (const variant of input.variants) {
    const printable = toPrintableQuestions(variant, input.questions);
    const examPdfBytes = await generateExamPaperPdf({
      examTitle: input.examTitle,
      examCode: variant.examCode,
      questions: printable,
    });
    zip.file(`de-thi_${variant.examCode}.pdf`, examPdfBytes);

    const bubbleSheetBytes = await generateBubbleSheetPdf({
      examTitle: input.examTitle,
      examCode: variant.examCode,
      totalQuestions: variant.questionOrder.length,
    });
    zip.file(`phieu-tra-loi_${variant.examCode}.pdf`, bubbleSheetBytes);
  }

  zip.file('dap-an.json', JSON.stringify(input.answerKeyBundle, null, 2));
  zip.file('dap-an.xlsx', exportAnswerKeyToXlsxBytes(input.answerKeyBundle));

  return zip.generateAsync({ type: 'blob' });
}
