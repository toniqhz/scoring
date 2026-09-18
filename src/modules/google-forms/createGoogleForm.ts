import type { Question } from '../../types/question';

export interface CreatedGoogleForm {
  formId: string;
  /** Link giáo viên mở để chỉnh sửa Form. */
  editUrl: string;
  /** Link để chia sẻ cho sinh viên làm bài. */
  responderUri: string;
}

const FORMS_API_BASE = 'https://forms.googleapis.com/v1/forms';

async function callFormsApi(path: string, accessToken: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${FORMS_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Forms API lỗi (HTTP ${res.status}): ${text || res.statusText}`);
  }
  return res.json();
}

/** Câu hỏi hợp lệ để đưa vào Google Form — trùng điều kiện với usedQuestions trong generateVariants.ts
 * (đủ đáp án, đã xác định đáp án đúng), vì đây cũng là 1 dạng "xuất đề" cần dữ liệu sạch như nhau. */
export function isQuestionValidForExport(q: Question): boolean {
  return q.parseIssues.length === 0 && q.correctOptionId !== null;
}

/**
 * Tạo 1 Google Form dạng quiz (tự chấm điểm) từ danh sách câu hỏi — GIỮ NGUYÊN thứ tự câu hỏi và
 * thứ tự đáp án như trong file gốc, KHÔNG xáo (khác với bộ đề in giấy — Form chỉ có 1 link duy nhất
 * cho mọi người cùng làm nên không cần/không tạo được nhiều mã đề như bản in).
 */
export async function createGoogleFormFromQuestions(
  title: string,
  questions: Question[],
  accessToken: string,
): Promise<CreatedGoogleForm> {
  const validQuestions = questions.filter(isQuestionValidForExport);
  if (validQuestions.length === 0) {
    throw new Error('Không có câu hỏi hợp lệ nào để tạo Form.');
  }

  const created = await callFormsApi('', accessToken, { info: { title } });
  const formId = created.formId as string | undefined;
  const responderUri = created.responderUri as string | undefined;
  if (!formId || !responderUri) {
    throw new Error('Google Forms API không trả về formId/responderUri hợp lệ.');
  }

  const requests: unknown[] = [
    {
      updateSettings: {
        settings: { quizSettings: { isQuiz: true } },
        updateMask: 'quizSettings.isQuiz',
      },
    },
    ...validQuestions.map((q, index) => {
      const correctText = q.options.find((o) => o.id === q.correctOptionId)?.text ?? '';
      return {
        createItem: {
          item: {
            title: q.text,
            questionItem: {
              question: {
                required: true,
                grading: {
                  pointValue: 1,
                  correctAnswers: { answers: [{ value: correctText }] },
                },
                choiceQuestion: {
                  type: 'RADIO',
                  options: q.options.map((o) => ({ value: o.text })),
                },
              },
            },
          },
          location: { index },
        },
      };
    }),
  ];

  await callFormsApi(`/${formId}:batchUpdate`, accessToken, { requests });

  return { formId, editUrl: `https://docs.google.com/forms/d/${formId}/edit`, responderUri };
}
