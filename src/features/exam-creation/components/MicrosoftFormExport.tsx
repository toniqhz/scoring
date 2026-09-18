import { useState } from 'react';
import { extractExamXmlStructure } from '../../../modules/docx-export/xmlBlockExtractor';
import { generateRawExamDocxForImport, type RawExamDocxMode } from '../../../modules/docx-export/generateExamDocx';
import { downloadBlob } from '../../../lib/downloadFile';
import type { Question } from '../../../types/question';

interface Props {
  fileBaseName: string;
  originalDocxBuffer: ArrayBuffer | null;
  questions: Question[];
  /** true nếu chưa đủ điều kiện xuất (còn lỗi ở validateExport.ts, hoặc chưa có câu hợp lệ nào). */
  disabled: boolean;
}

export function MicrosoftFormExport({ fileBaseName, originalDocxBuffer, questions, disabled }: Props) {
  const [mode, setMode] = useState<RawExamDocxMode>('quiz');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleExport() {
    setError(null);
    setSuccess(false);
    if (disabled) return;
    if (!originalDocxBuffer) {
      setError('Chưa có file đề gốc — hãy tải lại file .docx.');
      return;
    }
    setIsExporting(true);
    try {
      const structure = await extractExamXmlStructure(originalDocxBuffer);
      const docxBytes = await generateRawExamDocxForImport({
        originalDocxBuffer,
        structure,
        questions,
        mode,
      });
      const blob = new Blob([docxBytes as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      downloadBlob(blob, `${fileBaseName}_import-microsoft-forms.docx`);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định khi xuất file.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="export-card">
      <p className="field-hint">
        Xuất 1 file .docx "thô" theo đúng định dạng Microsoft Forms Quick Import khuyến nghị — giữ
        nguyên thứ tự câu hỏi/đáp án như file gốc (không xáo, chỉ 1 bản duy nhất), câu hỏi đánh số
        "1.", "2."..., đáp án đúng in đậm, có dòng trống ngăn cách giữa các câu. Kéo file này vào
        Microsoft Forms → Import → Word để tạo câu hỏi hàng loạt, đỡ phải gõ lại từng câu.
      </p>

      <div className="form-mode-choice" role="radiogroup" aria-label="Loại form">
        <label>
          <input type="radio" name="ms-form-mode" value="quiz" checked={mode === 'quiz'} onChange={() => setMode('quiz')} />
          Quiz (có đáp án đúng)
        </label>
        <label>
          <input type="radio" name="ms-form-mode" value="form" checked={mode === 'form'} onChange={() => setMode('form')} />
          Form (khảo sát, không có đáp án đúng)
        </label>
      </div>
      {mode === 'quiz' ? (
        <p className="field-hint">
          Kèm dòng "ANSWER: X" dưới mỗi câu để Microsoft Forms tự nhận đáp án đúng khi bạn chọn tạo
          Quiz lúc import. Lưu ý: dòng này CHƯA được Microsoft xác nhận chính thức là đọc được — nếu
          Forms không tự nhận, bạn vẫn cần tự bấm chọn lại đáp án đúng cho từng câu sau khi import.
        </p>
      ) : (
        <p className="field-hint">Không kèm dòng "ANSWER:" — phù hợp khi tạo Form khảo sát thường, không chấm điểm.</p>
      )}

      <button onClick={handleExport} disabled={disabled || isExporting}>
        {isExporting ? 'Đang xuất...' : 'Tải file .docx để Import vào Microsoft Forms'}
      </button>
      {disabled && <p className="field-hint">Sửa hết lỗi ở phần "Bước 3" phía trên trước khi xuất file.</p>}
      {error && <p className="error-text">{error}</p>}
      {success && <p className="success-text">Đã tạo và tải xuống file .docx thành công.</p>}
    </section>
  );
}
