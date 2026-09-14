/**
 * Ngưỡng quyết định 1 nhóm ô tròn (1 chữ số MSSV, 1 chữ số mã đề, hoặc các đáp án A/B/C.../1 câu).
 *
 * LỊCH SỬ: bản đầu dùng ngưỡng TUYỆT ĐỐI cố định (điểm đậm nhất phải >= 0.18 mới coi là "đã tô",
 * và 2 ô liền kề phải chênh nhau tuyệt đối >= 0.12 mới coi là tách biệt rõ). Kiểm tra trên ảnh scan
 * thật (test/Scan*.jpeg.pdf) cho thấy CÙNG 1 kiểu tô (bút chì/bút bi nhạt) có thể cho tỉ lệ mực đo
 * được RẤT KHÁC nhau giữa các phiếu khác nhau tuỳ độ đậm tay của từng sinh viên/điều kiện scan — có
 * phiếu ô đã tô chỉ đo được ~0.10-0.18 (dưới ngưỡng cũ, bị đọc nhầm thành BỎ TRỐNG) trong khi ô
 * KHÔNG tô trên chính phiếu đó chỉ ở mức ~0.01-0.07 — tức là biên độ TƯƠNG ĐỐI giữa ô đã tô và ô
 * chưa tô vẫn rất rõ ràng (ô đã tô đậm hơn 4-12 lần), chỉ có giá trị TUYỆT ĐỐI là thấp hơn phiếu
 * khác. Ngưỡng tuyệt đối cố định vì vậy không thể vừa bắt được các phiếu tô nhạt này vừa an toàn
 * với phiếu có nền nhiễu cao hơn (tô đậm nhưng scan bị mờ/tương phản thấp).
 *
 * Vì vậy đổi sang so sánh THEO TỈ LỆ (ratio) giữa các ô liền kề khi sắp giảm dần — bất biến theo
 * thang đo (scale-invariant), tự thích ứng với từng phiếu/từng câu thay vì 1 hằng số áp cho mọi
 * trường hợp. Chỉ giữ lại 1 ngưỡng tuyệt đối RẤT THẤP (MIN_MARK_FLOOR) để loại nhiễu gần-0 (giấy
 * trắng thật, không có gì để so sánh tỉ lệ).
 */
export const MIN_MARK_FLOOR = 0.08;
/** 2 ô liền kề (sắp giảm dần) được coi là CÙNG một "cụm đậm" nếu ô sau vẫn giữ được ít nhất tỉ lệ
 * này so với ô trước; tụt xuống dưới tỉ lệ này = tách biệt rõ rệt (ô sau nhạt hơn hẳn, không cùng
 * cụm đã tô với ô trước). Chọn 0.5 vì trên dữ liệu thực tế: các cặp "vẫn cùng cụm" (tô nhiều ô) đo
 * được tỉ lệ ~0.85-0.96, còn các cặp "tách biệt rõ" (1 ô đã tô rõ vs ô chưa tô) đo được ~0.04-0.26
 * — có khoảng trống lớn (0.3-0.8) ở giữa để chọn ngưỡng an toàn. */
export const RELATIVE_DROP_RATIO = 0.5;

/** true nếu điểm liền sau (đã sắp giảm dần) tụt hẳn khỏi điểm liền trước — tức là KHÔNG còn "cùng
 * cụm đậm" nữa. An toàn với `prev <= 0` (tránh chia 0). */
function isSeparated(prev: number, cur: number): boolean {
  if (prev <= 0) return true;
  return cur / prev < RELATIVE_DROP_RATIO;
}

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

  if (bestIndex === -1 || best < MIN_MARK_FLOOR) {
    return { index: null, ambiguous: false };
  }
  const ambiguous = !isSeparated(best, Math.max(secondBest, 0));
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
 * tiên (2 ô liền kề tách biệt rõ theo TỈ LỆ — xem `isSeparated`/`RELATIVE_DROP_RATIO`) được coi là
 * "đã tô". Không dùng ngưỡng tuyệt đối riêng lẻ cho từng ô — ảnh chụp thật (ánh sáng không đều, ảnh
 * mờ/nén JPEG ở 1 vùng của trang, hoặc đơn giản là 1 phiếu được tô nhạt tay hơn phiếu khác) có thể
 * đẩy TOÀN BỘ mức đậm của 1 phiếu lên/xuống so với phiếu khác dù tỉ lệ TƯƠNG ĐỐI giữa ô đã tô và ô
 * chưa tô trên CÙNG phiếu đó vẫn rất rõ ràng; nếu KHÔNG tìm thấy khoảng ngắt nào trong suốt danh
 * sách (mọi ô gần bằng nhau liên tục, không ô nào nổi bật hẳn) thì đây là nhiễu toàn phần — không đủ
 * tin cậy để khẳng định ô nào đã tô, trả về rỗng (không tự gán bừa 1 ô, chỉ báo cần xem lại tay)
 * thay vì coi nhầm mọi ô là "đã tô".
 */
export function decideAnswerFromScores(scores: number[]): MultiDecision {
  const sorted = scores.map((score, i) => ({ score, i })).sort((a, b) => b.score - a.score);
  const best = sorted[0]?.score ?? -1;

  if (best < MIN_MARK_FLOOR) {
    return { indices: [], ambiguous: false };
  }

  let breakAt = sorted.length;
  for (let k = 1; k < sorted.length; k++) {
    if (isSeparated(sorted[k - 1].score, sorted[k].score)) {
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
  // Cần xem lại tay khi tô từ 2 ô trở lên — 1 ô duy nhất đã đủ điều kiện "tách biệt rõ" (đó là lý
  // do có khoảng ngắt ngay sau nó) nên không cần thêm điều kiện "gần đáp án kế tiếp" nữa.
  const ambiguous = indices.length > 1;
  return { indices, ambiguous };
}
