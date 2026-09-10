import type { AnswerKeyBundle } from '../../types/answerKey';
import type { RosterEntry } from '../../types/roster';
import type { GradingResult, QuestionResult } from '../../types/gradingResult';

export interface ManualReviewInput {
  examCode: string | null;
  mssv: string | null;
  /** Vị trí câu -> các chữ cái đáp án do giáo viên chọn tay (mảng rỗng = để trống, có thể chọn nhiều). */
  questionOverrides: Record<number, string[]>;
}

const MAX_SCORE = 10;

/** Tính lại 1 GradingResult từ đáp án thô (rawAnswers) + lựa chọn tay của giáo viên (mã đề/MSSV/từng câu nghi ngờ). */
export function computeManualReview(
  result: GradingResult,
  input: ManualReviewInput,
  answerKeyBundle: AnswerKeyBundle,
  rosterByMssv: Map<string, RosterEntry>,
): GradingResult {
  const examVariant = input.examCode
    ? answerKeyBundle.variants.find((v) => v.examCode === input.examCode)
    : undefined;
  const rosterEntry = input.mssv ? rosterByMssv.get(input.mssv) : undefined;

  const rawByPosition = new Map(result.rawAnswers.map((a) => [a.position, a]));

  const questionResults: QuestionResult[] = [];
  let correctCount = 0;

  if (examVariant) {
    for (const answer of examVariant.answers) {
      const hasOverride = Object.prototype.hasOwnProperty.call(input.questionOverrides, answer.position);
      const raw = rawByPosition.get(answer.position);
      const detectedLetters = hasOverride ? input.questionOverrides[answer.position] : (raw?.letters ?? []);
      const isCorrect = detectedLetters.length === 1 && detectedLetters[0] === answer.correctLetter;
      if (isCorrect) correctCount++;
      questionResults.push({
        position: answer.position,
        detectedLetters,
        correctLetter: answer.correctLetter,
        isCorrect,
        ambiguous: hasOverride ? false : (raw?.ambiguous ?? true),
        manuallyEdited: hasOverride,
      });
    }
  }

  const totalQuestions = examVariant?.answers.length ?? result.totalQuestions;
  const score =
    examVariant && totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * MAX_SCORE * 100) / 100 : null;
  const lowConfidenceCount = questionResults.filter((q) => q.ambiguous).length;

  const flags = {
    ...result.flags,
    examCodeNotFound: !input.examCode || !examVariant,
    examCodeAmbiguous: false,
    mssvNotFound: !input.mssv || !rosterEntry,
    mssvAmbiguous: false,
    lowConfidenceCount,
  };

  // Sau khi giáo viên đã xem/chỉnh tay, không còn để cờ "lệch marker góc" chặn kết quả mãi mãi —
  // chỉ còn phụ thuộc các điều kiện có thể sửa được (mã đề, MSSV, câu còn nghi ngờ).
  const needsManualReview = flags.examCodeNotFound || flags.mssvNotFound || lowConfidenceCount > 0;

  return {
    ...result,
    mssv: input.mssv,
    hoTen: rosterEntry?.hoTen ?? null,
    examCode: input.examCode,
    score,
    correctCount,
    totalQuestions,
    questionResults,
    flags,
    needsManualReview,
    manuallyReviewed: true,
  };
}
