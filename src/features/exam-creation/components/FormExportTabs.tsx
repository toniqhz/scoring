import { useState } from 'react';
import { GoogleFormExport } from './GoogleFormExport';
import { MicrosoftFormExport } from './MicrosoftFormExport';
import type { Question } from '../../../types/question';

interface Props {
  fileBaseName: string;
  originalDocxBuffer: ArrayBuffer | null;
  questions: Question[];
  disabled: boolean;
}

type FormProvider = 'google' | 'microsoft';

export function FormExportTabs({ fileBaseName, originalDocxBuffer, questions, disabled }: Props) {
  const [provider, setProvider] = useState<FormProvider>('google');

  return (
    <div className="form-export-tabs">
      <div className="form-export-tab-bar">
        <button
          type="button"
          className={provider === 'google' ? 'active' : ''}
          onClick={() => setProvider('google')}
        >
          Google Form
        </button>
        <button
          type="button"
          className={provider === 'microsoft' ? 'active' : ''}
          onClick={() => setProvider('microsoft')}
        >
          Microsoft Forms
        </button>
      </div>
      {provider === 'google' ? (
        <GoogleFormExport formTitle={fileBaseName} questions={questions} disabled={disabled} />
      ) : (
        <MicrosoftFormExport
          fileBaseName={fileBaseName}
          originalDocxBuffer={originalDocxBuffer}
          questions={questions}
          disabled={disabled}
        />
      )}
    </div>
  );
}
