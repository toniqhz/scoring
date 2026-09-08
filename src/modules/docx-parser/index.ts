import { extractDocxParagraphs } from './xmlExtract';
import { segmentQuestions } from './questionSegmenter';
import type { Question } from '../../types/question';

export interface ParseDocxResult {
  questions: Question[];
  validCount: number;
  issueCount: number;
}

export async function parseDocxFile(file: File): Promise<ParseDocxResult> {
  const buffer = await file.arrayBuffer();
  const paragraphs = await extractDocxParagraphs(buffer);
  const questions = segmentQuestions(paragraphs);
  const issueCount = questions.filter((q) => q.parseIssues.length > 0).length;
  return {
    questions,
    validCount: questions.length - issueCount,
    issueCount,
  };
}

export { extractDocxParagraphs } from './xmlExtract';
export { segmentQuestions } from './questionSegmenter';
