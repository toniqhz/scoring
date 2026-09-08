import { CORNER_MARKERS, mmToPx, type MarkerId } from '../pdf-export/bubbleSheetTemplate';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CvNamespace = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CvMat = any;

/** Tọa độ TÂM (không phải góc) của mỗi marker trong không gian mẫu, theo px ở `dpi` cho trước. */
function markerCenterPx(id: MarkerId, dpi: number): { x: number; y: number } {
  const marker = CORNER_MARKERS.find((m) => m.id === id)!;
  const centerXmm = marker.topLeft.xMm + marker.sizeMm / 2;
  const centerYmm = marker.topLeft.yMm + marker.sizeMm / 2;
  return { x: mmToPx(centerXmm, dpi), y: mmToPx(centerYmm, dpi) };
}

const MARKER_MIN_REL_AREA = 0.0006;
const MARKER_MAX_REL_AREA = 0.015;
const MARKER_MIN_ASPECT = 0.6;
const MARKER_MAX_ASPECT = 1.4;

export interface AlignResult {
  /** Ảnh grayscale đã warp về đúng khung mẫu + nhị phân hóa lại (nền đen, nét mực = trắng/255). Cần .delete() sau khi dùng. */
  warped: CvMat | null;
  ok: boolean;
}

interface MarkerCandidate {
  cx: number;
  cy: number;
}

function findMarkerCandidates(cv: CvNamespace, thresh: CvMat, imageArea: number): MarkerCandidate[] {
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
            candidates.push({ cx: m.m10 / m.m00, cy: m.m01 / m.m00 });
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

function pickCorners(candidates: MarkerCandidate[]): MarkerCandidate[] | null {
  if (candidates.length < 4) return null;
  const topLeft = [...candidates].sort((a, b) => a.cx + a.cy - (b.cx + b.cy))[0];
  const bottomRight = [...candidates].sort((a, b) => b.cx + b.cy - (a.cx + a.cy))[0];
  const topRight = [...candidates].sort((a, b) => a.cy - a.cx - (b.cy - b.cx))[0];
  const bottomLeft = [...candidates].sort((a, b) => b.cy - b.cx - (a.cy - a.cx))[0];
  return [topLeft, topRight, bottomLeft, bottomRight];
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
  const candidates = findMarkerCandidates(cv, thresh, imageArea);
  thresh.delete();
  const corners = pickCorners(candidates);

  if (!corners) {
    gray.delete();
    return { warped: null, ok: false };
  }

  const srcPointsFlat = corners.flatMap((p) => [p.cx, p.cy]);
  // Điểm đích PHẢI là vị trí thật của TÂM marker trong không gian mẫu (marker cách mép trang
  // MARKER_MARGIN_MM, không nằm ở đúng góc (0,0)) — nếu map nhầm về góc trang sẽ làm lệch toàn
  // bộ phép biến đổi và mọi tọa độ ô tròn tính sau đó đều sai.
  const dstPointsFlat = [
    markerCenterPx('top-left', dpi),
    markerCenterPx('top-right', dpi),
    markerCenterPx('bottom-left', dpi),
    markerCenterPx('bottom-right', dpi),
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
