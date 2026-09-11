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
// Cụm ô định hướng nhỏ hơn nhiều so với marker góc (4mm vs 10mm cạnh) — dải diện tích riêng, thấp
// hơn hẳn MARKER_MIN_REL_AREA để không lẫn với marker góc thật.
const ORIENTATION_MARK_MIN_REL_AREA = 0.00008;
const ORIENTATION_MARK_MAX_REL_AREA = 0.0005;
const SQUARE_MIN_ASPECT = 0.6;
const SQUARE_MAX_ASPECT = 1.4;
/** Bán kính tìm ô định hướng quanh 1 candidate marker góc, tính theo BẢN THÂN kích thước đo được
 * của candidate đó (sqrt(area)) — không giả định tỉ lệ px/mm cố định, nên vẫn đúng dù ảnh chụp
 * nghiêng khiến các góc có độ phóng đại khác nhau (giống cách tính probe size trước đây). */
const ORIENTATION_SEARCH_RADIUS_FACTOR = 4;

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

/** Gộp các candidate gần trùng nhau (do 1 hình vuông đôi khi sinh ra 2 contour lồng sát nhau) thành
 * 1 đại diện — nếu không, các bước phân loại phía sau sẽ bị nhiễu bởi các bản sao gần nhau. */
function dedupeCandidates(candidates: MarkerCandidate[], epsilonPx: number): MarkerCandidate[] {
  const result: MarkerCandidate[] = [];
  for (const c of candidates) {
    if (!result.some((r) => distance(r, c) < epsilonPx)) result.push(c);
  }
  return result;
}

/** Tìm mọi contour hình vuông (4 đỉnh, tỉ lệ cạnh gần 1:1) trong dải diện tích tương đối cho trước
 * — dùng chung cho cả marker góc (to) lẫn cụm ô định hướng (nhỏ), chỉ khác dải diện tích truyền vào. */
function findSquareCandidates(
  cv: CvNamespace,
  thresh: CvMat,
  imageArea: number,
  minRelArea: number,
  maxRelArea: number,
): MarkerCandidate[] {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  const candidates: MarkerCandidate[] = [];
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    const relArea = area / imageArea;
    if (relArea > minRelArea && relArea < maxRelArea) {
      const rect = cv.boundingRect(cnt);
      const aspect = rect.width / rect.height;
      if (aspect > SQUARE_MIN_ASPECT && aspect < SQUARE_MAX_ASPECT) {
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
 * Gán vai trò 4 góc THEO VỊ TRÍ trong ảnh chụp (không biết/không sửa được chiều thật) — dùng khi
 * không có cụm ô định hướng nào (vd version 1). Nếu ảnh bị lật 180°/xoay 90°/270°, cách này sẽ gán SAI
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

/** Với 1 góc đã biết danh tính (vd 'top-left'), 3 góc còn lại quan hệ với nó thế nào: đối diện
 * qua đường chéo (xa nhất), kề qua cạnh RỘNG trang 210mm (gần hơn), kề qua cạnh CAO trang 297mm
 * (xa hơn cạnh rộng nhưng vẫn gần hơn đường chéo). Định nghĩa tường minh cho cả 4 trường hợp thay
 * vì hard-code riêng cho 'top-left', để nếu 1 version sau đổi cornerId sang góc khác vẫn đúng. */
const CORNER_RELATIONS: Record<MarkerId, { diagonal: MarkerId; viaWidth: MarkerId; viaHeight: MarkerId }> = {
  'top-left': { diagonal: 'bottom-right', viaWidth: 'top-right', viaHeight: 'bottom-left' },
  'top-right': { diagonal: 'bottom-left', viaWidth: 'top-left', viaHeight: 'bottom-right' },
  'bottom-left': { diagonal: 'top-right', viaWidth: 'bottom-right', viaHeight: 'top-left' },
  'bottom-right': { diagonal: 'top-left', viaWidth: 'bottom-left', viaHeight: 'top-right' },
};

/** Đếm số ô định hướng nằm "gần" 1 candidate marker góc — bán kính tìm tính theo kích thước đo
 * được của chính candidate đó (sqrt(area)), không phải hằng số px cố định, nên vẫn đúng dù ảnh
 * chụp nghiêng khiến các góc có độ phóng đại khác nhau. */
function countNearbyOrientationMarks(corner: MarkerCandidate, orientationCandidates: MarkerCandidate[]): number {
  const searchRadiusPx = Math.sqrt(corner.area) * ORIENTATION_SEARCH_RADIUS_FACTOR;
  return orientationCandidates.filter((o) => distance(corner, o) < searchRadiusPx).length;
}

/**
 * Gán vai trò 4 góc bằng cách tìm góc nào có cụm ô định hướng cạnh nó (đếm số ô định hướng GẦN mỗi
 * candidate marker góc — không so sánh kích thước/độ sáng giữa các candidate với nhau) — đây là
 * "góc thật" đã biết trước theo geometry (orientationMarks.cornerId). 3 góc còn lại suy ra từ
 * khoảng cách tới góc đó: cạnh rộng trang (210mm) NGẮN HƠN cạnh cao trang (297mm), và đường chéo
 * dài nhất — thứ tự gần/vừa/xa này không đổi bất kể ảnh xoay/lật hướng nào hay bị chụp nghiêng phối
 * cảnh thế nào (khác với cách so DIỆN TÍCH giữa các marker — bị ảnh chụp nghiêng làm sai vì marker
 * gần camera luôn đo to hơn marker xa, bất kể in to/nhỏ thế nào).
 */
function pickCornersByOrientationMarks(
  cornerCandidatesRaw: MarkerCandidate[],
  orientationCandidates: MarkerCandidate[],
  orientationCornerId: MarkerId,
  epsilonPx: number,
): MarkerCandidate[] | null {
  const candidates = dedupeCandidates(cornerCandidatesRaw, epsilonPx);
  if (candidates.length < 4) return null;

  let markedCandidate: MarkerCandidate | null = null;
  let highestCount = 0;
  for (const c of candidates) {
    const count = countNearbyOrientationMarks(c, orientationCandidates);
    if (count > highestCount) {
      highestCount = count;
      markedCandidate = c;
    }
  }
  if (!markedCandidate) return null;

  const others = candidates.filter((c) => c !== markedCandidate);
  if (others.length < 3) return null;
  const byDist = others.map((c) => ({ c, d: distance(markedCandidate!, c) })).sort((a, b) => a.d - b.d);

  const rel = CORNER_RELATIONS[orientationCornerId];
  const diagonalCandidate = byDist[byDist.length - 1].c; // xa nhất = đường chéo
  const rest = byDist.slice(0, byDist.length - 1);
  const viaWidthCandidate = rest[0].c; // gần nhất trong số còn lại = cạnh ngắn (rộng trang)
  const viaHeightCandidate = rest[rest.length - 1].c; // xa nhất trong số còn lại = cạnh dài (cao trang)

  const roleByMarkerId = new Map<MarkerId, MarkerCandidate>([
    [orientationCornerId, markedCandidate],
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
  const cornerCandidates = findSquareCandidates(cv, thresh, imageArea, MARKER_MIN_REL_AREA, MARKER_MAX_REL_AREA);

  // Ngưỡng gộp trùng: 1% cạnh ngắn hơn của ảnh — đủ lớn để gộp các contour lồng sát nhau của cùng
  // 1 hình vuông, đủ nhỏ để không gộp nhầm 2 marker góc khác nhau (cách nhau hàng trăm px).
  const epsilonPx = Math.min(srcRgbaOrGray.cols, srcRgbaOrGray.rows) * 0.01;
  let corners: MarkerCandidate[] | null;
  if (geometry.orientationMarks) {
    const orientationCandidates = findSquareCandidates(
      cv,
      thresh,
      imageArea,
      ORIENTATION_MARK_MIN_REL_AREA,
      ORIENTATION_MARK_MAX_REL_AREA,
    );
    corners = pickCornersByOrientationMarks(
      cornerCandidates,
      orientationCandidates,
      geometry.orientationMarks.cornerId,
      epsilonPx,
    );
  } else {
    corners = pickCornersByPosition(cornerCandidates);
  }
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
