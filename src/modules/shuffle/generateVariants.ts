import { fisherYatesShuffle, mulberry32 } from './prng';
import { letterAt } from '../../lib/optionLetters';
import { CURRENT_TEMPLATE_VERSION } from '../pdf-export/bubbleSheetTemplate';
import type { Question } from '../../types/question';
import type { ExamVariant } from '../../types/examVariant';
import type { AnswerKeyBundle, AnswerKeyVariant } from '../../types/answerKey';

export interface GenerateVariantsOptions {
  count: number;
  startCode: number;
  examTitle: string;
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

  const variants: ExamVariant[] = [];
  const answerKeyVariants: AnswerKeyVariant[] = [];

  for (let i = 0; i < options.count; i++) {
    const examCode = String(options.startCode + i);
    const rng = mulberry32(hashSeed(examCode));
    const questionOrder = fisherYatesShuffle(usedQuestions, rng).map((q) => q.id);
    const optionOrderByQuestion: Record<string, string[]> = {};
    const answers: AnswerKeyVariant['answers'] = [];

    questionOrder.forEach((qId, index) => {
      const question = questionById.get(qId)!;
      const shuffledOptions = fisherYatesShuffle(question.options, rng);
      optionOrderByQuestion[qId] = shuffledOptions.map((o) => o.id);
      const correctIndex = shuffledOptions.findIndex((o) => o.id === question.correctOptionId);
      answers.push({
        position: index + 1,
        correctLetter: letterAt(correctIndex),
        originalQuestionId: question.id,
        originalQuestionIndex: question.originalIndex,
        questionText: question.text,
        correctOptionText: shuffledOptions[correctIndex]?.text ?? '',
      });
    });

    variants.push({
      examCode,
      variantIndex: i,
      questionOrder,
      optionOrderByQuestion,
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
