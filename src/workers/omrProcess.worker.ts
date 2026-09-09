/// <reference lib="webworker" />
import { decodeSheet } from '../modules/omr/decode';
import type { OmrTaskMessage, OmrResultMessage } from '../modules/omr/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CvNamespace = any;

self.addEventListener('error', (e) => {
  console.error('[omr-worker] global error event:', e.message, e.filename, e.lineno);
});
self.addEventListener('unhandledrejection', (e) => {
  console.error('[omr-worker] unhandledrejection:', e.reason);
});

let cvReadyPromise: Promise<CvNamespace> | null = null;

/**
 * Worker này chạy dạng ES module (bắt buộc để dùng `import` trong dev server của Vite),
 * nên KHÔNG dùng được importScripts(). Thay vào đó fetch mã nguồn opencv.js rồi chạy bằng
 * eval gián tiếp (`(0, eval)(code)`), vì bản build UMD của opencv.js gán `root.cv = ...`
 * dựa trên `this` ở top-level — nếu chạy trực tiếp trong 1 module thì `this` sẽ là
 * `undefined` (quy tắc của ES module) khiến việc gán bị lỗi; eval gián tiếp luôn chạy ở
 * global scope nên `this` trỏ đúng vào `self` (global scope của worker).
 */
function loadCv(): Promise<CvNamespace> {
  if (cvReadyPromise) return cvReadyPromise;
  cvReadyPromise = (async () => {
    const res = await fetch('/opencv/opencv.js');
    if (!res.ok) throw new Error(`Không tải được /opencv/opencv.js (HTTP ${res.status})`);
    const code = await res.text();
    (0, eval)(code);
    const cvValue = (self as unknown as { cv: CvNamespace }).cv;
    if (!cvValue) {
      throw new Error('Không tải được OpenCV.js (thiếu global cv sau khi nạp)');
    }
    // Bản build MODULARIZE của Emscripten: gọi factory() trả về 1 Promise (resolve khi WASM
    // sẵn sàng), không phải object Module trực tiếp — cần await thay vì chờ onRuntimeInitialized.
    const cv: CvNamespace = typeof cvValue.then === 'function' ? await cvValue : cvValue;
    if (!cv || typeof cv.getBuildInformation !== 'function') {
      throw new Error('OpenCV.js khởi tạo không thành công (thiếu getBuildInformation)');
    }
    return cv;
  })();
  return cvReadyPromise;
}

function imageBitmapToMat(cv: CvNamespace, bitmap: ImageBitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không tạo được canvas xử lý ảnh trong worker');
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return cv.matFromImageData(imageData);
}

self.onmessage = async (event: MessageEvent<OmrTaskMessage>) => {
  const { taskId, bitmap, totalQuestions, maxOptions } = event.data;
  try {
    const cv = await loadCv();
    const mat = imageBitmapToMat(cv, bitmap);
    let decoded;
    try {
      decoded = decodeSheet(cv, mat, totalQuestions, maxOptions);
    } finally {
      mat.delete();
      bitmap.close();
    }
    const message: OmrResultMessage = { taskId, ok: true, ...decoded };
    self.postMessage(message);
  } catch (err) {
    const message: OmrResultMessage = {
      taskId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      alignmentFailed: true,
      mssv: null,
      mssvAmbiguous: true,
      examCode: null,
      examCodeAmbiguous: true,
      answers: [],
    };
    self.postMessage(message);
  }
};
