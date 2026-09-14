import type { DuplicateStudentGroup } from '../../../modules/grading/detectDuplicateStudents';

interface Props {
  groups: DuplicateStudentGroup[];
}

export function DuplicateStudentPanel({ groups }: Props) {
  if (groups.length === 0) return null;

  return (
    <section className="duplicate-student-panel">
      <h3>⚠ {groups.length} sinh viên có từ 2 phiếu trở lên</h3>
      <p className="field-hint">
        Thường do scan trùng 2 ảnh của cùng 1 phiếu, hoặc nộp/scan nhầm 2 lần — kiểm tra lại rồi bấm
        "Bỏ bài thi" ở bảng bên dưới cho phiếu bị trùng (phiếu bị bỏ vẫn giữ lại để xem/khôi phục,
        chỉ không tính vào điểm/Excel xuất ra).
      </p>
      <ul>
        {groups.map((g) => (
          <li key={g.mssv}>
            <strong>
              {g.mssv}
              {g.hoTen ? ` — ${g.hoTen}` : ''}
            </strong>{' '}
            ({g.sheets.length} phiếu):{' '}
            {g.sheets
              .map((s) => `${s.fileName}${s.examCode ? ` (mã đề ${s.examCode})` : ''}${s.score !== null ? ` — ${s.score} điểm` : ''}`)
              .join('; ')}
          </li>
        ))}
      </ul>
    </section>
  );
}
