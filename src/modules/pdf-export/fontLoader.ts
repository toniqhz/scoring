import { PDFDocument, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export interface LoadedFonts {
  regular: PDFFont;
  bold: PDFFont;
}

async function fetchFontBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được font: ${url}`);
  return res.arrayBuffer();
}

/** Nhúng font Noto Sans (Regular + Bold) để PDF hiển thị đúng tiếng Việt có dấu. */
export async function embedVietnameseFonts(pdfDoc: PDFDocument): Promise<LoadedFonts> {
  pdfDoc.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    fetchFontBytes('/fonts/NotoSans-Regular.ttf'),
    fetchFontBytes('/fonts/NotoSans-Bold.ttf'),
  ]);
  const regular = await pdfDoc.embedFont(regularBytes, { subset: true });
  const bold = await pdfDoc.embedFont(boldBytes, { subset: true });
  return { regular, bold };
}
