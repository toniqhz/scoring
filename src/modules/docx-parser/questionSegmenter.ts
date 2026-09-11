import { v4 as uuidv4 } from 'uuid';
import type { DocxParagraph } from './xmlExtract';
import type { Question, QuestionOption } from '../../types/question';
import { letterAt } from '../../lib/optionLetters';
import { QUESTION_RE, OPTION_RE, MIN_OPTIONS } from './patterns';

interface DraftOption {
  letter: string;
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
      current.options.push({ letter: oMatch[1], text: oMatch[2].trim(), bold: para.boldRatio > 0.5 });
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

/**
 * Không ép cứng số đáp án = 4 — mỗi câu có thể có số đáp án khác nhau (2, 4, 5, 6...),
 * miễn là các chữ cái liên tục bắt đầu từ A (A, A-B, A-B-C, ...). Phiếu trả lời sẽ được
 * sinh theo số đáp án LỚN NHẤT trong toàn bộ ngân hàng câu hỏi (xem generateVariants.ts).
 */
function draftToQuestion(draft: DraftQuestion): Question {
  const issues: string[] = [];
  const options: QuestionOption[] = [];
  let correctOptionId: string | null = null;

  const byLetter = new Map(draft.options.map((o) => [o.letter, o]));
  const boldMatches = draft.options.filter((o) => o.bold);

  const highestLetterIndex = draft.options.reduce((max, o) => {
    const idx = o.letter.charCodeAt(0) - 65;
    return idx > max ? idx : max;
  }, -1);
  const expectedCount = Math.max(highestLetterIndex + 1, draft.options.length);

  for (let i = 0; i < expectedCount; i++) {
    const letter = letterAt(i);
    const found = byLetter.get(letter);
    const id = uuidv4();
    if (!found) {
      issues.push(`Thiếu đáp án ${letter}`);
      options.push({ id, text: '', sourceLetter: letter });
      continue;
    }
    options.push({ id, text: found.text, sourceLetter: letter });
    if (found.bold) correctOptionId = id;
  }

  if (options.length < MIN_OPTIONS) {
    issues.push(`Câu hỏi cần tối thiểu ${MIN_OPTIONS} đáp án (tìm thấy ${options.length})`);
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
