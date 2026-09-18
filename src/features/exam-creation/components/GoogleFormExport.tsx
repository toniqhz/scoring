import { useState } from 'react';
import { requestGoogleAccessToken } from '../../../modules/google-forms/googleAuth';
import { createGoogleFormFromQuestions, type CreatedGoogleForm } from '../../../modules/google-forms/createGoogleForm';
import type { Question } from '../../../types/question';

interface Props {
  examTitle: string;
  questions: Question[];
  /** true nếu chưa đủ điều kiện xuất (còn lỗi ở validateExport.ts, hoặc chưa có câu hợp lệ nào). */
  disabled: boolean;
}

const CLIENT_ID_STORAGE_KEY = 'google-forms-oauth-client-id';

/**
 * Client ID mặc định (đã tạo sẵn trên Google Cloud Console) — Client ID KHÔNG phải bí mật, an toàn
 * khi để thẳng trong code phía client (bản thân Google cũng thiết kế để lộ ra trong mã nguồn/HTML
 * của mọi ứng dụng web công khai dùng OAuth). Nhờ có sẵn giá trị này, giáo viên không cần tự tạo/dán
 * Client ID nữa — phần cấu hình mặc định thu gọn, chỉ cần mở lại nếu muốn đổi sang Client ID khác.
 *
 * LƯU Ý: KHÔNG lưu Client SECRET ở đây (hay bất kỳ đâu trong code phía client) — luồng đăng nhập
 * đang dùng (Google Identity Services `initTokenClient`, chạy thẳng trên trình duyệt) không cần và
 * không dùng client secret; secret chỉ dành cho luồng server-side (đổi authorization code lấy
 * token trên server). Nhúng secret vào code chạy trên trình duyệt sẽ để lộ nó cho bất kỳ ai xem
 * mã nguồn trang/DevTools — không an toàn, dù dự án này chạy client-side.
 */
const DEFAULT_CLIENT_ID = '53472298241-pkpdjh465iam3and1om5r07n4buhdi4j.apps.googleusercontent.com';

export function GoogleFormExport({ examTitle, questions, disabled }: Props) {
  const [clientId, setClientId] = useState(() => localStorage.getItem(CLIENT_ID_STORAGE_KEY) ?? DEFAULT_CLIENT_ID);
  const [showConfig, setShowConfig] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedGoogleForm | null>(null);

  function handleClientIdChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setClientId(value);
    const trimmed = value.trim();
    if (trimmed) localStorage.setItem(CLIENT_ID_STORAGE_KEY, trimmed);
    else localStorage.removeItem(CLIENT_ID_STORAGE_KEY);
  }

  async function handleCreate() {
    setError(null);
    setResult(null);
    const trimmedClientId = clientId.trim();
    if (!trimmedClientId) {
      setError('Chưa nhập Google OAuth Client ID — mở phần cấu hình phía trên để nhập.');
      setShowConfig(true);
      return;
    }
    setIsCreating(true);
    try {
      const token = await requestGoogleAccessToken(trimmedClientId);
      const form = await createGoogleFormFromQuestions(examTitle, questions, token);
      setResult(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định khi tạo Google Form.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="google-form-export">
      <p className="field-hint">
        Tạo 1 Google Form dạng quiz (tự chấm điểm) từ các câu hỏi hợp lệ — giữ NGUYÊN thứ tự câu hỏi
        và đáp án như file gốc (không xáo, vì Form chỉ có 1 link duy nhất cho mọi người cùng làm).
      </p>
      <button type="button" className="link-button" onClick={() => setShowConfig((v) => !v)}>
        {showConfig ? '▾' : '▸'} Cấu hình Google OAuth Client ID {clientId ? '(đã lưu)' : '(chưa có)'}
      </button>
      {showConfig && (
        <div className="google-form-config">
          <p className="field-hint">
            Đã có sẵn Client ID (tạo trên Google Cloud Console) — chỉ cần đổi ở đây nếu bạn muốn dùng
            Client ID khác (vd chạy web này trên domain khác, cần khai domain đó vào "Authorized
            JavaScript origins" của Client ID mới trên Cloud Console trước). Giá trị nhập ở đây chỉ
            lưu trên trình duyệt của bạn (localStorage), không gửi đi đâu khác.
          </p>
          <label>
            Google OAuth Client ID
            <input
              type="text"
              value={clientId}
              onChange={handleClientIdChange}
              placeholder="xxxxxxxxxxxx.apps.googleusercontent.com"
            />
          </label>
        </div>
      )}
      <button onClick={handleCreate} disabled={disabled || isCreating}>
        {isCreating ? 'Đang tạo Form...' : 'Đăng nhập Google & Tạo Form'}
      </button>
      {disabled && <p className="field-hint">Sửa hết lỗi ở phần "Bước 3" phía trên trước khi xuất Google Form.</p>}
      {error && <p className="error-text">{error}</p>}
      {result && (
        <p className="success-text">
          Đã tạo Form thành công —{' '}
          <a href={result.editUrl} target="_blank" rel="noreferrer">
            mở để chỉnh sửa
          </a>{' '}
          |{' '}
          <a href={result.responderUri} target="_blank" rel="noreferrer">
            link cho sinh viên
          </a>
        </p>
      )}
    </section>
  );
}
