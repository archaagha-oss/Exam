// apps/teacher/src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import QuestionBankPage from './pages/QuestionBankPage';
import ExamBuilderPage from './pages/ExamBuilderPage';
import ResultsPage from './pages/ResultsPage';
import PinsPage from './pages/PinsPage';
import LiveProctorPage from './pages/LiveProctorPage';
import SharedExamsPage from './pages/SharedExamsPage';
import GradingPage from './pages/GradingPage';
import AIGeneratorPage from './pages/AIGeneratorPage';
import SectionsPage from './pages/SectionsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import QTIImportPage from './pages/QTIImportPage';
import BlueprintPage from './pages/BlueprintPage';
import AnswerDistributionPage from './pages/AnswerDistributionPage';
import StudentProgressPage from './pages/StudentProgressPage';
import FeedbackPage from './pages/FeedbackPage';
import MagicLinksPage from './pages/MagicLinksPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/exams/:id/live"  element={<PrivateRoute><LiveProctorPage /></PrivateRoute>} />
      <Route path="/exams/:id/grade" element={<PrivateRoute><GradingPage /></PrivateRoute>} />
      <Route path="/exams/:id/feedback" element={<PrivateRoute><FeedbackPage /></PrivateRoute>} />
      <Route path="/exams/:id/magic-links" element={<PrivateRoute><MagicLinksPage /></PrivateRoute>} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="questions"                  element={<QuestionBankPage />} />
        <Route path="questions/ai"               element={<AIGeneratorPage />} />
        <Route path="questions/qti"              element={<QTIImportPage />} />
        <Route path="exams/new"                  element={<ExamBuilderPage />} />
        <Route path="exams/:id/edit"             element={<ExamBuilderPage />} />
        <Route path="exams/:id/sections"         element={<SectionsPage />} />
        <Route path="exams/:id/results"          element={<ResultsPage />} />
        <Route path="exams/:id/analytics"        element={<AnalyticsPage />} />
        <Route path="exams/:id/blueprint"        element={<BlueprintPage />} />
        <Route path="exams/:id/distribution"     element={<AnswerDistributionPage />} />
        <Route path="exams/:id/pins"             element={<PinsPage />} />
        <Route path="students/:studentId/progress" element={<StudentProgressPage />} />
        <Route path="shared"                     element={<SharedExamsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
