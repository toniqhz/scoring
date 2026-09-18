/**
 * Đăng nhập Google ngay trên trình duyệt (Google Identity Services — GIS), không cần backend: xin
 * 1 access token có quyền tạo/sửa Google Form (scope forms.body), dùng trực tiếp để gọi REST API
 * forms.googleapis.com từ phía client. Yêu cầu giáo viên đã tự tạo OAuth Client ID riêng (Google
 * Cloud Console) và khai đúng domain đang chạy web này làm "Authorized JavaScript origin" — bước đó
 * KHÔNG thể làm thay qua code, phải làm thủ công 1 lần trên tài khoản Google của họ.
 */

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const FORMS_SCOPE = 'https://www.googleapis.com/auth/forms.body';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoogleGlobal = any;

let gisLoadPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Không tải được thư viện đăng nhập Google — kiểm tra kết nối mạng rồi thử lại.'));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

/** Mở popup đăng nhập/cấp quyền Google, trả về access token (scope forms.body) khi thành công. */
export async function requestGoogleAccessToken(clientId: string): Promise<string> {
  await loadGisScript();
  const google = (window as unknown as { google?: GoogleGlobal }).google;
  if (!google?.accounts?.oauth2) {
    throw new Error('Thư viện đăng nhập Google chưa sẵn sàng — thử lại sau vài giây.');
  }

  return new Promise<string>((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: FORMS_SCOPE,
      callback: (response: { access_token?: string; error?: string }) => {
        if (response.error || !response.access_token) {
          reject(new Error(`Đăng nhập Google thất bại: ${response.error ?? 'không nhận được access token'}.`));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (err: { message?: string; type?: string }) => {
        reject(new Error(err?.message || 'Đăng nhập Google bị hủy hoặc thất bại.'));
      },
    });
    tokenClient.requestAccessToken();
  });
}
