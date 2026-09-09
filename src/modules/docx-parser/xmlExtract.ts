import JSZip from 'jszip';
import { parseNumbering, resolveAutoNumberPrefix, createListCounters } from './numbering';
import { OPTION_RE } from './patterns';

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

interface RunChunk {
  text: string;
  bold: boolean;
}

function runFullText(rEl: Element): string {
  return Array.from(rEl.getElementsByTagNameNS(WORD_NS, 't'))
    .map((t) => t.textContent ?? '')
    .join('');
}

/**
 * Nhiều đề thi thực tế gộp NHIỀU đáp án (A/B/C/D) vào CÙNG 1 đoạn văn, ngăn cách bởi ký tự
 * tab (ví dụ: "Nhóm phosphate" [tab][tab] "B.  Đường pentose" [tab] "C. ..." [tab][tab] "D. ...").
 * Vì vậy phải tách 1 <w:p> thành nhiều "dòng logic" tại ranh giới <w:tab/>/<w:br/>/<w:cr/>,
 * thay vì gộp toàn bộ text của đoạn văn làm một — nếu không, các nhãn "B."/"C."/"D." sẽ nằm
 * giữa chuỗi thay vì đầu dòng và không được nhận diện là đáp án riêng.
 *
 * Một số file còn đặt đáp án ĐÚNG (in đậm) ở 1 run mới ngay sau các đáp án trước mà KHÔNG có
 * tab/br phân cách (chỉ cách nhau bằng khoảng trắng trong chính run đó — thường do giáo viên tô
 * đậm đáp án đúng SAU KHI đã gõ xong cả dòng, khiến Word tách riêng nó thành 1 run mới). Nên còn
 * phải tách dòng mới khi 1 RUN MỚI, IN ĐẬM, tự nó đã khớp mẫu "A.". Chỉ áp dụng cho run IN ĐẬM
 * (không áp dụng chung chung) để tránh cắt nhầm câu có cụm như "E. coli" nằm giữa câu hỏi.
 */
function extractSegments(pEl: Element): RunChunk[][] {
  const segments: RunChunk[][] = [[]];
  const runEls = Array.from(pEl.getElementsByTagNameNS(WORD_NS, 'r'));
  for (const rEl of runEls) {
    const bold = isRunBold(rEl);
    const currentSeg = segments[segments.length - 1];
    if (currentSeg.length > 0 && bold && OPTION_RE.test(runFullText(rEl).trim())) {
      segments.push([]);
    }
    for (const child of Array.from(rEl.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      if (el.localName === 't') {
        const text = el.textContent ?? '';
        if (text) segments[segments.length - 1].push({ text, bold });
      } else if (el.localName === 'tab' || el.localName === 'br' || el.localName === 'cr') {
        segments.push([]);
      }
    }
  }
  return segments.filter((seg) => seg.length > 0);
}

function segmentToParagraph(chunks: RunChunk[], textPrefix: string | null): DocxParagraph {
  const rawText = chunks.map((c) => c.text).join('');
  const text = textPrefix ? `${textPrefix} ${rawText}` : rawText;
  const totalNonSpace = rawText.replace(/\s+/g, '').length;
  const boldNonSpace = chunks.reduce((sum, c) => sum + (c.bold ? c.text.replace(/\s+/g, '').length : 0), 0);
  const boldRatio = totalNonSpace > 0 ? boldNonSpace / totalNonSpace : 0;
  return { text, runs: chunks.map((c) => ({ text: c.text, bold: c.bold })), boldRatio };
}

function getParagraphNumPr(pEl: Element): { numId: string; ilvl: number } | null {
  const pPr = pEl.getElementsByTagNameNS(WORD_NS, 'pPr')[0];
  const numPr = pPr?.getElementsByTagNameNS(WORD_NS, 'numPr')[0];
  if (!numPr) return null;
  const numId = numPr.getElementsByTagNameNS(WORD_NS, 'numId')[0]?.getAttributeNS(WORD_NS, 'val');
  if (numId === null || numId === undefined) return null;
  const ilvlStr = numPr.getElementsByTagNameNS(WORD_NS, 'ilvl')[0]?.getAttributeNS(WORD_NS, 'val') ?? '0';
  const ilvl = parseInt(ilvlStr, 10);
  return { numId, ilvl: Number.isFinite(ilvl) ? ilvl : 0 };
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

  const numbering = await parseNumbering(zip);
  const counters = createListCounters();

  const paragraphEls = Array.from(doc.getElementsByTagNameNS(WORD_NS, 'p'));
  const result: DocxParagraph[] = [];

  for (const pEl of paragraphEls) {
    const numPr = getParagraphNumPr(pEl);
    // Chỉ đoạn (đánh số tự động), số/chữ do Word sinh ra và không nằm trong text — cần tổng
    // hợp lại và chỉ gắn vào DÒNG LOGIC ĐẦU TIÊN của đoạn văn (Word chỉ hiện 1 nhãn/đoạn).
    const autoPrefix = numPr ? resolveAutoNumberPrefix(numPr.numId, numPr.ilvl, numbering, counters) : null;

    const segments = extractSegments(pEl);
    segments.forEach((chunks, i) => {
      const paragraph = segmentToParagraph(chunks, i === 0 ? autoPrefix : null);
      if (paragraph.text.trim().length > 0) result.push(paragraph);
    });
  }

  return result;
}
