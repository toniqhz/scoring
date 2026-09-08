import JSZip from 'jszip';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export interface DocxRun {
  text: string;
  bold: boolean;
}

export interface DocxParagraph {
  text: string;
  runs: DocxRun[];
  /** Tỉ lệ ký tự (không tính khoảng trắng) nằm trong run in đậm, dùng để suy ra "cả dòng in đậm". */
  boldRatio: number;
}

function isRunBold(rEl: Element): boolean {
  const rPr = rEl.getElementsByTagNameNS(WORD_NS, 'rPr')[0];
  if (!rPr) return false;
  const bEl = rPr.getElementsByTagNameNS(WORD_NS, 'b')[0];
  if (!bEl) return false;
  const val = bEl.getAttributeNS(WORD_NS, 'val');
  if (val === null) return true; // <w:b/> không có w:val nghĩa là in đậm
  return val !== '0' && val.toLowerCase() !== 'false';
}

function extractParagraph(pEl: Element): DocxParagraph {
  const runEls = Array.from(pEl.getElementsByTagNameNS(WORD_NS, 'r'));
  const runs: DocxRun[] = runEls.map((rEl) => {
    const tEls = Array.from(rEl.getElementsByTagNameNS(WORD_NS, 't'));
    const text = tEls.map((t) => t.textContent ?? '').join('');
    return { text, bold: isRunBold(rEl) };
  });
  const text = runs.map((r) => r.text).join('');
  const totalNonSpace = text.replace(/\s+/g, '').length;
  const boldNonSpace = runs.reduce(
    (sum, r) => sum + (r.bold ? r.text.replace(/\s+/g, '').length : 0),
    0,
  );
  const boldRatio = totalNonSpace > 0 ? boldNonSpace / totalNonSpace : 0;
  return { text, runs, boldRatio };
}

export async function extractDocxParagraphs(fileData: ArrayBuffer): Promise<DocxParagraph[]> {
  const zip = await JSZip.loadAsync(fileData);
  const documentXmlFile = zip.file('word/document.xml');
  if (!documentXmlFile) {
    throw new Error('File .docx không hợp lệ: thiếu word/document.xml');
  }
  const xmlText = await documentXmlFile.async('text');
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Không thể đọc nội dung XML của file .docx');
  }
  const paragraphEls = Array.from(doc.getElementsByTagNameNS(WORD_NS, 'p'));
  return paragraphEls.map(extractParagraph).filter((p) => p.text.trim().length > 0);
}
