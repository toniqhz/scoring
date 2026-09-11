import { Fragment } from 'react';
import type { CollusionGroup } from '../../../modules/grading/detectCollusion';

interface Props {
  groups: CollusionGroup[];
  minEitherWrongCount: number;
  matchRatioPercent: number;
  onMinEitherWrongCountChange: (value: number) => void;
  onMatchRatioPercentChange: (value: number) => void;
}

function label(mssv: string | null, hoTen: string | null, examCode: string): string {
  const who = mssv ? (hoTen ? `${mssv} — ${hoTen}` : mssv) : '(chưa xác định MSSV)';
  return `${who} (mã đề ${examCode})`;
}

export function CollusionPanel({
  groups,
  minEitherWrongCount,
  matchRatioPercent,
  onMinEitherWrongCountChange,
  onMatchRatioPercentChange,
}: Props) {
  return (
    <section className="collusion-panel">
      <h3>⚠ Nghi vấn trùng đáp án sai{groups.length > 0 ? ` (${groups.length} nhóm)` : ''}</h3>
      <div className="collusion-config">
        <label>
          Số câu sai chung tối thiểu
          <input
            type="number"
            min={1}
            value={minEitherWrongCount}
            onChange={(e) => onMinEitherWrongCountChange(Number(e.target.value))}
          />
        </label>
        <label>
          Tỷ lệ trùng đáp án sai tối thiểu (%)
          <input
            type="number"
            min={1}
            max={100}
            value={matchRatioPercent}
            onChange={(e) => onMatchRatioPercentChange(Number(e.target.value))}
          />
        </label>
      </div>
      <p className="field-hint">
        So mọi cặp bài với nhau (kể cả khác mã đề, vì đề bị xáo khác nhau nhưng cùng 1 ngân hàng câu
        hỏi — người ngồi gần vẫn trao đổi được dù khác mã đề) — 2 bài được coi là nghi vấn khi chọn
        ĐÚNG CÙNG 1 đáp án sai (quy về đáp án gốc) ở từ {matchRatioPercent}% trở lên các câu mà ít
        nhất 1 trong 2 người trả lời sai (chỉ tính khi có ít nhất {minEitherWrongCount} câu như vậy,
        để tránh báo nhầm do trùng hợp ngẫu nhiên trên mẫu quá nhỏ). Đây chỉ là gợi ý để xem lại tay,
        không phải kết luận.
      </p>
      {groups.length === 0 && <p className="ok-text">Không có nhóm nào nghi vấn với tham số hiện tại.</p>}
      {groups.map((g) => (
        <div className="collusion-group" key={g.groupId}>
          <div className="collusion-group-title">
            {g.groupId} — {g.members.length} bài: {g.members.map((m) => label(m.mssv, m.hoTen, m.examCode)).join(', ')}
          </div>
          <table className="collusion-pairs-table">
            <thead>
              <tr>
                <th>Sinh viên</th>
                <th>Số câu ít nhất 1 người sai</th>
                <th>Số câu trùng đáp án sai</th>
                <th>% trùng</th>
              </tr>
            </thead>
            <tbody>
              {g.pairs.map((p, i) => (
                <Fragment key={i}>
                  <tr className="collusion-pair-row-first">
                    <td>{label(p.mssvA, p.hoTenA, p.examCodeA)}</td>
                    <td rowSpan={2}>{p.eitherWrongCount}</td>
                    <td rowSpan={2}>{p.matchingWrongCount}</td>
                    <td rowSpan={2}>{p.matchPercent}%</td>
                  </tr>
                  <tr className="collusion-pair-row-last">
                    <td>{label(p.mssvB, p.hoTenB, p.examCodeB)}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
