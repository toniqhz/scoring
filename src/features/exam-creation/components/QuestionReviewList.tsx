import type { Question } from '../../../types/question';

interface Props {
  questions: Question[];
  onFixCorrectOption: (questionId: string, optionId: string) => void;
}

export function QuestionReviewList({ questions, onFixCorrectOption }: Props) {
  return (
    <div className="question-list">
      {questions.map((q, idx) => (
        <div key={q.id} className={`question-card${q.parseIssues.length > 0 ? ' has-issue' : ''}`}>
          <div className="question-card-header">
            <span className="question-index">Câu {idx + 1}</span>
            {q.parseIssues.length > 0 && <span className="issue-badge">Cần kiểm tra</span>}
          </div>
          <p className="question-text">{q.text || <em>(không có nội dung)</em>}</p>
          <ul className="option-list">
            {q.options.map((opt, i) => (
              <li key={opt.id} className={opt.id === q.correctOptionId ? 'correct' : ''}>
                <label>
                  <input
                    type="radio"
                    name={`correct-${q.id}`}
                    checked={opt.id === q.correctOptionId}
                    onChange={() => onFixCorrectOption(q.id, opt.id)}
                  />
                  {String.fromCharCode(65 + i)}. {opt.text || <em>(trống)</em>}
                </label>
              </li>
            ))}
          </ul>
          {q.parseIssues.length > 0 && (
            <ul className="issue-list">
              {q.parseIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
