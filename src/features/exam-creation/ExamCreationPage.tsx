import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { parseDocxFile } from '../../modules/docx-parser';
import { generateVariants, type CrossReferenceStrategy } from '../../modules/shuffle/generateVariants';
import { questionHasOptionCrossReference } from '../../modules/shuffle/optionCrossReference';
import { letterAt } from '../../lib/optionLetters';
import { buildExportBundle } from './buildExportBundle';
import { downloadBlob } from '../../lib/downloadFile';
import { QuestionReviewList } from './components/QuestionReviewList';
import type { Question } from '../../types/question';
import './ExamCreationPage.css';

export function ExamCreationPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [originalDocxBuffer, setOriginalDocxBuffer] = useState<ArrayBuffer | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const [examTitle, setExamTitle] = useState('Đề kiểm tra');
  const [count, setCount] = useState(4);
  const [startCode, setStartCode] = useState(101);
  const [crossReferenceStrategy, setCrossReferenceStrategy] = useState<CrossReferenceStrategy>('lock');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateSuccess, setGenerateSuccess] = useState(false);
  const [generatedCrossReferenceCount, setGeneratedCrossReferenceCount] = useState(0);

  const validCount = useMemo(
    () => questions.filter((q) => q.parseIssues.length === 0 && q.correctOptionId).length,
    [questions],
  );
  const crossReferenceCount = useMemo(
    () => questions.filter((q) => questionHasOptionCrossReference(q.options)).length,
    [questions],
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    setGenerateSuccess(false);
    setIsParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      setOriginalDocxBuffer(buffer);
      const result = await parseDocxFile(file);
      setQuestions(result.questions);
      if (result.questions.length === 0) {
        setParseError(
          'Không tìm thấy câu hỏi nào. Kiểm tra định dạng "Câu 1:", "A.", "B.", "C.", "D." trong file Word.',
        );
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Lỗi không xác định khi đọc file');
      setQuestions([]);
      setOriginalDocxBuffer(null);
    } finally {
      setIsParsing(false);
    }
  }

  function handleFixCorrectOption(questionId: string, optionId: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        const remainingIssues = q.parseIssues.filter((issue) => !issue.includes('in đậm'));
        return { ...q, correctOptionId: optionId, parseIssues: remainingIssues };
      }),
    );
  }

  function handleEditQuestionText(questionId: string, text: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        const parseIssues =
          text.trim().length > 0 ? q.parseIssues.filter((issue) => issue !== 'Câu hỏi không có nội dung') : q.parseIssues;
        return { ...q, text, stemEdited: true, parseIssues };
      }),
    );
  }

  function handleEditOptionText(questionId: string, optionId: string, text: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        const optIdx = q.options.findIndex((o) => o.id === optionId);
        const letter = letterAt(optIdx);
        const parseIssues =
          text.trim().length > 0 ? q.parseIssues.filter((issue) => issue !== `Thiếu đáp án ${letter}`) : q.parseIssues;
        const options = q.options.map((o) => (o.id === optionId ? { ...o, text, edited: true } : o));
        return { ...q, options, parseIssues };
      }),
    );
  }

  function handleAddOption(questionId: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        const newOption = { id: uuidv4(), text: '', edited: true };
        const options = [...q.options, newOption];
        const parseIssues = q.parseIssues.filter((issue) => !issue.startsWith('Câu hỏi cần tối thiểu'));
        return { ...q, options, parseIssues };
      }),
    );
  }

  async function handleGenerate() {
    setGenerateError(null);
    setGenerateSuccess(false);
    if (count < 1) {
      setGenerateError('Số đề cần trộn phải lớn hơn 0');
      return;
    }
    if (!originalDocxBuffer) {
      setGenerateError('Chưa có file đề gốc — hãy tải lại file .docx.');
      return;
    }
    setIsGenerating(true);
    try {
      const { variants, answerKeyBundle } = generateVariants(questions, {
        count,
        startCode,
        examTitle,
        crossReferenceStrategy,
      });
      const zipBlob = await buildExportBundle({
        examTitle,
        questions,
        variants,
        answerKeyBundle,
        originalDocxBuffer,
      });
      const baseName = fileName ? fileName.replace(/\.docx$/i, '') : examTitle.replace(/\s+/g, '_');
      downloadBlob(zipBlob, `${baseName}.zip`);
      setGenerateSuccess(true);
      setGeneratedCrossReferenceCount(crossReferenceStrategy === 'rewrite' ? crossReferenceCount : 0);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Lỗi không xác định khi tạo đề');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="exam-creation-page">
      <h2>Bước 1: Tải lên đề gốc</h2>
      <section className="upload-section">
        <label className="file-input-label">
          <input type="file" accept=".docx" onChange={handleFileChange} />
          Chọn file đề gốc (.docx) — đáp án đúng được in đậm
        </label>
        {fileName && <span className="file-name">{fileName}</span>}
        {isParsing && <p>Đang đọc file...</p>}
        {parseError && <p className="error-text">{parseError}</p>}
      </section>

      {questions.length > 0 && (
        <>
          <section className="parse-summary">
            <p>
              Đọc được <strong>{questions.length}</strong> câu hỏi — <strong>{validCount}</strong> câu hợp
              lệ, <strong>{questions.length - validCount}</strong> câu cần kiểm tra lại (chọn đáp án đúng
              bằng tay bên dưới nếu cần).
            </p>
          </section>

          {crossReferenceCount > 0 && (
            <section className="cross-reference-section">
              <p>
                Phát hiện <strong>{crossReferenceCount}</strong> câu có đáp án nhắc tới chữ cái đáp án khác
                (vd "Cả A và B đều đúng") — nếu xáo thứ tự đáp án, chữ cái được nhắc tới có thể trỏ sai đáp
                án khác. Chọn cách xử lý:
              </p>
              <label className="radio-option">
                <input
                  type="radio"
                  name="cross-reference-strategy"
                  checked={crossReferenceStrategy === 'lock'}
                  onChange={() => setCrossReferenceStrategy('lock')}
                />
                Giữ nguyên thứ tự đáp án cho các câu này (an toàn, đơn giản)
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="cross-reference-strategy"
                  checked={crossReferenceStrategy === 'rewrite'}
                  onChange={() => setCrossReferenceStrategy('rewrite')}
                />
                Vẫn xáo bình thường, tự cập nhật lại chữ cái theo vị trí mới (cần tự kiểm tra lại đề đã tạo)
              </label>
            </section>
          )}

          <h2>Bước 2: Kiểm tra câu hỏi</h2>
          <QuestionReviewList
            questions={questions}
            crossReferenceStrategy={crossReferenceStrategy}
            onFixCorrectOption={handleFixCorrectOption}
            onEditQuestionText={handleEditQuestionText}
            onEditOptionText={handleEditOptionText}
            onAddOption={handleAddOption}
          />

          <h2>Bước 3: Trộn đề & xuất file</h2>
          <section className="generate-section">
            <label>
              Tên đề thi
              <input value={examTitle} onChange={(e) => setExamTitle(e.target.value)} />
            </label>
            <label>
              Số bộ đề cần trộn (N)
              <input
                type="number"
                min={1}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            <label>
              Mã đề bắt đầu
              <input
                type="number"
                min={1}
                value={startCode}
                onChange={(e) => setStartCode(Number(e.target.value))}
              />
            </label>
            <button onClick={handleGenerate} disabled={isGenerating || validCount === 0}>
              {isGenerating ? 'Đang tạo...' : `Tạo ${count} bộ đề + phiếu trả lời + đáp án (.zip)`}
            </button>
            {generateError && <p className="error-text">{generateError}</p>}
            {generateSuccess && (
              <>
                <p className="success-text">Đã tạo và tải xuống file zip thành công.</p>
                {generatedCrossReferenceCount > 0 && (
                  <p className="warning-text">
                    ⚠ Có {generatedCrossReferenceCount} câu đáp án ghép đã được tự động cập nhật chữ cái khi
                    trộn — vui lòng mở lại các file đề đã tạo (de-thi_*.docx) để kiểm tra trước khi in/phát
                    cho sinh viên.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
