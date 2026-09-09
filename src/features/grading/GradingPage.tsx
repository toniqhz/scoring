import { useEffect, useMemo, useRef, useState } from 'react';
import { parseRosterFile } from '../../modules/excel/rosterImport';
import { exportResultsToXlsxBytes } from '../../modules/excel/resultsExport';
import { loadSheetImagesFromFiles } from '../../modules/omr/loadSheetImages';
import { OmrWorkerClient } from '../../modules/omr/omrWorkerClient';
import { matchAndScore } from '../../modules/grading/matchAndScore';
import { downloadBlob } from '../../lib/downloadFile';
import type { RosterEntry } from '../../types/roster';
import type { AnswerKeyBundle } from '../../types/answerKey';
import type { GradingResult } from '../../types/gradingResult';
import { ResultsTable } from './components/ResultsTable';
import { ScoreHistogram } from './components/ScoreHistogram';
import './GradingPage.css';

export function GradingPage() {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterFileName, setRosterFileName] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [answerKeyBundle, setAnswerKeyBundle] = useState<AnswerKeyBundle | null>(null);
  const [answerKeyFileName, setAnswerKeyFileName] = useState<string | null>(null);
  const [answerKeyError, setAnswerKeyError] = useState<string | null>(null);

  const [scanFiles, setScanFiles] = useState<File[]>([]);
  const [results, setResults] = useState<GradingResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [processError, setProcessError] = useState<string | null>(null);

  const workerClientRef = useRef<OmrWorkerClient | null>(null);
  useEffect(() => {
    return () => workerClientRef.current?.terminate();
  }, []);

  const rosterByMssv = useMemo(() => new Map(roster.map((r) => [r.mssv, r])), [roster]);

  async function handleRosterChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRosterFileName(file.name);
    setRosterError(null);
    try {
      const entries = await parseRosterFile(file);
      if (entries.length === 0) {
        throw new Error('Không đọc được MSSV nào — kiểm tra tên cột (MSSV, Họ tên) trong file Excel.');
      }
      setRoster(entries);
    } catch (err) {
      setRoster([]);
      setRosterError(err instanceof Error ? err.message : 'Không đọc được file danh sách lớp');
    }
  }

  async function handleAnswerKeyChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnswerKeyFileName(file.name);
    setAnswerKeyError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AnswerKeyBundle;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.variants)) {
        throw new Error('File đáp án không đúng định dạng (thiếu schemaVersion/variants).');
      }
      setAnswerKeyBundle(parsed);
    } catch (err) {
      setAnswerKeyBundle(null);
      setAnswerKeyError(err instanceof Error ? err.message : 'Không đọc được file đáp án (dap-an.json)');
    }
  }

  function handleScanFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    setScanFiles(Array.from(e.target.files ?? []));
  }

  async function handleGrade() {
    setProcessError(null);
    if (!answerKeyBundle) {
      setProcessError('Cần tải file đáp án (dap-an.json) trước.');
      return;
    }
    if (scanFiles.length === 0) {
      setProcessError('Chưa chọn file bài scan.');
      return;
    }

    setIsProcessing(true);
    setResults([]);
    try {
      const images = await loadSheetImagesFromFiles(scanFiles);
      setProgress({ done: 0, total: images.length });
      if (!workerClientRef.current) workerClientRef.current = new OmrWorkerClient();
      const client = workerClientRef.current;

      const collected: GradingResult[] = [];
      for (let i = 0; i < images.length; i++) {
        const { fileName, bitmap } = images[i];
        const omrResult = await client.processSheet(
          bitmap,
          answerKeyBundle.totalQuestions,
          answerKeyBundle.maxOptionsPerQuestion,
        );
        const graded = matchAndScore({
          sheetId: `${fileName}-${i}`,
          fileName,
          omrResult,
          answerKeyBundle,
          rosterByMssv,
        });
        collected.push(graded);
        setResults([...collected]);
        setProgress({ done: i + 1, total: images.length });
      }
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : 'Lỗi không xác định khi chấm bài');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleExportExcel() {
    if (!answerKeyBundle) return;
    const bytes = await exportResultsToXlsxBytes(results, answerKeyBundle);
    const blob = new Blob([bytes as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, `${answerKeyBundle?.examTitle ?? 'ket-qua'}_bang-diem.xlsx`);
  }

  const reviewCount = results.filter((r) => r.needsManualReview).length;

  return (
    <div className="grading-page">
      <h2>Bước 1: Tải danh sách lớp &amp; đáp án</h2>
      <section className="upload-section">
        <label className="file-input-label">
          <input type="file" accept=".xlsx,.xls" onChange={handleRosterChange} />
          Danh sách lớp (Excel: MSSV, Họ tên)
        </label>
        {rosterFileName && <span className="file-name">{rosterFileName}</span>}
        {rosterError && <p className="error-text">{rosterError}</p>}
        {roster.length > 0 && <p className="ok-text">Đọc được {roster.length} sinh viên.</p>}
      </section>

      <section className="upload-section">
        <label className="file-input-label">
          <input type="file" accept=".json" onChange={handleAnswerKeyChange} />
          File đáp án (dap-an.json) — từ bước tạo đề
        </label>
        {answerKeyFileName && <span className="file-name">{answerKeyFileName}</span>}
        {answerKeyError && <p className="error-text">{answerKeyError}</p>}
        {answerKeyBundle && (
          <p className="ok-text">
            {answerKeyBundle.examTitle} — {answerKeyBundle.variants.length} mã đề, {answerKeyBundle.totalQuestions}{' '}
            câu/đề.
          </p>
        )}
      </section>

      <h2>Bước 2: Tải bài scan &amp; chấm điểm</h2>
      <section className="upload-section">
        <label className="file-input-label">
          <input type="file" accept="image/*,.pdf" multiple onChange={handleScanFilesChange} />
          Chọn ảnh/PDF bài scan (có thể chọn nhiều file)
        </label>
        {scanFiles.length > 0 && <span className="file-name">{scanFiles.length} file đã chọn</span>}

        <button onClick={handleGrade} disabled={isProcessing || !answerKeyBundle || scanFiles.length === 0}>
          {isProcessing ? `Đang chấm... (${progress.done}/${progress.total})` : 'Chấm bài'}
        </button>
        {processError && <p className="error-text">{processError}</p>}
      </section>

      {results.length > 0 && (
        <>
          <h2>Bước 3: Kết quả</h2>
          <section className="results-summary">
            <p>
              {isProcessing
                ? `Đang chấm ${progress.done}/${progress.total} phiếu...`
                : `Đã chấm ${results.length} phiếu — ${results.length - reviewCount} phiếu OK, ${reviewCount} phiếu cần xem lại tay.`}
            </p>
            <button onClick={handleExportExcel} disabled={isProcessing}>
              Xuất Excel bảng điểm
            </button>
            {isProcessing && <p className="issue-hint">Đợi chấm xong toàn bộ để tránh xuất thiếu dữ liệu.</p>}
          </section>
          <ScoreHistogram results={results} />
          <ResultsTable results={results} />
        </>
      )}
    </div>
  );
}
