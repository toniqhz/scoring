import { useMemo, useState } from 'react';
import { parseRosterFile } from '../../modules/excel/rosterImport';
import { parseScoreFile } from '../../modules/excel/scoreFileImport';
import { exportMergedScoresToXlsxBytes, type ExamColumn } from '../../modules/excel/scoreMergeExport';
import { downloadBlob } from '../../lib/downloadFile';
import type { RosterEntry } from '../../types/roster';
import './ScoreMergePage.css';

function labelFromFileName(fileName: string): string {
  return fileName.replace(/\.(xlsx|xls)$/i, '').replace(/_bang-diem$/i, '');
}

export function ScoreMergePage() {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterFileName, setRosterFileName] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [examColumns, setExamColumns] = useState<ExamColumn[]>([]);
  const [scoreFileErrors, setScoreFileErrors] = useState<string[]>([]);
  const [isReadingScoreFiles, setIsReadingScoreFiles] = useState(false);

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
      setRosterError(err instanceof Error ? err.message : 'Không đọc được file danh sách sinh viên');
    }
  }

  async function handleScoreFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setIsReadingScoreFiles(true);
    setScoreFileErrors([]);
    const columns: ExamColumn[] = [];
    const errors: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const { scoresByMssv, rowCount } = await parseScoreFile(file);
        if (rowCount === 0) {
          throw new Error('không đọc được MSSV nào — kiểm tra tên cột (MSSV, Điểm)');
        }
        columns.push({ id: `${file.name}-${i}`, label: labelFromFileName(file.name), scoresByMssv });
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'lỗi không xác định'}`);
      }
    }
    setExamColumns(columns);
    setScoreFileErrors(errors);
    setIsReadingScoreFiles(false);
  }

  const mergedRows = useMemo(
    () =>
      roster.map((student) => ({
        mssv: student.mssv,
        hoTen: student.hoTen,
        scores: examColumns.map((col) => col.scoresByMssv.get(student.mssv) ?? null),
      })),
    [roster, examColumns],
  );

  const missingGroups = useMemo(
    () =>
      examColumns
        .map((col) => ({
          label: col.label,
          missing: roster.filter((s) => !col.scoresByMssv.has(s.mssv)),
        }))
        .filter((g) => g.missing.length > 0),
    [roster, examColumns],
  );

  async function handleExport() {
    const bytes = await exportMergedScoresToXlsxBytes(roster, examColumns);
    const blob = new Blob([bytes as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, 'bang-diem-tong-hop.xlsx');
  }

  return (
    <div className="score-merge-page">
      <h2>Bước 1: Danh sách sinh viên tổng</h2>
      <section className="upload-section">
        <label className="file-input-label">
          <input type="file" accept=".xlsx,.xls" onChange={handleRosterChange} />
          Danh sách sinh viên (Excel: MSSV, Họ tên)
        </label>
        {rosterFileName && <span className="file-name">{rosterFileName}</span>}
        {rosterError && <p className="error-text">{rosterError}</p>}
        {roster.length > 0 && <p className="ok-text">Đọc được {roster.length} sinh viên.</p>}
      </section>

      <h2>Bước 2: Tải các file điểm (1 file / kỳ thi)</h2>
      <section className="upload-section">
        <label className="file-input-label">
          <input type="file" accept=".xlsx,.xls" multiple onChange={handleScoreFilesChange} />
          Chọn các file điểm (có thể chọn nhiều file cùng lúc)
        </label>
        <p className="field-hint">
          Mỗi file là điểm của 1 kỳ thi (vd file "Bảng điểm" xuất ra từ bước Chấm bài) — tên cột dùng
          tự động dò theo "MSSV"/"Điểm", tên file (bỏ đuôi) dùng làm tên cột kỳ thi trong bảng tổng
          hợp.
        </p>
        {isReadingScoreFiles && <p className="field-hint">Đang đọc file...</p>}
        {examColumns.length > 0 && (
          <p className="ok-text">
            Đọc được {examColumns.length} kỳ thi: {examColumns.map((c) => c.label).join(', ')}.
          </p>
        )}
        {scoreFileErrors.length > 0 && (
          <ul className="error-text">
            {scoreFileErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </section>

      {roster.length > 0 && examColumns.length > 0 && (
        <>
          <h2>Bước 3: Bảng điểm tổng hợp</h2>
          <section className="results-summary">
            <p>
              {roster.length} sinh viên × {examColumns.length} kỳ thi.
            </p>
            <button onClick={handleExport}>Xuất Excel bảng điểm tổng hợp</button>
          </section>

          {missingGroups.length > 0 && (
            <section className="missing-scores-panel">
              <h3>⚠ Sinh viên thiếu bài thi</h3>
              <ul>
                {missingGroups.map((g) => (
                  <li key={g.label}>
                    <strong>{g.label}</strong> ({g.missing.length} sinh viên thiếu):{' '}
                    {g.missing.map((s) => `${s.mssv}${s.hoTen ? ` - ${s.hoTen}` : ''}`).join('; ')}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="merged-scores-table-wrap">
            <table className="merged-scores-table">
              <thead>
                <tr>
                  <th>MSSV</th>
                  <th>Họ tên</th>
                  {examColumns.map((c) => (
                    <th key={c.id}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mergedRows.map((row) => (
                  <tr key={row.mssv}>
                    <td>{row.mssv}</td>
                    <td>{row.hoTen}</td>
                    {row.scores.map((score, i) => (
                      <td key={examColumns[i].id} className={score === null ? 'missing-score' : ''}>
                        {score ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
