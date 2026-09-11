import type { GradingResult, QuestionResult } from '../../types/gradingResult';
import type { AnswerKeyBundle, AnswerKeyAnswer } from '../../types/answerKey';

/**
 * Phát hiện nghi vấn trùng đáp án SAI giữa các bài — so được XUYÊN SUỐT các mã đề khác nhau (đề bị
 * xáo câu hỏi/đáp án khác nhau theo mã đề, nhưng vẫn cùng 1 ngân hàng câu hỏi gốc — 2 người ngồi gần
 * nhau vẫn trao đổi được dù khác mã đề). Để so đúng, phải quy đổi câu trả lời của mỗi người về
 * "câu hỏi gốc" + "đáp án gốc" (originalQuestionIndex + optionOriginalIndexByLetter trong
 * AnswerKeyBundle) thay vì so trực tiếp theo VỊ TRÍ/CHỮ CÁI trên phiếu — vì vị trí/chữ cái chỉ có ý
 * nghĩa giống nhau khi 2 người CÙNG mã đề.
 *
 * Định nghĩa "% trùng đáp án sai" giữa 2 bài (chỉ số error-similarity chuẩn hay dùng để phát hiện
 * copy bài): trong số các câu hỏi gốc mà ÍT NHẤT 1 trong 2 người trả lời sai, bao nhiêu % 2 người
 * chọn ĐÚNG CÙNG 1 đáp án gốc sai đó. Chia theo mẫu số này (không phải tổng số câu của đề) để công
 * bằng cho cả học sinh giỏi lẫn yếu — không phụ thuộc điểm tổng, chỉ nhìn vào các câu mà ít nhất 1
 * người sai.
 *
 * File dap-an.json cũ (sinh trước khi có optionOriginalIndexByLetter) không có đủ dữ liệu để quy
 * đổi đáp án SAI về đáp án gốc — với các câu đó, chỉ so được khi 2 người CÙNG mã đề (dùng thẳng vị
 * trí + chữ cái, giống cách cũ), không so được xuyên mã đề.
 */

export interface CollusionDetectionOptions {
  /** Số câu hỏi gốc tối thiểu mà ít nhất 1 trong 2 người sai (mẫu số) mới xét — tránh báo nhầm khi mẫu số quá nhỏ. */
  minEitherWrongCount: number;
  /** Tỷ lệ trùng đáp án sai tối thiểu (0-1) để coi là nghi vấn. */
  matchRatioThreshold: number;
}

export const DEFAULT_COLLUSION_OPTIONS: CollusionDetectionOptions = {
  minEitherWrongCount: 5,
  matchRatioThreshold: 0.7,
};

export interface CollusionPairResult {
  sheetIdA: string;
  sheetIdB: string;
  mssvA: string | null;
  hoTenA: string | null;
  examCodeA: string;
  mssvB: string | null;
  hoTenB: string | null;
  examCodeB: string;
  /** Số câu hỏi gốc mà ít nhất 1 trong 2 người trả lời sai (và so được giữa 2 mã đề của họ) — mẫu số của % trùng. */
  eitherWrongCount: number;
  /** Số câu cả 2 cùng sai VÀ chọn đúng cùng 1 đáp án gốc. */
  matchingWrongCount: number;
  /** matchingWrongCount / eitherWrongCount * 100, làm tròn 1 chữ số thập phân. */
  matchPercent: number;
}

export interface CollusionGroup {
  groupId: string;
  sheetIds: string[];
  members: { sheetId: string; mssv: string | null; hoTen: string | null; examCode: string }[];
  pairs: CollusionPairResult[];
}

interface OriginalAnswerInfo {
  isCorrect: boolean;
  /** null nếu bỏ trống/tô nhiều ô (không xác định được 1 đáp án duy nhất để so). */
  comparisonKey: string | null;
}

/** Khóa để so 2 câu trả lời có "cùng 1 đáp án" hay không — ưu tiên quy về đáp án GỐC (so được xuyên
 * mã đề); nếu answer key không có optionOriginalIndexByLetter (file cũ) thì lùi về so trực tiếp
 * theo (mã đề, vị trí, chữ cái) — chỉ trùng khi 2 người CÙNG mã đề, giống hành vi cũ. */
function comparisonKeyFor(examCode: string, q: QuestionResult, entry: AnswerKeyAnswer): string | null {
  if (q.detectedLetters.length !== 1) return null;
  const letter = q.detectedLetters[0];
  const originalIndex = entry.optionOriginalIndexByLetter?.[letter];
  if (originalIndex !== undefined) return `orig:${entry.originalQuestionIndex}:${originalIndex}`;
  return `pos:${examCode}:${q.position}:${letter}`;
}

function buildByOriginalIndex(
  r: GradingResult,
  answerByPosition: Map<number, AnswerKeyAnswer>,
): Map<number, OriginalAnswerInfo> {
  const map = new Map<number, OriginalAnswerInfo>();
  for (const q of r.questionResults) {
    const entry = answerByPosition.get(q.position);
    if (!entry) continue;
    map.set(entry.originalQuestionIndex, {
      isCorrect: q.isCorrect,
      comparisonKey: comparisonKeyFor(r.examCode!, q, entry),
    });
  }
  return map;
}

function comparePair(
  a: GradingResult,
  b: GradingResult,
  answerByPositionByExamCode: Map<string, Map<number, AnswerKeyAnswer>>,
  options: CollusionDetectionOptions,
): CollusionPairResult | null {
  const aAnswers = answerByPositionByExamCode.get(a.examCode!);
  const bAnswers = answerByPositionByExamCode.get(b.examCode!);
  if (!aAnswers || !bAnswers) return null;

  const aByOrig = buildByOriginalIndex(a, aAnswers);
  const bByOrig = buildByOriginalIndex(b, bAnswers);

  let eitherWrongCount = 0;
  let matchingWrongCount = 0;
  for (const [originalQuestionIndex, aInfo] of aByOrig) {
    const bInfo = bByOrig.get(originalQuestionIndex);
    if (!bInfo) continue;
    if (aInfo.isCorrect && bInfo.isCorrect) continue;
    eitherWrongCount++;
    if (
      !aInfo.isCorrect &&
      !bInfo.isCorrect &&
      aInfo.comparisonKey !== null &&
      aInfo.comparisonKey === bInfo.comparisonKey
    ) {
      matchingWrongCount++;
    }
  }

  if (eitherWrongCount < options.minEitherWrongCount) return null;
  const ratio = matchingWrongCount / eitherWrongCount;
  if (ratio < options.matchRatioThreshold) return null;

  return {
    sheetIdA: a.sheetId,
    sheetIdB: b.sheetId,
    mssvA: a.mssv,
    hoTenA: a.hoTen,
    examCodeA: a.examCode!,
    mssvB: b.mssv,
    hoTenB: b.hoTen,
    examCodeB: b.examCode!,
    eitherWrongCount,
    matchingWrongCount,
    matchPercent: Math.round(ratio * 1000) / 10,
  };
}

/** Union-find đơn giản để gộp các cặp nghi vấn thành từng nhóm (A-B nghi vấn, B-C nghi vấn -> gộp
 * chung nhóm {A,B,C}) — số bài trong 1 lớp thường không lớn nên không cần tối ưu path compression. */
class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    this.parent.set(x, root);
    return root;
  }

  union(x: string, y: string): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx !== ry) this.parent.set(rx, ry);
  }
}

/** Chấm điểm xong -> gọi hàm này để tìm các nhóm bài nghi vấn trùng đáp án sai — so được xuyên suốt
 * mọi mã đề (xem giải thích ở đầu file). Chỉ nhận các bài đã có mã đề + đã chấm câu hỏi (bỏ qua bài
 * lỗi/chưa xác định mã đề). */
export function detectCollusion(
  results: GradingResult[],
  answerKeyBundle: AnswerKeyBundle,
  options: CollusionDetectionOptions = DEFAULT_COLLUSION_OPTIONS,
): CollusionGroup[] {
  const answerByPositionByExamCode = new Map<string, Map<number, AnswerKeyAnswer>>();
  for (const variant of answerKeyBundle.variants) {
    answerByPositionByExamCode.set(variant.examCode, new Map(variant.answers.map((a) => [a.position, a])));
  }

  const candidates = results.filter((r) => r.examCode && r.questionResults.length > 0);

  const pairs: CollusionPairResult[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const pair = comparePair(candidates[i], candidates[j], answerByPositionByExamCode, options);
      if (pair) pairs.push(pair);
    }
  }

  const uf = new UnionFind();
  for (const p of pairs) uf.union(p.sheetIdA, p.sheetIdB);

  const sheetIdsByRoot = new Map<string, Set<string>>();
  for (const p of pairs) {
    const root = uf.find(p.sheetIdA);
    if (!sheetIdsByRoot.has(root)) sheetIdsByRoot.set(root, new Set());
    sheetIdsByRoot.get(root)!.add(p.sheetIdA);
    sheetIdsByRoot.get(root)!.add(p.sheetIdB);
  }

  const resultBySheetId = new Map(results.map((r) => [r.sheetId, r]));
  const groups: CollusionGroup[] = [];
  let groupIndex = 1;
  for (const sheetIdSet of sheetIdsByRoot.values()) {
    const sheetIds = Array.from(sheetIdSet);
    const members = sheetIds.map((id) => {
      const r = resultBySheetId.get(id)!;
      return { sheetId: id, mssv: r.mssv, hoTen: r.hoTen, examCode: r.examCode! };
    });
    const groupPairs = pairs
      .filter((p) => sheetIdSet.has(p.sheetIdA) && sheetIdSet.has(p.sheetIdB))
      .sort((a, b) => b.matchPercent - a.matchPercent);
    groups.push({ groupId: `N${groupIndex++}`, sheetIds, members, pairs: groupPairs });
  }

  groups.sort((a, b) => {
    const maxA = Math.max(...a.pairs.map((p) => p.matchPercent));
    const maxB = Math.max(...b.pairs.map((p) => p.matchPercent));
    return maxB - maxA || b.members.length - a.members.length;
  });

  return groups;
}
