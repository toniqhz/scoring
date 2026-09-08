import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/** Render mỗi trang PDF (bài scan dạng PDF) thành 1 ImageBitmap ở độ phân giải ~300dpi. */
export async function renderPdfPagesToBitmaps(file: File): Promise<ImageBitmap[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const bitmaps: ImageBitmap[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 300 / 72 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không tạo được canvas để render PDF');
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    bitmaps.push(await createImageBitmap(canvas));
  }

  return bitmaps;
}
