import { fisherYatesShuffle, mulberry32 } from './prng';
import { letterAt } from '../../lib/optionLetters';
import { CURRENT_TEMPLATE_VERSION } from '../pdf-export/bubbleSheetTemplate';
import { questionHasOptionCrossReference, optionReferencesOtherLetter, rewriteOptionTextReferences } from './optionCrossReference';
import type { Question, QuestionOption } from '../../types/question';
import type { ExamVariant } from '../../types/examVariant';
import type { AnswerKeyBundle, AnswerKeyVariant } from '../../types/answerKey';

export type CrossReferenceStrategy = 'lock' | 'rewrite' | 'partition';

export interface GenerateVariantsOptions {
  count: number;
  startCode: number;
  examTitle: string;
  /**
   * Cách xử lý câu có đáp án nhắc tới chữ cái đáp án khác (vd "Cả A và B đều đúng") khi trộn đề —
   * mặc định 'lock'.
   *   - 'lock': giữ nguyên thứ tự đáp án gốc của câu đó (an toàn tuyệt đối, không cần kiểm tra gì
   *     thêm, đổi lại câu đó giảm chống copy giữa các mã đề).
   *   - 'rewrite': vẫn xáo TOÀN BỘ đáp án bình thường như mọi câu khác, rồi TỰ CẬP NHẬT lại chữ cái
   *     được nhắc tới cho khớp vị trí mới.
   *   - 'partition': xáo RIÊNG 2 nhóm — các đáp án "đơn" (không nhắc chữ cái nào khác) xáo với nhau
   *     rồi xếp lên ĐẦU, các đáp án "ghép" (có nhắc chữ cái khác, vd "Cả A và B đều đúng") xáo riêng
   *     với nhau rồi xếp xuống CUỐI, sau đó chữ cái được nhắc tới trong đáp án ghép được TỰ CẬP NHẬT
   *     theo vị trí mới của đáp án đơn — tránh trường hợp đáp án ghép bị xáo lên trước chính đáp án
   *     nó đang nhắc tới (đọc tự nhiên hơn 'rewrite').
   * Cả 'rewrite' và 'partition' đều dựa trên quy tắc nhận diện heuristic, không bắt được MỌI cách
   * diễn đạt, nên vẫn cần giáo viên tự mở lại đề đã tạo để kiểm tra trước khi in/phát cho sinh viên.
   */
  crossReferenceStrategy?: CrossReferenceStrategy;
}

export interface GenerateVariantsResult {
  variants: ExamVariant[];
  answerKeyBundle: AnswerKeyBundle;
  usedQuestions: Question[];
}

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h || 1;
}

/** Trộn ngẫu nhiên thứ tự câu hỏi và thứ tự đáp án mỗi câu, sinh N bộ đề + đáp án tương ứng. */
export function generateVariants(
  questions: Question[],
  options: GenerateVariantsOptions,
): GenerateVariantsResult {
  const usedQuestions = questions.filter(
    (q) => q.parseIssues.length === 0 && q.correctOptionId !== null,
  );
  if (usedQuestions.length === 0) {
    throw new Error('Không có câu hỏi hợp lệ nào để trộn đề');
  }
  const questionById = new Map(usedQuestions.map((q) => [q.id, q]));
  const maxOptionsPerQuestion = Math.max(...usedQuestions.map((q) => q.options.length));
  const crossReferenceStrategy = options.crossReferenceStrategy ?? 'lock';

  const variants: ExamVariant[] = [];
  const answerKeyVariants: AnswerKeyVariant[] = [];

  for (let i = 0; i < options.count; i++) {
    const examCode = String(options.startCode + i);
    const rng = mulberry32(hashSeed(examCode));
    const questionOrder = fisherYatesShuffle(usedQuestions, rng).map((q) => q.id);
    const optionOrderByQuestion: Record<string, string[]> = {};
    const optionLetterRewrites: Record<string, Record<string, string>> = {};
    const answers: AnswerKeyVariant['answers'] = [];

    questionOrder.forEach((qId, index) => {
      const question = questionById.get(qId)!;
      const hasCrossReference = questionHasOptionCrossReference(question.options);
      const useLock = hasCrossReference && crossReferenceStrategy === 'lock';
      const usePartition = hasCrossReference && crossReferenceStrategy === 'partition';

      // Câu có đáp án nhắc tới chữ cái đáp án khác (vd "Cả A và B đều đúng"): nếu chọn "lock" thì
      // GIỮ NGUYÊN thứ tự đáp án gốc — nếu xáo, chữ cái được nhắc tới sẽ trỏ sai sang đáp án khác,
      // làm câu hỏi sai nghĩa (xem optionCrossReference.ts). Nếu chọn "rewrite" thì xáo TOÀN BỘ đáp
      // án bình thường. Nếu chọn "partition" thì xáo RIÊNG đáp án đơn (lên đầu) và đáp án ghép
      // (xuống cuối) — cả "rewrite" và "partition" đều tự sửa lại chữ cái tham chiếu bên dưới.
      let shuffledOptions: QuestionOption[];
      if (useLock) {
        shuffledOptions = question.options;
      } else if (usePartition) {
        const singles = question.options.filter((o) => !optionReferencesOtherLetter(o));
        const combining = question.options.filter((o) => optionReferencesOtherLetter(o));
        shuffledOptions = [...fisherYatesShuffle(singles, rng), ...fisherYatesShuffle(combining, rng)];
      } else {
        shuffledOptions = fisherYatesShuffle(question.options, rng);
      }
      optionOrderByQuestion[qId] = shuffledOptions.map((o) => o.id);

      let letterMap: Record<string, string> | null = null;
      if (hasCrossReference && !useLock) {
        letterMap = {};
        question.options.forEach((orig, origIdx) => {
          const newIdx = shuffledOptions.findIndex((o) => o.id === orig.id);
          letterMap![letterAt(origIdx)] = letterAt(newIdx);
        });
        optionLetterRewrites[qId] = letterMap;
      }

      const correctIndex = shuffledOptions.findIndex((o) => o.id === question.correctOptionId);
      // Với mỗi chữ cái (A, B, C...) ở mã đề NÀY, ghi lại đáp án đó là đáp án thứ mấy trong danh
      // sách GỐC (trước khi xáo) của câu hỏi — để so được "chọn cùng 1 đáp án sai" giữa các mã đề
      // khác nhau sau này (xem AnswerKeyAnswer.optionOriginalIndexByLetter, detectCollusion.ts).
      const optionOriginalIndexByLetter: Record<string, number> = {};
      shuffledOptions.forEach((o, k) => {
        optionOriginalIndexByLetter[letterAt(k)] = question.options.findIndex((orig) => orig.id === o.id);
      });

      const rawCorrectText = shuffledOptions[correctIndex]?.text ?? '';
      const correctOptionText = letterMap ? rewriteOptionTextReferences(rawCorrectText, letterMap) : rawCorrectText;

      answers.push({
        position: index + 1,
        correctLetter: letterAt(correctIndex),
        originalQuestionId: question.id,
        originalQuestionIndex: question.originalIndex,
        questionText: question.text,
        correctOptionText,
        optionOriginalIndexByLetter,
      });
    });

    variants.push({
      examCode,
      variantIndex: i,
      questionOrder,
      optionOrderByQuestion,
      optionLetterRewrites: Object.keys(optionLetterRewrites).length > 0 ? optionLetterRewrites : undefined,
      createdAt: new Date().toISOString(),
    });
    answerKeyVariants.push({ examCode, answers });
  }

  return {
    variants,
    usedQuestions,
    answerKeyBundle: {
      schemaVersion: 1,
      examTitle: options.examTitle,
      createdAt: new Date().toISOString(),
      totalQuestions: usedQuestions.length,
      maxOptionsPerQuestion,
      templateVersion: CURRENT_TEMPLATE_VERSION,
      variants: answerKeyVariants,
    },
  };
}
