// apps/student/src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import ExamListPage from './pages/ExamListPage';
import ExamSessionPage from './pages/ExamSessionPage';
import SubmittedPage from './pages/SubmittedPage';
import ResultsListPage from './pages/ResultsListPage';
import ReviewPage from './pages/ReviewPage';
import CertificatePage from './pages/CertificatePage';
import MagicLinkPage from './pages/MagicLinkPage';
import AccessibilityToolbar from './components/AccessibilityToolbar';
import { useAccessibility } from './hooks/useAccessibility';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { fontSize, highContrast } = useAccessibility();
  return (
    <div style={{ fontSize: `${fontSize}px` }} className={highContrast ? 'high-contrast' : ''}>
      {children}
      <AccessibilityToolbar />
    </div>
  );
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        {/* Magic link — no auth required, validates token and redirects */}
        <Route path="/join/:token" element={<MagicLinkPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><ExamListPage /></PrivateRoute>} />
        <Route path="/exam/:sessionId" element={<PrivateRoute><ExamSessionPage /></PrivateRoute>} />
        <Route path="/submitted" element={<PrivateRoute><SubmittedPage /></PrivateRoute>} />
        <Route path="/results" element={<PrivateRoute><ResultsListPage /></PrivateRoute>} />
        <Route path="/results/:sessionId" element={<PrivateRoute><ReviewPage /></PrivateRoute>} />
        <Route path="/results/:sessionId/certificate" element={<PrivateRoute><CertificatePage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
