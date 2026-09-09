import type JSZip from 'jszip';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

interface LevelDef {
  numFmt: string;
  lvlText: string;
  start: number;
}

export interface NumberingContext {
  numToAbstract: Map<string, string>;
  abstractLevels: Map<string, Map<string, LevelDef>>;
}

const EMPTY_CONTEXT: NumberingContext = { numToAbstract: new Map(), abstractLevels: new Map() };

/**
 * Đọc word/numbering.xml — cần để khôi phục số thứ tự / chữ cái do WORD TỰ ĐỘNG SINH RA
 * (danh sách đánh số tự động), vì trong trường hợp đó text thực trong <w:t> KHÔNG hề chứa
 * "1." hay "A." — số/chữ chỉ được Word tính toán và hiển thị khi render, không nằm trong XML.
 */
export async function parseNumbering(zip: JSZip): Promise<NumberingContext> {
  const file = zip.file('word/numbering.xml');
  if (!file) return EMPTY_CONTEXT;

  const xmlText = await file.async('text');
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return EMPTY_CONTEXT;

  const abstractLevels = new Map<string, Map<string, LevelDef>>();
  const abstractNums = Array.from(doc.getElementsByTagNameNS(WORD_NS, 'abstractNum'));
  for (const abstractEl of abstractNums) {
    const abstractId = abstractEl.getAttributeNS(WORD_NS, 'abstractNumId');
    if (abstractId === null) continue;
    const levels = new Map<string, LevelDef>();
    const lvlEls = Array.from(abstractEl.getElementsByTagNameNS(WORD_NS, 'lvl'));
    for (const lvlEl of lvlEls) {
      const ilvl = lvlEl.getAttributeNS(WORD_NS, 'ilvl');
      if (ilvl === null) continue;
      const numFmt = lvlEl.getElementsByTagNameNS(WORD_NS, 'numFmt')[0]?.getAttributeNS(WORD_NS, 'val') ?? 'decimal';
      const lvlText = lvlEl.getElementsByTagNameNS(WORD_NS, 'lvlText')[0]?.getAttributeNS(WORD_NS, 'val') ?? '%1.';
      const startStr = lvlEl.getElementsByTagNameNS(WORD_NS, 'start')[0]?.getAttributeNS(WORD_NS, 'val');
      const start = startStr ? parseInt(startStr, 10) : 1;
      levels.set(ilvl, { numFmt, lvlText, start: Number.isFinite(start) ? start : 1 });
    }
    abstractLevels.set(abstractId, levels);
  }

  const numToAbstract = new Map<string, string>();
  const numEls = Array.from(doc.getElementsByTagNameNS(WORD_NS, 'num'));
  for (const numEl of numEls) {
    const numId = numEl.getAttributeNS(WORD_NS, 'numId');
    const abstractRef = numEl.getElementsByTagNameNS(WORD_NS, 'abstractNumId')[0]?.getAttributeNS(WORD_NS, 'val');
    if (numId !== null && abstractRef !== null) numToAbstract.set(numId, abstractRef);
  }

  return { numToAbstract, abstractLevels };
}

function lettersFromIndex(n: number, upper: boolean): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(97 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return upper ? s.toUpperCase() : s;
}

function toRoman(num: number, uppercase: boolean): string {
  const table: [number, string][] = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let n = num;
  let result = '';
  for (const [value, sym] of table) {
    while (n >= value) {
      result += sym;
      n -= value;
    }
  }
  return uppercase ? result.toUpperCase() : result;
}

function renderNumber(numFmt: string, n: number): string | null {
  switch (numFmt) {
    case 'decimal':
      return String(n);
    case 'decimalZero':
      return String(n).padStart(2, '0');
    case 'upperLetter':
      return lettersFromIndex(n, true);
    case 'lowerLetter':
      return lettersFromIndex(n, false);
    case 'upperRoman':
      return toRoman(n, true);
    case 'lowerRoman':
      return toRoman(n, false);
    default:
      return null; // bullet, none, ... -> không tổng hợp được số hiển thị, bỏ qua
  }
}

/** Bộ đếm cho từng (numId, ilvl) — 1 danh sách auto-number tăng dần độc lập theo cặp này. */
export type ListCounters = Map<string, number>;

export function createListCounters(): ListCounters {
  return new Map();
}

/**
 * Tính chuỗi số/chữ Word sẽ hiển thị cho 1 đoạn văn có <w:numPr>, dựa trên numbering.xml.
 * Trả về null nếu đoạn văn không thuộc danh sách tự động, hoặc định dạng không hỗ trợ (bullet...).
 */
export function resolveAutoNumberPrefix(
  numId: string,
  ilvl: number,
  numbering: NumberingContext,
  counters: ListCounters,
): string | null {
  const abstractId = numbering.numToAbstract.get(numId);
  if (abstractId === undefined) return null;
  const levelDef = numbering.abstractLevels.get(abstractId)?.get(String(ilvl));
  if (!levelDef) return null;

  // Cấp con (ilvl sâu hơn) phải reset về đầu khi gặp lại 1 mục ở cấp cha — đúng hành vi Word.
  for (const key of Array.from(counters.keys())) {
    if (!key.startsWith(`${numId}:`)) continue;
    const otherIlvl = parseInt(key.split(':')[1], 10);
    if (otherIlvl > ilvl) counters.delete(key);
  }

  const counterKey = `${numId}:${ilvl}`;
  const current = counters.get(counterKey) ?? levelDef.start - 1;
  const next = current + 1;
  counters.set(counterKey, next);

  const rendered = renderNumber(levelDef.numFmt, next);
  if (rendered === null) return null;

  return levelDef.lvlText.replace(/%\d+/g, rendered);
}
