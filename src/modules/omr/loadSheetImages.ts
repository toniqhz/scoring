import { renderPdfPagesToBitmaps } from './pdfToImages';

export interface LoadedSheetImage {
  fileName: string;
  bitmap: ImageBitmap;
  /** Ảnh xem lại (object URL) — chụp TRƯỚC khi bitmap bị transfer sang worker (transfer sẽ neuter nó). */
  previewUrl: string;
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/** Chụp lại 1 bản ảnh xem lại từ bitmap (vẽ ra canvas không tiêu thụ bitmap gốc) trước khi nó bị transfer cho worker. */
async function capturePreviewUrl(bitmap: ImageBitmap): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không tạo được canvas để lưu ảnh xem lại');
  ctx.drawImage(bitmap, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Không tạo được ảnh xem lại');
  return URL.createObjectURL(blob);
}

/** Chuẩn hóa danh sách file bài scan (ảnh hoặc PDF nhiều trang) thành 1 ImageBitmap / phiếu. */
export async function loadSheetImagesFromFiles(files: File[]): Promise<LoadedSheetImage[]> {
  const results: LoadedSheetImage[] = [];
  for (const file of files) {
    if (isPdf(file)) {
      const bitmaps = await renderPdfPagesToBitmaps(file);
      for (let i = 0; i < bitmaps.length; i++) {
        const bitmap = bitmaps[i];
        results.push({
          fileName: bitmaps.length > 1 ? `${file.name} — trang ${i + 1}` : file.name,
          bitmap,
          previewUrl: await capturePreviewUrl(bitmap),
        });
      }
    } else {
      const bitmap = await createImageBitmap(file);
      results.push({ fileName: file.name, bitmap, previewUrl: await capturePreviewUrl(bitmap) });
    }
  }
  return results;
}
