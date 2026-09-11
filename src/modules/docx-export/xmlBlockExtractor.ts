import JSZip from 'jszip';
import { parseNumbering, resolveAutoNumberPrefix, createListCounters } from '../docx-parser/numbering';
import { QUESTION_RE, OPTION_RE } from '../docx-parser/patterns';
import { findLetterReplacements, applyLetterReplacementsToText } from '../shuffle/optionCrossReference';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const serializer = new XMLSerializer();

export interface RunChunkXml {
  text: string;
  /** XML gốc của <w:rPr> (font, size, in đậm...) — dùng để dựng lại run giữ nguyên định dạng. */
  rPrXml: string | null;
}

export interface ParagraphXmlChunk {
  text: string;
  runs: RunChunkXml[];
  /** XML gốc của <w:pPr> (canh lề, giãn dòng, numPr...) của đoạn văn chứa dòng này. */
  pPrXml: string | null;
  /**
   * Số ký tự ở ĐẦU `text` là tiền tố ẢO do Word tự đánh số (không nằm trong bất kỳ run nào) —
   * cần biết để khi cắt bỏ nhãn "Câu N:"/"A." khỏi `text`, chỉ cắt phần THẬT tương ứng khỏi
   * `runs`, không cắt hụt/cắt thừa nội dung thật.
   */
  syntheticPrefixLength: number;
}

/** Cắt bỏ `charsToTrim` ký tự đầu tiên khỏi nội dung THẬT của các run (dùng khi bỏ nhãn gốc). */
function trimRunsPrefix(runs: RunChunkXml[], charsToTrim: number): RunChunkXml[] {
  if (charsToTrim <= 0) return runs;
  const result: RunChunkXml[] = [];
  let remaining = charsToTrim;
  for (const run of runs) {
    if (remaining <= 0) {
      result.push(run);
      continue;
    }
    if (run.text.length <= remaining) {
      remaining -= run.text.length;
      continue; // toàn bộ run này nằm trong phần bị cắt
    }
    result.push({ ...run, text: run.text.slice(remaining) });
    remaining = 0;
  }
  return result;
}

/** Cắt bỏ tiền tố (đã match bởi regex) khỏi 1 chunk — trả về chunk mới với text + runs đã đồng bộ. */
function stripMatchedPrefix(chunk: ParagraphXmlChunk, matchedLength: number, newText: string): ParagraphXmlChunk {
  const realCharsToTrim = Math.max(0, matchedLength - chunk.syntheticPrefixLength);
  return {
    ...chunk,
    text: newText,
    runs: trimRunsPrefix(chunk.runs, realCharsToTrim),
    syntheticPrefixLength: 0,
  };
}

export interface OptionXmlBlock {
  letter: string;
  chunk: ParagraphXmlChunk;
}

/**
 * Dựng 1 ParagraphXmlChunk "giả" từ text thuần (vd sau khi giáo viên sửa tay câu hỏi/đáp án trên
 * web, không còn khớp với run XML gốc đọc từ file .docx) — mượn định dạng (rPr của run đầu tiên,
 * pPr của đoạn văn) từ `templateChunk` (nếu có) để nhìn vẫn đồng bộ với các đoạn khác, hoặc dùng
 * định dạng mặc định của Word nếu đây là đáp án hoàn toàn mới (không có gì để mượn).
 */
export function makeSyntheticChunk(text: string, templateChunk?: ParagraphXmlChunk | null): ParagraphXmlChunk {
  return {
    text,
    runs: [{ text, rPrXml: templateChunk?.runs[0]?.rPrXml ?? null }],
    pPrXml: templateChunk?.pPrXml ?? null,
    syntheticPrefixLength: 0,
  };
}

/**
 * Tự sửa lại chữ cái đáp án được nhắc tới trong nội dung 1 đoạn XML (vd "Cả A và B đều đúng") theo
 * `letterMap` (chữ cũ -> chữ mới sau khi xáo) — dùng cho chiến lược "rewrite" khi trộn đề (xem
 * generateVariants.ts). Chỉ thay ĐÚNG các ký tự chữ cái đã khớp mẫu tham chiếu (không đụng tới ký
 * tự nào khác), và thay trực tiếp trong TỪNG RUN gốc (giữ nguyên định dạng/font của run đó) — vì
 * đề in ra dựng lại từ chính các run XML này, không dùng `chunk.text` để hiển thị.
 */
export function rewriteChunkLetterReferences(
  chunk: ParagraphXmlChunk,
  letterMap: Record<string, string>,
): ParagraphXmlChunk {
  const replacements = findLetterReplacements(chunk.text, letterMap);
  if (replacements.length === 0) return chunk;

  const newRuns: RunChunkXml[] = [];
  let cursor = 0;
  let replIdx = 0;
  for (const run of chunk.runs) {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    let text = run.text;
    while (replIdx < replacements.length && replacements[replIdx].index < runEnd) {
      const r = replacements[replIdx];
      if (r.index >= runStart) {
        const localIndex = r.index - runStart;
        // Kiểm tra phòng vệ: chỉ thay nếu đúng ký tự mong đợi còn nguyên ở vị trí đó (tránh lệch
        // offset nếu có bất thường nào đó chưa lường trước — thà bỏ qua còn hơn thay nhầm chữ).
        if (text[localIndex] === r.oldLetter) {
          text = text.slice(0, localIndex) + r.newLetter + text.slice(localIndex + 1);
        }
      }
      replIdx++;
    }
    newRuns.push({ ...run, text });
    cursor = runEnd;
  }

  return { ...chunk, text: applyLetterReplacementsToText(chunk.text, replacements), runs: newRuns };
}

export interface QuestionXmlBlock {
  /** Phải khớp với Question.originalIndex sinh ra từ questionSegmenter.ts trên CÙNG file này. */
  originalIndex: number;
  stemChunks: ParagraphXmlChunk[];
  options: OptionXmlBlock[];
}

export interface ExtractedExamXml {
  questionBlocks: QuestionXmlBlock[];
  /** XML gốc (nguyên trạng) của các phần tử TRƯỚC câu hỏi đầu tiên — vd bảng tiêu đề. */
  preserveBeforeXml: string[];
  /** XML gốc của các phần tử SAU đoạn văn cuối cùng — vd <w:sectPr> (khổ giấy, lề trang). */
  preserveAfterXml: string[];
}

function serializeElement(el: Element | null): string | null {
  return el ? serializer.serializeToString(el) : null;
}

/** Giống extractSegments trong docx-parser/xmlExtract.ts, nhưng giữ thêm XML gốc của rPr từng run. */
function runFullText(rEl: Element): string {
  return Array.from(rEl.getElementsByTagNameNS(WORD_NS, 't'))
    .map((t) => t.textContent ?? '')
    .join('');
}

function isRunBold(rEl: Element): boolean {
  const rPr = rEl.getElementsByTagNameNS(WORD_NS, 'rPr')[0];
  if (!rPr) return false;
  const bEl = rPr.getElementsByTagNameNS(WORD_NS, 'b')[0];
  if (!bEl) return false;
  const val = bEl.getAttributeNS(WORD_NS, 'val');
  if (val === null) return true;
  return val !== '0' && val.toLowerCase() !== 'false';
}

/**
 * Một số file đặt đáp án ĐÚNG (in đậm) ở 1 run mới ngay sau các đáp án trước mà KHÔNG có tab/br
 * phân cách (chỉ cách nhau bằng khoảng trắng trong run đó) — nên còn phải tách dòng mới khi 1
 * RUN MỚI, IN ĐẬM, tự nó đã khớp mẫu "A.". Chỉ áp dụng cho run in đậm để tránh cắt nhầm câu có
 * cụm như "E. coli" nằm giữa câu hỏi (không phải đáp án).
 */
function extractSegmentsXml(pEl: Element): RunChunkXml[][] {
  const segments: RunChunkXml[][] = [[]];
  const runEls = Array.from(pEl.getElementsByTagNameNS(WORD_NS, 'r'));
  for (const rEl of runEls) {
    const rPrEl = rEl.getElementsByTagNameNS(WORD_NS, 'rPr')[0] ?? null;
    const rPrXml = serializeElement(rPrEl);
    const currentSeg = segments[segments.length - 1];
    if (currentSeg.length > 0 && isRunBold(rEl) && OPTION_RE.test(runFullText(rEl).trim())) {
      segments.push([]);
    }
    for (const child of Array.from(rEl.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      if (el.localName === 't') {
        const text = el.textContent ?? '';
        if (text) segments[segments.length - 1].push({ text, rPrXml });
      } else if (el.localName === 'tab' || el.localName === 'br' || el.localName === 'cr') {
        segments.push([]);
      }
    }
  }
  return segments.filter((seg) => seg.length > 0);
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

/**
 * Đọc lại file .docx GỐC (không phải bản đã rút gọn text) để lấy cấu trúc XML thật của từng
 * câu hỏi/đáp án — dùng khi xuất đề vẫn giữ nguyên font/style gốc thay vì vẽ lại từ đầu.
 * originalIndex được tính theo ĐÚNG cùng quy tắc với questionSegmenter.ts để có thể đối chiếu
 * ngược với Question[] đã parse trước đó trong app (miễn dùng chung 1 file gốc).
 */
export async function extractExamXmlStructure(fileData: ArrayBuffer): Promise<ExtractedExamXml> {
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
  const body = doc.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('Không tìm thấy nội dung (body) trong file .docx');

  const numbering = await parseNumbering(zip);
  const counters = createListCounters();

  const bodyChildren = Array.from(body.childNodes).filter((n) => n.nodeType === 1) as Element[];

  interface ParaInfo {
    el: Element;
    chunks: ParagraphXmlChunk[];
  }
  const paraInfos: ParaInfo[] = [];
  for (const el of bodyChildren) {
    if (el.localName !== 'p') continue;
    const numPr = getParagraphNumPr(el);
    const autoPrefix = numPr ? resolveAutoNumberPrefix(numPr.numId, numPr.ilvl, numbering, counters) : null;
    const pPrEl = el.getElementsByTagNameNS(WORD_NS, 'pPr')[0] ?? null;
    const pPrXml = serializeElement(pPrEl);

    const segments = extractSegmentsXml(el);
    const chunks: ParagraphXmlChunk[] = segments
      .map((seg, i) => {
        const rawText = seg.map((c) => c.text).join('');
        const prefix = i === 0 ? autoPrefix : null;
        const text = prefix ? `${prefix} ${rawText}` : rawText;
        const syntheticPrefixLength = prefix ? prefix.length + 1 : 0; // +1 cho khoảng trắng nối thêm
        return { text, runs: seg, pPrXml, syntheticPrefixLength };
      })
      .filter((c) => c.text.trim().length > 0);
    paraInfos.push({ el, chunks });
  }

  const firstQParaIdx = paraInfos.findIndex((p) => p.chunks.some((c) => QUESTION_RE.test(c.text.trim())));
  if (firstQParaIdx === -1) {
    throw new Error('Không tìm thấy câu hỏi nào trong file gốc để xuất đề.');
  }
  const lastQParaIdx = paraInfos.length - 1;

  const beforeEls = bodyChildren.slice(0, bodyChildren.indexOf(paraInfos[firstQParaIdx].el));
  const preserveBeforeXml = beforeEls.map((el) => serializeElement(el)).filter((x): x is string => x !== null);

  const afterStartIdx = bodyChildren.indexOf(paraInfos[lastQParaIdx].el) + 1;
  const afterEls = bodyChildren.slice(afterStartIdx);
  const preserveAfterXml = afterEls.map((el) => serializeElement(el)).filter((x): x is string => x !== null);

  const questionBlocks: QuestionXmlBlock[] = [];
  let current: QuestionXmlBlock | null = null;

  for (let i = firstQParaIdx; i <= lastQParaIdx; i++) {
    for (const chunk of paraInfos[i].chunks) {
      const text = chunk.text.trim();
      if (!text) continue;
      // .trim() có thể bỏ khoảng trắng ĐẦU chunk.text — cộng bù lại để tính đúng vị trí thật
      // khi cắt tiền tố khỏi runs (vốn được tính theo chunk.text CHƯA trim).
      const leadingWhitespace = chunk.text.length - chunk.text.trimStart().length;

      const qMatch = QUESTION_RE.exec(text);
      if (qMatch) {
        if (current) questionBlocks.push(current);
        const remainderText = text.slice(qMatch[0].length).trim();
        const strippedChunk = stripMatchedPrefix(chunk, leadingWhitespace + qMatch[0].length, remainderText);
        current = {
          originalIndex: questionBlocks.length,
          stemChunks: remainderText ? [strippedChunk] : [],
          options: [],
        };
        continue;
      }
      if (!current) continue;

      const oMatch = OPTION_RE.exec(text);
      if (oMatch) {
        // OPTION_RE bắt (.*)$ tới hết dòng nên oMatch[0] dài bằng text — tính độ dài tiền tố
        // (chữ cái + dấu câu + khoảng trắng) bằng hiệu độ dài, không dùng oMatch[0].length.
        const prefixLen = text.length - oMatch[2].length;
        const remainderText = oMatch[2].trim();
        const strippedChunk = stripMatchedPrefix(chunk, leadingWhitespace + prefixLen, remainderText);
        current.options.push({ letter: oMatch[1], chunk: strippedChunk });
        continue;
      }

      if (current.options.length > 0) {
        const last = current.options[current.options.length - 1];
        last.chunk = {
          ...last.chunk,
          text: `${last.chunk.text} ${text}`,
          runs: [...last.chunk.runs, ...chunk.runs],
        };
      } else {
        current.stemChunks.push(chunk);
      }
    }
  }
  if (current) questionBlocks.push(current);

  return { questionBlocks, preserveBeforeXml, preserveAfterXml };
}
