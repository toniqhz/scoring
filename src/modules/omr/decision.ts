/** Ngưỡng quyết định 1 nhóm ô tròn (1 chữ số MSSV, 1 chữ số mã đề, hoặc 4 đáp án A/B/C/D của 1 câu). */
export const ABSOLUTE_MIN_DARKNESS = 0.18;
export const AMBIGUITY_MARGIN = 0.12;

export interface Decision {
  /** Vị trí (trong mảng scores) được chọn, null nếu để trống. */
  index: number | null;
  /** true nếu mờ/tô nhiều ô — cần con người xác nhận lại. */
  ambiguous: boolean;
}

/** Chọn ô đậm nhất trong 1 nhóm ô tròn loại trừ nhau (radio-group), dựa trên tỉ lệ điểm ảnh đen đo được. */
export function decideFromScores(scores: number[]): Decision {
  let bestIndex = -1;
  let best = -1;
  let secondBest = -1;
  scores.forEach((score, i) => {
    if (score > best) {
      secondBest = best;
      best = score;
      bestIndex = i;
    } else if (score > secondBest) {
      secondBest = score;
    }
  });

  if (bestIndex === -1 || best < ABSOLUTE_MIN_DARKNESS) {
    return { index: null, ambiguous: false };
  }
  const ambiguous = best - Math.max(secondBest, 0) < AMBIGUITY_MARGIN;
  return { index: bestIndex, ambiguous };
}
