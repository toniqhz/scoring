import { Fragment, useState } from 'react';
import type { GradingResult } from '../../../types/gradingResult';
import type { AnswerKeyBundle } from '../../../types/answerKey';
import type { RosterEntry } from '../../../types/roster';
import { ManualReviewForm } from './ManualReviewForm';

interface Props {
  results: GradingResult[];
  answerKeyBundle: AnswerKeyBundle;
  roster: RosterEntry[];
  rosterByMssv: Map<string, RosterEntry>;
  onUpdateResult: (updated: GradingResult) => void;
  onSetDiscarded: (sheetId: string, discarded: boolean) => void;
}

function displayFileLabel(r: GradingResult): string {
  return r.mssv ? `${r.mssv}${r.hoTen ? `-${r.hoTen}` : ''}` : r.fileName;
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

export function ResultsTable({ results, answerKeyBundle, roster, rosterByMssv, onUpdateResult, onSetDiscarded }: Props) {
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);

  function handleDiscard(r: GradingResult) {
    const label = displayFileLabel(r);
    if (!window.confirm(`Bỏ bài thi "${label}" khỏi bảng điểm? (dùng khi có 2 ảnh scan trùng của cùng 1 sinh viên)`)) {
      return;
    }
    if (editingSheetId === r.sheetId) setEditingSheetId(null);
    onSetDiscarded(r.sheetId, true);
  }

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
            const isEditing = editingSheetId === r.sheetId;
            return (
              <Fragment key={r.sheetId}>
                <tr className={r.discarded ? 'discarded' : r.needsManualReview ? 'needs-review' : ''}>
                  <td>{i + 1}</td>
                  <td className="file-cell">
                    {r.previewUrl ? (
                      <a href={r.previewUrl} target="_blank" rel="noreferrer" title={r.fileName}>
                        {displayFileLabel(r)}
                      </a>
                    ) : (
                      <span title={r.fileName}>{displayFileLabel(r)}</span>
                    )}
                  </td>
                  <td>{r.mssv ?? '—'}</td>
                  <td>{r.hoTen ?? '—'}</td>
                  <td>{r.examCode ?? '—'}</td>
                  <td>{r.score ?? '—'}</td>
                  <td>
                    {r.correctCount}/{r.totalQuestions}
                  </td>
                  <td>
                    {r.discarded ? (
                      <span className="discarded-badge">Đã bỏ</span>
                    ) : r.needsManualReview ? (
                      <span className="review-badge" title={issues.join('; ')}>
                        Cần xem lại
                      </span>
                    ) : (
                      <span className="ok-badge">{r.manuallyReviewed ? 'OK (đã chỉnh tay)' : 'OK'}</span>
                    )}
                    {issues.length > 0 && <div className="issue-hint">{issues.join('; ')}</div>}
                    <div>
                      {!r.discarded && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setEditingSheetId(isEditing ? null : r.sheetId)}
                        >
                          {isEditing ? 'Đóng' : 'Sửa tay'}
                        </button>
                      )}
                      {r.discarded ? (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => onSetDiscarded(r.sheetId, false)}
                        >
                          Khôi phục
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="link-button link-button-danger"
                          onClick={() => handleDiscard(r)}
                        >
                          Bỏ bài thi
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isEditing && (
                  <tr className="manual-review-row-wrap">
                    <td colSpan={8}>
                      <ManualReviewForm
                        result={r}
                        answerKeyBundle={answerKeyBundle}
                        roster={roster}
                        rosterByMssv={rosterByMssv}
                        onSave={(updated) => {
                          onUpdateResult(updated);
                          setEditingSheetId(null);
                        }}
                        onCancel={() => setEditingSheetId(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
