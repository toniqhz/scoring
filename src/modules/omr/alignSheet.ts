import { getCornerMarkersFor, mmToPx, type MarkerId, type TemplateGeometry } from '../pdf-export/bubbleSheetTemplate';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CvNamespace = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CvMat = any;

/** Tọa độ TÂM (không phải góc) của mỗi marker trong không gian mẫu, theo px ở `dpi` cho trước. */
function markerCenterPx(geometry: TemplateGeometry, id: MarkerId, dpi: number): { x: number; y: number } {
  const marker = getCornerMarkersFor(geometry).find((m) => m.id === id)!;
  const centerXmm = marker.topLeft.xMm + marker.sizeMm / 2;
  const centerYmm = marker.topLeft.yMm + marker.sizeMm / 2;
  return { x: mmToPx(centerXmm, dpi), y: mmToPx(centerYmm, dpi) };
}

const MARKER_MIN_REL_AREA = 0.0006;
const MARKER_MAX_REL_AREA = 0.015;
const MARKER_MIN_ASPECT = 0.6;
const MARKER_MAX_ASPECT = 1.4;
/** Độ sáng xám (0-255) tối thiểu tại tâm 1 candidate để coi là "rỗng" (nền giấy trắng, không có
 * mực). Marker đặc luôn cho giá trị thấp (tối, gần 0) tại đúng tâm; marker rỗng cho giá trị cao
 * (sáng, gần 255) vì tâm chỉ là giấy trắng. */
const HOLLOW_CENTER_MIN_INTENSITY = 150;

export interface AlignResult {
  /** Ảnh grayscale đã warp về đúng khung mẫu + nhị phân hóa lại (nền đen, nét mực = trắng/255). Cần .delete() sau khi dùng. */
  warped: CvMat | null;
  ok: boolean;
}

interface MarkerCandidate {
  cx: number;
  cy: number;
  area: number;
}

function distance(a: MarkerCandidate, b: MarkerCandidate): number {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy);
}

/** Gộp các candidate gần trùng nhau (do 1 hình vuông đôi khi sinh ra 2 contour lồng sát nhau, hoặc
 * viền + lỗ rỗng của cùng 1 marker rỗng) thành 1 đại diện — nếu không, các bước phân loại phía sau
 * sẽ bị nhiễu bởi các bản sao gần nhau. */
function dedupeCandidates(candidates: MarkerCandidate[], epsilonPx: number): MarkerCandidate[] {
  const result: MarkerCandidate[] = [];
  for (const c of candidates) {
    if (!result.some((r) => distance(r, c) < epsilonPx)) result.push(c);
  }
  return result;
}

function findSquareCandidates(cv: CvNamespace, thresh: CvMat, imageArea: number): MarkerCandidate[] {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  const candidates: MarkerCandidate[] = [];
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    const relArea = area / imageArea;
    if (relArea > MARKER_MIN_REL_AREA && relArea < MARKER_MAX_REL_AREA) {
      const rect = cv.boundingRect(cnt);
      const aspect = rect.width / rect.height;
      if (aspect > MARKER_MIN_ASPECT && aspect < MARKER_MAX_ASPECT) {
        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.04 * peri, true);
        if (approx.rows === 4) {
          const m = cv.moments(cnt);
          if (m.m00 !== 0) {
            candidates.push({ cx: m.m10 / m.m00, cy: m.m01 / m.m00, area });
          }
        }
        approx.delete();
      }
    }
    cnt.delete();
  }
  contours.delete();
  hierarchy.delete();
  return candidates;
}

/**
 * Độ sáng trung bình (0-255, ảnh XÁM GỐC trước khi nhị phân hóa) tại 1 vùng nhỏ quanh tâm
 * candidate — kích thước vùng lấy mẫu tính theo chính diện tích đo được của candidate đó (không
 * giả định tỉ lệ px/mm cố định), nên vẫn đúng dù ảnh chụp nghiêng khiến các góc có độ phóng đại
 * khác nhau.
 *
 * QUAN TRỌNG: phải lấy mẫu trên ẢNH XÁM GỐC, KHÔNG lấy trên ảnh đã adaptiveThreshold — vì
 * adaptiveThreshold so mỗi điểm ảnh với TRUNG BÌNH CỤC BỘ quanh nó; một vùng đen ĐẶC lớn (như tâm
 * marker góc) có trung bình cục bộ CŨNG đen, nên bị đọc nhầm thành "nền" (rỗng) dù thực tế là mực
 * đặc — mọi marker đặc sẽ trông "rỗng" ở tâm nếu lấy mẫu trên ảnh đã threshold, khiến không thể
 * phân biệt marker rỗng thật với lỗi này. Trên ảnh xám gốc thì không có vấn đề đó: mực đặc luôn
 * cho giá trị xám thấp (tối) bất kể vùng xung quanh.
 */
function sampleCenterMeanIntensity(cv: CvNamespace, gray: CvMat, candidate: MarkerCandidate): number {
  const probeSizePx = Math.max(3, Math.round(Math.sqrt(candidate.area) * 0.3));
  const half = Math.floor(probeSizePx / 2);
  const x0 = Math.max(0, Math.round(candidate.cx) - half);
  const y0 = Math.max(0, Math.round(candidate.cy) - half);
  const w = Math.min(gray.cols - x0, probeSizePx);
  const h = Math.min(gray.rows - y0, probeSizePx);
  if (w <= 0 || h <= 0) return 255;
  const roi = gray.roi(new cv.Rect(x0, y0, w, h));
  const meanVal = cv.mean(roi)[0];
  roi.delete();
  return meanVal;
}

/**
 * Gán vai trò 4 góc THEO VỊ TRÍ trong ảnh chụp (không biết/không sửa được chiều thật) — dùng khi
 * không có marker rỗng nào (vd version 1). Nếu ảnh bị lật 180°/xoay 90°/270°, cách này sẽ gán SAI
 * vai trò một cách "tự tin" (không báo lỗi) vì 4 marker giống hệt nhau, không mang thông tin
 * chiều — ảnh chụp/scan lệch chiều với version này sẽ chấm sai, không có cách khắc phục.
 */
function pickCornersByPosition(candidates: MarkerCandidate[]): MarkerCandidate[] | null {
  if (candidates.length < 4) return null;
  const topLeft = [...candidates].sort((a, b) => a.cx + a.cy - (b.cx + b.cy))[0];
  const bottomRight = [...candidates].sort((a, b) => b.cx + b.cy - (a.cx + a.cy))[0];
  const topRight = [...candidates].sort((a, b) => a.cy - a.cx - (b.cy - b.cx))[0];
  const bottomLeft = [...candidates].sort((a, b) => b.cy - b.cx - (a.cy - a.cx))[0];
  return [topLeft, topRight, bottomLeft, bottomRight];
}

/**
 * Gán vai trò 4 góc bằng cách tìm marker RỖNG (kiểm tra mực ngay tại tâm từng candidate — không so
 * sánh candidate này với candidate khác) — đây là "góc thật" đã biết trước theo geometry
 * (hollowCornerId). 3 góc còn lại suy ra từ khoảng cách tới góc rỗng đó: cạnh rộng trang (210mm)
 * NGẮN HƠN cạnh cao trang (297mm), và đường chéo dài nhất — thứ tự gần/vừa/xa này không đổi bất
 * kể ảnh xoay/lật hướng nào hay bị chụp nghiêng phối cảnh thế nào (khác với cách so DIỆN TÍCH giữa
 * các marker — bị ảnh chụp nghiêng làm sai vì marker gần camera luôn đo to hơn marker xa, bất kể in
 * to/nhỏ thế nào; cách kiểm tra RỖNG/ĐẶC ở đây chỉ nhìn vào chính candidate đó nên không bị vậy).
 */
/** Với 1 góc đã biết danh tính (vd 'top-left'), 3 góc còn lại quan hệ với nó thế nào: đối diện
 * qua đường chéo (xa nhất), kề qua cạnh RỘNG trang 210mm (gần hơn), kề qua cạnh CAO trang 297mm
 * (xa hơn cạnh rộng nhưng vẫn gần hơn đường chéo). Định nghĩa tường minh cho cả 4 trường hợp thay
 * vì hard-code riêng cho 'top-left', để nếu 1 version sau đổi hollowCornerId sang góc khác vẫn đúng. */
const CORNER_RELATIONS: Record<MarkerId, { diagonal: MarkerId; viaWidth: MarkerId; viaHeight: MarkerId }> = {
  'top-left': { diagonal: 'bottom-right', viaWidth: 'top-right', viaHeight: 'bottom-left' },
  'top-right': { diagonal: 'bottom-left', viaWidth: 'top-left', viaHeight: 'bottom-right' },
  'bottom-left': { diagonal: 'top-right', viaWidth: 'bottom-right', viaHeight: 'top-left' },
  'bottom-right': { diagonal: 'top-left', viaWidth: 'bottom-left', viaHeight: 'top-right' },
};

function pickCornersByHollowMark(
  cv: CvNamespace,
  gray: CvMat,
  candidatesRaw: MarkerCandidate[],
  hollowCornerId: MarkerId,
  epsilonPx: number,
): MarkerCandidate[] | null {
  const candidates = dedupeCandidates(candidatesRaw, epsilonPx);
  if (candidates.length < 4) return null;

  let hollowCandidate: MarkerCandidate | null = null;
  let highestIntensity = -1;
  for (const c of candidates) {
    const intensity = sampleCenterMeanIntensity(cv, gray, c);
    if (intensity > highestIntensity) {
      highestIntensity = intensity;
      hollowCandidate = c;
    }
  }
  if (!hollowCandidate || highestIntensity < HOLLOW_CENTER_MIN_INTENSITY) return null;

  const others = candidates.filter((c) => c !== hollowCandidate);
  if (others.length < 3) return null;
  const byDist = others.map((c) => ({ c, d: distance(hollowCandidate!, c) })).sort((a, b) => a.d - b.d);

  const rel = CORNER_RELATIONS[hollowCornerId];
  const diagonalCandidate = byDist[byDist.length - 1].c; // xa nhất = đường chéo
  const rest = byDist.slice(0, byDist.length - 1);
  const viaWidthCandidate = rest[0].c; // gần nhất trong số còn lại = cạnh ngắn (rộng trang)
  const viaHeightCandidate = rest[rest.length - 1].c; // xa nhất trong số còn lại = cạnh dài (cao trang)

  const roleByMarkerId = new Map<MarkerId, MarkerCandidate>([
    [hollowCornerId, hollowCandidate],
    [rel.diagonal, diagonalCandidate],
    [rel.viaWidth, viaWidthCandidate],
    [rel.viaHeight, viaHeightCandidate],
  ]);

  return [
    roleByMarkerId.get('top-left')!,
    roleByMarkerId.get('top-right')!,
    roleByMarkerId.get('bottom-left')!,
    roleByMarkerId.get('bottom-right')!,
  ];
}

/**
 * Nhận diện 4 marker góc, chỉnh phối cảnh ảnh scan/chụp về đúng khung tọa độ mẫu
 * (bubbleSheetTemplate.ts), rồi nhị phân hóa lại. Trả về ok=false nếu không tìm đủ 4 marker.
 */
export function alignAndThreshold(
  cv: CvNamespace,
  srcRgbaOrGray: CvMat,
  canonicalWidthPx: number,
  canonicalHeightPx: number,
  dpi: number,
  geometry: TemplateGeometry,
): AlignResult {
  const gray = new cv.Mat();
  if (srcRgbaOrGray.channels() > 1) {
    cv.cvtColor(srcRgbaOrGray, gray, cv.COLOR_RGBA2GRAY);
  } else {
    srcRgbaOrGray.copyTo(gray);
  }

  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

  const thresh = new cv.Mat();
  cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 35, 10);
  blurred.delete();

  const imageArea = srcRgbaOrGray.rows * srcRgbaOrGray.cols;
  const candidates = findSquareCandidates(cv, thresh, imageArea);

  // Ngưỡng gộp trùng: 1% cạnh ngắn hơn của ảnh — đủ lớn để gộp các contour lồng sát nhau của cùng
  // 1 hình vuông, đủ nhỏ để không gộp nhầm 2 marker góc khác nhau (cách nhau hàng trăm px).
  const epsilonPx = Math.min(srcRgbaOrGray.cols, srcRgbaOrGray.rows) * 0.01;
  const corners = geometry.hollowCornerId
    ? pickCornersByHollowMark(cv, gray, candidates, geometry.hollowCornerId, epsilonPx)
    : pickCornersByPosition(candidates);
  thresh.delete();

  if (!corners) {
    gray.delete();
    return { warped: null, ok: false };
  }

  const srcPointsFlat = corners.flatMap((p) => [p.cx, p.cy]);
  // Điểm đích PHẢI là vị trí thật của TÂM marker trong không gian mẫu (marker cách mép trang
  // MARKER_MARGIN_MM, không nằm ở đúng góc (0,0)) — nếu map nhầm về góc trang sẽ làm lệch toàn
  // bộ phép biến đổi và mọi tọa độ ô tròn tính sau đó đều sai.
  const dstPointsFlat = [
    markerCenterPx(geometry, 'top-left', dpi),
    markerCenterPx(geometry, 'top-right', dpi),
    markerCenterPx(geometry, 'bottom-left', dpi),
    markerCenterPx(geometry, 'bottom-right', dpi),
  ].flatMap((p) => [p.x, p.y]);
  const srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, srcPointsFlat);
  const dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, dstPointsFlat);
  const transform = cv.getPerspectiveTransform(srcMat, dstMat);

  const warpedGray = new cv.Mat();
  cv.warpPerspective(gray, warpedGray, transform, new cv.Size(canonicalWidthPx, canonicalHeightPx));
  srcMat.delete();
  dstMat.delete();
  transform.delete();
  gray.delete();

  const warpedThresh = new cv.Mat();
  cv.adaptiveThreshold(
    warpedGray,
    warpedThresh,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY_INV,
    35,
    10,
  );
  warpedGray.delete();

  return { warped: warpedThresh, ok: true };
}
