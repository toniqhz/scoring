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

export interface MultiDecision {
  /** Các vị trí (trong mảng scores) được coi là đã tô — rỗng nếu bỏ trống, >1 nếu tô nhiều ô. */
  indices: number[];
  /** true nếu cần người xác nhận lại: tô nhiều ô, hoặc 1 ô nhưng mờ/khó phân biệt với ô kế tiếp. */
  ambiguous: boolean;
}

/**
 * Chọn TẤT CẢ ô đã tô đủ đậm trong 1 nhóm câu hỏi (không loại trừ nhau như MSSV/mã đề — sinh viên
 * có thể lỡ tô nhiều hơn 1 đáp án). Khác với `decideFromScores`: không chỉ lấy ô đậm nhất, mà lấy
 * mọi ô "cũng đã tô" để giữ lại đúng những gì đã tô trên bài, phục vụ lưu vào bảng điểm/xem lại tay.
 *
 * Thuật toán "khoảng ngắt tự nhiên" (natural break): sắp điểm giảm dần, mọi ô TRƯỚC khoảng ngắt đầu
 * tiên (2 ô liền kề chênh nhau >= AMBIGUITY_MARGIN) được coi là "đã tô". Không dùng ngưỡng tuyệt đối
 * riêng lẻ cho từng ô — ảnh chụp thật (ánh sáng không đều, ảnh mờ/nén JPEG ở 1 vùng của trang) có thể
 * đẩy nhiễu nền của TOÀN BỘ các ô trong 1 câu vượt ngưỡng tuyệt đối dù không hề tô; nếu KHÔNG tìm
 * thấy khoảng ngắt nào trong suốt danh sách (mọi ô gần bằng nhau liên tục, không ô nào nổi bật hẳn)
 * thì đây là nhiễu toàn phần — không đủ tin cậy để khẳng định ô nào đã tô, trả về rỗng (không tự gán
 * bừa 1 ô, chỉ báo cần xem lại tay) thay vì coi nhầm mọi ô là "đã tô".
 */
export function decideAnswerFromScores(scores: number[]): MultiDecision {
  const sorted = scores.map((score, i) => ({ score, i })).sort((a, b) => b.score - a.score);
  const best = sorted[0]?.score ?? -1;

  if (best < ABSOLUTE_MIN_DARKNESS) {
    return { indices: [], ambiguous: false };
  }

  let breakAt = sorted.length;
  for (let k = 1; k < sorted.length; k++) {
    if (sorted[k - 1].score - sorted[k].score >= AMBIGUITY_MARGIN) {
      breakAt = k;
      break;
    }
  }

  if (breakAt === sorted.length) {
    // Không có khoảng ngắt nào — nhiễu toàn phần, không đủ tin cậy để khẳng định ô nào đã tô.
    return { indices: [], ambiguous: true };
  }

  const indices = sorted
    .slice(0, breakAt)
    .map((s) => s.i)
    .sort((a, b) => a - b);
  // Cần xem lại tay khi: tô từ 2 ô trở lên, HOẶC chỉ 1 ô nhưng mờ/khó phân biệt với ô kế tiếp.
  const ambiguous = indices.length > 1 || sorted[0].score - sorted[1].score < AMBIGUITY_MARGIN;
  return { indices, ambiguous };
}
