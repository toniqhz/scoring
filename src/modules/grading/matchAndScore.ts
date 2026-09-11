import type { AnswerKeyBundle } from '../../types/answerKey';
import type { RosterEntry } from '../../types/roster';
import type { GradingResult, QuestionResult } from '../../types/gradingResult';
import type { OmrResultMessage } from '../omr/types';

export interface MatchAndScoreInput {
  sheetId: string;
  fileName: string;
  previewUrl?: string | null;
  omrResult: OmrResultMessage;
  answerKeyBundle: AnswerKeyBundle;
  rosterByMssv: Map<string, RosterEntry>;
  maxScore?: number;
}

/** Đối chiếu kết quả OMR thô với đáp án (mã đề) + danh sách lớp (MSSV), tính điểm và gắn cờ nghi ngờ. */
export function matchAndScore(input: MatchAndScoreInput): GradingResult {
  const { omrResult, answerKeyBundle, rosterByMssv } = input;
  const maxScore = input.maxScore ?? 10;

  const examVariant = omrResult.examCode
    ? answerKeyBundle.variants.find((v) => v.examCode === omrResult.examCode)
    : undefined;
  const rosterEntry = omrResult.mssv ? rosterByMssv.get(omrResult.mssv) : undefined;

  const questionResults: QuestionResult[] = [];
  let correctCount = 0;

  if (examVariant) {
    const detectedByPosition = new Map(omrResult.answers.map((a) => [a.position, a]));
    for (const answer of examVariant.answers) {
      const detected = detectedByPosition.get(answer.position);
      const detectedLetters = detected?.letters ?? [];
      const isCorrect = detectedLetters.length === 1 && detectedLetters[0] === answer.correctLetter;
      if (isCorrect) correctCount++;
      questionResults.push({
        position: answer.position,
        detectedLetters,
        correctLetter: answer.correctLetter,
        isCorrect,
        ambiguous: detected?.ambiguous ?? true,
      });
    }
  }

  const totalQuestions = examVariant?.answers.length ?? omrResult.answers.length;
  const score = examVariant && totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * maxScore * 100) / 100 : null;
  const lowConfidenceCount = questionResults.filter((q) => q.ambiguous).length;

  const flags = {
    alignmentFailed: omrResult.alignmentFailed,
    examCodeNotFound: !omrResult.examCode || !examVariant,
    examCodeAmbiguous: omrResult.examCodeAmbiguous,
    mssvNotFound: !omrResult.mssv || !rosterEntry,
    mssvAmbiguous: omrResult.mssvAmbiguous,
    lowConfidenceCount,
  };

  const needsManualReview =
    !omrResult.ok ||
    flags.alignmentFailed ||
    flags.examCodeNotFound ||
    flags.examCodeAmbiguous ||
    flags.mssvNotFound ||
    flags.mssvAmbiguous ||
    lowConfidenceCount > 0;

  return {
    sheetId: input.sheetId,
    fileName: input.fileName,
    previewUrl: input.previewUrl ?? null,
    mssv: omrResult.mssv,
    hoTen: rosterEntry?.hoTen ?? null,
    examCode: omrResult.examCode,
    score,
    correctCount,
    totalQuestions,
    questionResults,
    rawAnswers: omrResult.answers,
    markCount: omrResult.markedCount,
    flags,
    needsManualReview,
    processError: omrResult.error,
  };
}
