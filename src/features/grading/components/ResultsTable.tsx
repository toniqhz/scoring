import type { GradingResult } from '../../../types/gradingResult';

interface Props {
  results: GradingResult[];
}

function describeIssues(r: GradingResult): string[] {
  const issues: string[] = [];
  if (r.processError) issues.push(`Lỗi xử lý: ${r.processError}`);
  if (r.flags.alignmentFailed) issues.push('Không nhận diện được marker góc (ảnh lệch/mờ)');
  if (r.flags.examCodeNotFound) issues.push('Không xác định được mã đề');
  if (r.flags.examCodeAmbiguous) issues.push('Ô mã đề tô mờ/không rõ');
  if (r.flags.mssvNotFound) issues.push('Không khớp MSSV với danh sách lớp');
  if (r.flags.mssvAmbiguous) issues.push('Ô mã số sinh viên tô mờ/không rõ/bỏ trống');
  if (r.flags.lowConfidenceCount > 0) issues.push(`${r.flags.lowConfidenceCount} câu tô mờ/nhiều đáp án`);
  return issues;
}

export function ResultsTable({ results }: Props) {
  return (
    <div className="results-table-wrap">
      <table className="results-table">
        <thead>
          <tr>
            <th>STT</th>
            <th>File</th>
            <th>MSSV</th>
            <th>Họ tên</th>
            <th>Mã đề</th>
            <th>Điểm</th>
            <th>Đúng/Tổng</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const issues = describeIssues(r);
            return (
              <tr key={r.sheetId} className={r.needsManualReview ? 'needs-review' : ''}>
                <td>{i + 1}</td>
                <td className="file-cell">{r.fileName}</td>
                <td>{r.mssv ?? '—'}</td>
                <td>{r.hoTen ?? '—'}</td>
                <td>{r.examCode ?? '—'}</td>
                <td>{r.score ?? '—'}</td>
                <td>
                  {r.correctCount}/{r.totalQuestions}
                </td>
                <td>
                  {r.needsManualReview ? (
                    <span className="review-badge" title={issues.join('; ')}>
                      Cần xem lại
                    </span>
                  ) : (
                    <span className="ok-badge">OK</span>
                  )}
                  {issues.length > 0 && <div className="issue-hint">{issues.join('; ')}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
