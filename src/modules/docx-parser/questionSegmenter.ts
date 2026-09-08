import { v4 as uuidv4 } from 'uuid';
import type { DocxParagraph } from './xmlExtract';
import type { Question, QuestionOption } from '../../types/question';

const QUESTION_RE = /^C[aâ]u\s*\d+\s*[.):]?\s*/iu;
const OPTION_RE = /^([A-D])\s*[.):]\s*(.*)$/u;
const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;
type OptionLetter = (typeof OPTION_LETTERS)[number];

interface DraftOption {
  letter: OptionLetter;
  text: string;
  bold: boolean;
}

interface DraftQuestion {
  originalIndex: number;
  stemLines: string[];
  options: DraftOption[];
}

/** Tách danh sách đoạn văn bản đã đọc từ .docx thành các câu hỏi trắc nghiệm có cấu trúc. */
export function segmentQuestions(paragraphs: DocxParagraph[]): Question[] {
  const drafts: DraftQuestion[] = [];
  let current: DraftQuestion | null = null;

  for (const para of paragraphs) {
    const text = para.text.trim();
    if (!text) continue;

    const qMatch = QUESTION_RE.exec(text);
    if (qMatch) {
      if (current) drafts.push(current);
      current = {
        originalIndex: drafts.length,
        stemLines: [text.slice(qMatch[0].length).trim()].filter(Boolean),
        options: [],
      };
      continue;
    }

    if (!current) continue; // văn bản trước câu hỏi đầu tiên (tiêu đề đề thi...) bỏ qua

    const oMatch = OPTION_RE.exec(text);
    if (oMatch) {
      const letter = oMatch[1] as OptionLetter;
      current.options.push({ letter, text: oMatch[2].trim(), bold: para.boldRatio > 0.5 });
      continue;
    }

    // Dòng nối tiếp: nếu đã bắt đầu liệt kê đáp án thì nối vào đáp án cuối, ngược lại nối vào đề bài
    if (current.options.length > 0) {
      current.options[current.options.length - 1].text += ' ' + text;
    } else {
      current.stemLines.push(text);
    }
  }
  if (current) drafts.push(current);

  return drafts.map(draftToQuestion);
}

function draftToQuestion(draft: DraftQuestion): Question {
  const issues: string[] = [];
  const options: QuestionOption[] = [];
  let correctOptionId: string | null = null;

  const byLetter = new Map(draft.options.map((o) => [o.letter, o]));
  const boldMatches = draft.options.filter((o) => o.bold);

  for (const letter of OPTION_LETTERS) {
    const found = byLetter.get(letter);
    const id = uuidv4();
    if (!found) {
      issues.push(`Thiếu đáp án ${letter}`);
      options.push({ id, text: '' });
      continue;
    }
    options.push({ id, text: found.text });
    if (found.bold) correctOptionId = id;
  }

  if (draft.options.length !== 4) {
    issues.push(`Tìm thấy ${draft.options.length} đáp án, cần đúng 4 (A/B/C/D)`);
  }
  if (boldMatches.length === 0) {
    issues.push('Không tìm thấy đáp án in đậm (đáp án đúng)');
  } else if (boldMatches.length > 1) {
    issues.push(`Có ${boldMatches.length} đáp án được in đậm, chỉ được đúng 1`);
    correctOptionId = null;
  }

  const stemText = draft.stemLines.join(' ').trim();
  if (!stemText) {
    issues.push('Câu hỏi không có nội dung');
  }

  return {
    id: uuidv4(),
    originalIndex: draft.originalIndex,
    text: stemText,
    options,
    correctOptionId,
    parseIssues: issues,
  };
}
