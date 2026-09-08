import type { Question, PrintableQuestion } from '../../types/question';
import type { ExamVariant } from '../../types/examVariant';
import type { AnswerLetter } from '../../types/answerKey';

const LETTERS: AnswerLetter[] = ['A', 'B', 'C', 'D'];

/** Chuyển 1 biến thể đề (thứ tự đã trộn) + ngân hàng câu hỏi thành nội dung để in — không có đáp án đúng. */
export function toPrintableQuestions(variant: ExamVariant, questions: Question[]): PrintableQuestion[] {
  const questionById = new Map(questions.map((q) => [q.id, q]));
  return variant.questionOrder.map((qId) => {
    const question = questionById.get(qId)!;
    const optionById = new Map(question.options.map((o) => [o.id, o]));
    const orderedOptionIds = variant.optionOrderByQuestion[qId];
    return {
      text: question.text,
      options: orderedOptionIds.map((oId, i) => ({
        letter: LETTERS[i],
        text: optionById.get(oId)!.text,
      })),
    };
  });
}
