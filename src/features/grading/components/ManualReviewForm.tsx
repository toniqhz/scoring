import { useMemo, useState } from 'react';
import { letterAt } from '../../../lib/optionLetters';
import { computeManualReview } from '../../../modules/grading/applyManualReview';
import type { AnswerKeyBundle } from '../../../types/answerKey';
import type { RosterEntry } from '../../../types/roster';
import type { GradingResult } from '../../../types/gradingResult';

interface Props {
  result: GradingResult;
  answerKeyBundle: AnswerKeyBundle;
  roster: RosterEntry[];
  rosterByMssv: Map<string, RosterEntry>;
  onSave: (updated: GradingResult) => void;
  onCancel: () => void;
}

/** Vị trí các câu ĐÃ được giáo viên chỉnh tay và lưu lại từ trước (ở lần mở form trước đó) — dùng để
 * (a) không hiện lại các câu này trong danh sách "cần xem lại" nữa, và (b) giữ nguyên lựa chọn cũ
 * nếu form được mở lại/lưu thêm lần nữa (không để mất lựa chọn đã chốt trước đó). */
function seedOverridesFromResult(result: GradingResult): Record<number, string[]> {
  const seeded: Record<number, string[]> = {};
  for (const q of result.questionResults) {
    if (q.manuallyEdited) seeded[q.position] = q.detectedLetters;
  }
  return seeded;
}

export function ManualReviewForm({ result, answerKeyBundle, roster, rosterByMssv, onSave, onCancel }: Props) {
  const [examCode, setExamCode] = useState<string | null>(result.examCode);
  const [mssv, setMssv] = useState<string | null>(result.mssv);
  const [overrides, setOverrides] = useState<Record<number, string[]>>(() => seedOverridesFromResult(result));
  // Chốt 1 lần lúc mở form — các câu đã sửa+lưu từ TRƯỚC (không tính các câu vừa sửa TRONG phiên
  // đang mở này) sẽ bị loại khỏi danh sách hiện ra, đúng yêu cầu "không hiện lại nữa".
  const alreadyResolvedPositions = useMemo(
    () => new Set(result.questionResults.filter((q) => q.manuallyEdited).map((q) => q.position)),
    [result],
  );

  const preview = useMemo(
    () => computeManualReview(result, { examCode, mssv, questionOverrides: overrides }, answerKeyBundle, rosterByMssv),
    [result, examCode, mssv, overrides, answerKeyBundle, rosterByMssv],
  );

  // Danh sách câu cần xem lại được chốt theo trạng thái đọc được TRƯỚC khi giáo viên chọn tay
  // (không phụ thuộc `overrides`) — để chọn xong 1 câu không làm nó biến mất khỏi danh sách,
  // tránh gây khó theo dõi khi đang sửa nhiều câu cùng lúc. Câu đã lưu sửa tay từ lần trước thì
  // loại hẳn khỏi danh sách (alreadyResolvedPositions), không hiện lại nữa.
  const basePreview = useMemo(
    () => computeManualReview(result, { examCode, mssv, questionOverrides: {} }, answerKeyBundle, rosterByMssv),
    [result, examCode, mssv, answerKeyBundle, rosterByMssv],
  );

  const letters = Array.from({ length: answerKeyBundle.maxOptionsPerQuestion }, (_, i) => letterAt(i));
  const questionsToReview = basePreview.questionResults.filter(
    (q) => q.ambiguous && !alreadyResolvedPositions.has(q.position),
  );
  const previewByPosition = new Map(preview.questionResults.map((q) => [q.position, q]));

  function toggleOverrideLetter(position: number, letter: string, currentLetters: string[]) {
    const next = currentLetters.includes(letter)
      ? currentLetters.filter((l) => l !== letter)
      : [...currentLetters, letter];
    setOverrides((prev) => ({ ...prev, [position]: next }));
  }

  function clearOverride(position: number) {
    setOverrides((prev) => ({ ...prev, [position]: [] }));
  }

  function handleSave() {
    // Bấm "Lưu" tức là giáo viên đã xem qua và xác nhận MỌI câu đang hiện trong danh sách — kể cả
    // câu chưa hề đụng tới ô nào (vd gợi ý sẵn đã đúng, không cần đổi) — nên phải tính là đã xác
    // nhận tay (manuallyEdited), không chỉ những câu có bấm đổi ô. Nếu không, câu đó sẽ vẫn hiện
    // lại ở danh sách "cần xem lại" trong lần mở form sau, dù giáo viên đã xem qua rồi.
    const confirmedOverrides = { ...overrides };
    for (const q of questionsToReview) {
      if (!Object.prototype.hasOwnProperty.call(confirmedOverrides, q.position)) {
        confirmedOverrides[q.position] = q.detectedLetters;
      }
    }
    const finalResult = computeManualReview(
      result,
      { examCode, mssv, questionOverrides: confirmedOverrides },
      answerKeyBundle,
      rosterByMssv,
    );
    onSave(finalResult);
  }

  return (
    <div className="manual-review-form">
      <div className="manual-review-row">
        <label>
          Mã đề
          <select value={examCode ?? ''} onChange={(e) => setExamCode(e.target.value || null)}>
            <option value="">-- Chưa xác định --</option>
            {answerKeyBundle.variants.map((v) => (
              <option key={v.examCode} value={v.examCode}>
                {v.examCode}
              </option>
            ))}
          </select>
        </label>
        <label>
          MSSV
          <select value={mssv ?? ''} onChange={(e) => setMssv(e.target.value || null)}>
            <option value="">-- Chưa xác định --</option>
            {roster.map((r) => (
              <option key={r.mssv} value={r.mssv}>
                {r.mssv} — {r.hoTen}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!examCode && <p className="issue-hint">Chọn mã đề trước để xem danh sách câu cần chọn lại đáp án.</p>}

      {examCode && questionsToReview.length === 0 && (
        <p className="ok-text">Không còn câu nào cần xem lại đáp án.</p>
      )}

      {examCode && questionsToReview.length > 0 && (
        <div className="manual-review-questions">
          <p className="issue-hint">
            {questionsToReview.length} câu tô mờ/nhiều đáp án — chọn lại bằng tay theo đúng bài scan. Có thể chọn
            nhiều ô nếu sinh viên tô nhiều hơn 1 đáp án (vẫn được lưu lại đủ, nhưng luôn tính là sai).
          </p>
          {questionsToReview.map((q) => {
            const currentLetters = Object.prototype.hasOwnProperty.call(overrides, q.position)
              ? overrides[q.position]
              : q.detectedLetters;
            const isAnswered = Object.prototype.hasOwnProperty.call(overrides, q.position);
            const current = previewByPosition.get(q.position);
            return (
              <div className={`manual-review-question${isAnswered ? ' is-answered' : ''}`} key={q.position}>
                <span className="manual-review-question-label">
                  Câu {q.position}:{isAnswered && <span className={current?.isCorrect ? 'is-correct' : 'is-wrong'}> {current?.isCorrect ? '✓' : '✗'}</span>}
                </span>
                <div className="manual-review-options">
                  {letters.map((letter) => (
                    <label key={letter} className="manual-review-option">
                      <input
                        type="checkbox"
                        checked={currentLetters.includes(letter)}
                        onChange={() => toggleOverrideLetter(q.position, letter, currentLetters)}
                      />
                      {letter}
                    </label>
                  ))}
                  <label className="manual-review-option">
                    <input
                      type="checkbox"
                      checked={currentLetters.length === 0}
                      onChange={() => clearOverride(q.position)}
                    />
                    Để trống
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="manual-review-summary">
        Điểm tạm tính: <strong>{preview.score ?? '—'}</strong> ({preview.correctCount}/{preview.totalQuestions} câu
        đúng)
      </div>

      <div className="manual-review-actions">
        <button type="button" onClick={handleSave}>
          Lưu kết quả chỉnh tay
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Hủy
        </button>
      </div>
    </div>
  );
}
