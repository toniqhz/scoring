import { Suspense, lazy, useEffect, useState } from 'react';
import { ExamCreationPage } from './features/exam-creation/ExamCreationPage';
import { ThemeToggle } from './components/ThemeToggle';
import { applyTheme, getStoredTheme, getSystemTheme, type ThemeMode } from './lib/theme';
import './App.css';

const GradingPage = lazy(() => import('./features/grading/GradingPage').then((m) => ({ default: m.GradingPage })));

type Tab = 'create' | 'grade';

function App() {
  const [tab, setTab] = useState<Tab>('create');
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme() ?? getSystemTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-top">
          <h1>Hệ thống trộn đề &amp; chấm thi trắc nghiệm</h1>
          <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
        </div>
        <nav className="app-tabs">
          <button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>
            1. Tạo đề
          </button>
          <button className={tab === 'grade' ? 'active' : ''} onClick={() => setTab('grade')}>
            2. Chấm bài
          </button>
        </nav>
      </header>
      <main>
        {tab === 'create' && <ExamCreationPage />}
        {tab === 'grade' && (
          <Suspense fallback={<p style={{ padding: 24 }}>Đang tải...</p>}>
            <GradingPage />
          </Suspense>
        )}
      </main>
    </div>
  );
}

export default App;
