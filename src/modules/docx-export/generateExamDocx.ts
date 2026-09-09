import JSZip from 'jszip';
import { letterAt } from '../../lib/optionLetters';
import type { ParagraphXmlChunk, ExtractedExamXml } from './xmlBlockExtractor';
import type { Question } from '../../types/question';
import type { ExamVariant } from '../../types/examVariant';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const serializer = new XMLSerializer();

function parseFragment(doc: XMLDocument, xml: string | null): Element | null {
  if (!xml) return null;
  const wrapped = `<w:root xmlns:w="${WORD_NS}">${xml}</w:root>`;
  const fragDoc = new DOMParser().parseFromString(wrapped, 'application/xml');
  if (fragDoc.getElementsByTagName('parsererror').length > 0) return null;
  const el = fragDoc.documentElement.firstElementChild;
  return el ? (doc.importNode(el, true) as Element) : null;
}

/** AN TOÀN: xóa hoàn toàn <w:b>/<w:bCs> khỏi 1 đoạn XML <w:rPr> — không để lộ đáp án đúng. */
function stripBoldFromRPrXml(rPrXml: string | null): string | null {
  if (!rPrXml) return null;
  const wrapped = `<w:root xmlns:w="${WORD_NS}">${rPrXml}</w:root>`;
  const fragDoc = new DOMParser().parseFromString(wrapped, 'application/xml');
  if (fragDoc.getElementsByTagName('parsererror').length > 0) return rPrXml;
  const root = fragDoc.documentElement.firstElementChild;
  if (!root) return rPrXml;
  for (const tag of ['b', 'bCs']) {
    for (const el of Array.from(root.getElementsByTagNameNS(WORD_NS, tag))) {
      el.parentNode?.removeChild(el);
    }
  }
  return serializer.serializeToString(root);
}

function buildRun(doc: XMLDocument, text: string, rPrXml: string | null): Element {
  const rEl = doc.createElementNS(WORD_NS, 'w:r');
  const rPrEl = parseFragment(doc, rPrXml);
  if (rPrEl) rEl.appendChild(rPrEl);
  const tEl = doc.createElementNS(WORD_NS, 'w:t');
  tEl.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  tEl.textContent = text;
  rEl.appendChild(tEl);
  return rEl;
}

interface BuildParagraphOptions {
  /** Nhãn chèn vào ĐẦU đoạn văn dưới dạng 1 run riêng, vd "Câu 5: " hoặc "C. ". */
  labelText?: string;
  /** true = xóa in đậm khỏi MỌI run trong đoạn (dùng cho đáp án — không để lộ đáp án đúng). */
  stripBold?: boolean;
}

function buildParagraphFromChunk(doc: XMLDocument, chunk: ParagraphXmlChunk, opts: BuildParagraphOptions = {}): Element {
  const pEl = doc.createElementNS(WORD_NS, 'w:p');
  const pPrEl = parseFragment(doc, chunk.pPrXml);
  if (pPrEl) {
    // Bỏ numPr — sau khi trộn thứ tự, số/chữ tự động của Word không còn đúng nữa; nhãn được
    // ghi tường minh (labelText) thay vì phụ thuộc numbering.xml.
    for (const el of Array.from(pPrEl.getElementsByTagNameNS(WORD_NS, 'numPr'))) {
      el.parentNode?.removeChild(el);
    }
    pEl.appendChild(pPrEl);
  }
  const firstRunRPr = chunk.runs[0]?.rPrXml ?? null;
  if (opts.labelText) {
    const labelRPr = opts.stripBold ? stripBoldFromRPrXml(firstRunRPr) : firstRunRPr;
    pEl.appendChild(buildRun(doc, opts.labelText, labelRPr));
  }
  for (const run of chunk.runs) {
    const rPrXml = opts.stripBold ? stripBoldFromRPrXml(run.rPrXml) : run.rPrXml;
    pEl.appendChild(buildRun(doc, run.text, rPrXml));
  }
  return pEl;
}

function buildPlainParagraph(doc: XMLDocument, text: string, bold: boolean): Element {
  const pEl = doc.createElementNS(WORD_NS, 'w:p');
  const rEl = doc.createElementNS(WORD_NS, 'w:r');
  if (bold) {
    const rPr = doc.createElementNS(WORD_NS, 'w:rPr');
    rPr.appendChild(doc.createElementNS(WORD_NS, 'w:b'));
    rEl.appendChild(rPr);
  }
  const tEl = doc.createElementNS(WORD_NS, 'w:t');
  tEl.textContent = text;
  rEl.appendChild(tEl);
  pEl.appendChild(rEl);
  return pEl;
}

export interface GenerateExamVariantDocxInput {
  originalDocxBuffer: ArrayBuffer;
  structure: ExtractedExamXml;
  questions: Question[];
  variant: ExamVariant;
  examCode: string;
}

/**
 * Dựng lại file .docx cho 1 biến thể đề — giữ nguyên mọi phần khác của file gốc (header dạng
 * bảng, footer, style, theme, font...) và chỉ thay phần thân câu hỏi bằng nội dung đã trộn thứ
 * tự + xóa in đậm đáp án đúng.
 */
export async function generateExamVariantDocx(input: GenerateExamVariantDocxInput): Promise<Uint8Array> {
  const { originalDocxBuffer, structure, questions, variant, examCode } = input;
  const zip = await JSZip.loadAsync(originalDocxBuffer);
  const documentXmlFile = zip.file('word/document.xml');
  if (!documentXmlFile) throw new Error('File .docx gốc không hợp lệ: thiếu word/document.xml');
  const xmlText = await documentXmlFile.async('text');
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Không thể đọc lại nội dung XML của file .docx gốc');
  }
  const body = doc.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('Không tìm thấy nội dung (body) trong file .docx gốc');

  while (body.firstChild) body.removeChild(body.firstChild);

  for (const xml of structure.preserveBeforeXml) {
    const el = parseFragment(doc, xml);
    if (el) body.appendChild(el);
  }

  body.appendChild(buildPlainParagraph(doc, `Mã đề: ${examCode}`, true));

  const questionById = new Map(questions.map((q) => [q.id, q]));
  const blockByOriginalIndex = new Map(structure.questionBlocks.map((b) => [b.originalIndex, b]));

  variant.questionOrder.forEach((qId, idx) => {
    const question = questionById.get(qId);
    if (!question) return;
    const block = blockByOriginalIndex.get(question.originalIndex);
    if (!block) return;
    const displayPosition = idx + 1;
    const optionOrderIds = variant.optionOrderByQuestion[qId] ?? [];

    if (block.stemChunks.length === 0) {
      body.appendChild(buildPlainParagraph(doc, `Câu ${displayPosition}:`, false));
    } else {
      block.stemChunks.forEach((chunk, i) => {
        body.appendChild(
          buildParagraphFromChunk(doc, chunk, { labelText: i === 0 ? `Câu ${displayPosition}: ` : undefined }),
        );
      });
    }

    optionOrderIds.forEach((optionId, optIdx) => {
      const originalOptionIndex = question.options.findIndex((o) => o.id === optionId);
      const originalLetter = letterAt(originalOptionIndex);
      const optionBlock = block.options.find((o) => o.letter === originalLetter);
      if (!optionBlock) return;
      body.appendChild(
        buildParagraphFromChunk(doc, optionBlock.chunk, {
          labelText: `${letterAt(optIdx)}. `,
          stripBold: true,
        }),
      );
    });
  });

  for (const xml of structure.preserveAfterXml) {
    const el = parseFragment(doc, xml);
    if (el) body.appendChild(el);
  }

  const newXml = serializer.serializeToString(doc);
  zip.file('word/document.xml', newXml);
  return zip.generateAsync({ type: 'uint8array' });
}
