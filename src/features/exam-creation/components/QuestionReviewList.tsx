import { useState } from 'react';
import type { Question } from '../../../types/question';
import type { CrossReferenceStrategy } from '../../../modules/shuffle/generateVariants';
import { questionHasOptionCrossReference } from '../../../modules/shuffle/optionCrossReference';

interface Props {
  questions: Question[];
  crossReferenceStrategy: CrossReferenceStrategy;
  onFixCorrectOption: (questionId: string, optionId: string) => void;
  onEditQuestionText: (questionId: string, text: string) => void;
  onEditOptionText: (questionId: string, optionId: string, text: string) => void;
  onAddOption: (questionId: string) => void;
  onCloseEditing: (questionId: string) => void;
}

export function QuestionReviewList({
  questions,
  crossReferenceStrategy,
  onFixCorrectOption,
  onEditQuestionText,
  onEditOptionText,
  onAddOption,
  onCloseEditing,
}: Props) {
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());

  function toggleEditing(questionId: string) {
    const wasEditing = editingIds.has(questionId);
    setEditingIds((prev) => {
      const next = new Set(prev);
      if (wasEditing) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
    // Gọi RIÊNG (không lồng trong hàm cập nhật state ở trên) — hàm truyền cho setEditingIds phải
    // thuần (pure), không được có side effect như gọi setState của component khác bên trong.
    if (wasEditing) onCloseEditing(questionId);
  }

  return (
    <div className="question-list">
      {questions.map((q, idx) => {
        const hasCrossReference = questionHasOptionCrossReference(q.options);
        const isEditing = editingIds.has(q.id);
        return (
          <div key={q.id} className={`question-card${q.parseIssues.length > 0 ? ' has-issue' : ''}`}>
            <div className="question-card-header">
              <span className="question-index">Câu {idx + 1}</span>
              {q.parseIssues.length > 0 && <span className="issue-badge">Cần kiểm tra</span>}
              {hasCrossReference && crossReferenceStrategy === 'lock' && (
                <span
                  className="locked-badge"
                  title='Phát hiện đáp án nhắc tới chữ cái đáp án khác (vd "Cả A và B đều đúng") — đã giữ nguyên thứ tự đáp án cho câu này khi trộn đề để không bị sai nghĩa.'
                >
                  🔒 Giữ nguyên thứ tự đáp án
                </span>
              )}
              {hasCrossReference && crossReferenceStrategy === 'rewrite' && (
                <span
                  className="rewrite-badge"
                  title='Phát hiện đáp án nhắc tới chữ cái đáp án khác (vd "Cả A và B đều đúng") — vẫn xáo đáp án bình thường, chữ cái sẽ được TỰ CẬP NHẬT theo vị trí mới. Hãy mở lại đề đã tạo để kiểm tra trước khi in.'
                >
                  🔄 Sẽ tự cập nhật chữ cái khi trộn
                </span>
              )}
              <button type="button" className="edit-toggle-btn" onClick={() => toggleEditing(q.id)}>
                {isEditing ? '✓ Xong' : '✎ Sửa'}
              </button>
            </div>

            {isEditing ? (
              <textarea
                className="question-text-input"
                value={q.text}
                onChange={(e) => onEditQuestionText(q.id, e.target.value)}
                placeholder="(không có nội dung)"
                rows={2}
                autoFocus
              />
            ) : (
              <p className="question-text">{q.text || <em>(không có nội dung)</em>}</p>
            )}

            <ul className="option-list">
              {q.options.map((opt, i) =>
                isEditing ? (
                  <li key={opt.id} className={opt.id === q.correctOptionId ? 'correct' : ''}>
                    <input
                      type="radio"
                      name={`correct-${q.id}`}
                      checked={opt.id === q.correctOptionId}
                      onChange={() => onFixCorrectOption(q.id, opt.id)}
                      title="Đánh dấu là đáp án đúng"
                    />
                    <span className="option-letter">{String.fromCharCode(65 + i)}.</span>
                    <input
                      type="text"
                      className="option-text-input"
                      value={opt.text}
                      onChange={(e) => onEditOptionText(q.id, opt.id, e.target.value)}
                      placeholder="(trống)"
                    />
                  </li>
                ) : (
                  <li key={opt.id} className={opt.id === q.correctOptionId ? 'correct' : ''}>
                    <span className="option-mark" aria-hidden="true">
                      {opt.id === q.correctOptionId ? '✓' : '○'}
                    </span>
                    {String.fromCharCode(65 + i)}. {opt.text || <em>(trống)</em>}
                  </li>
                ),
              )}
            </ul>
            {isEditing && (
              <div className="add-option-row">
                <button type="button" className="add-option-btn" onClick={() => onAddOption(q.id)}>
                  + Thêm đáp án
                </button>
                <span className="field-hint">Đáp án để trống sẽ tự xóa khi bấm "Xong"</span>
              </div>
            )}
            {q.parseIssues.length > 0 && (
              <ul className="issue-list">
                {q.parseIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
