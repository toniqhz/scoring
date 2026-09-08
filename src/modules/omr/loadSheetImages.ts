import { renderPdfPagesToBitmaps } from './pdfToImages';

export interface LoadedSheetImage {
  fileName: string;
  bitmap: ImageBitmap;
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/** Chuẩn hóa danh sách file bài scan (ảnh hoặc PDF nhiều trang) thành 1 ImageBitmap / phiếu. */
export async function loadSheetImagesFromFiles(files: File[]): Promise<LoadedSheetImage[]> {
  const results: LoadedSheetImage[] = [];
  for (const file of files) {
    if (isPdf(file)) {
      const bitmaps = await renderPdfPagesToBitmaps(file);
      bitmaps.forEach((bitmap, i) => {
        results.push({ fileName: bitmaps.length > 1 ? `${file.name} — trang ${i + 1}` : file.name, bitmap });
      });
    } else {
      results.push({ fileName: file.name, bitmap: await createImageBitmap(file) });
    }
  }
  return results;
}
